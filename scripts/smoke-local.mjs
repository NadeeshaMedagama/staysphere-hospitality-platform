#!/usr/bin/env node
/**
 * Drives a full hotel lifecycle across every running service.
 *
 *   pnpm smoke
 *
 * Assumes the stack is already up (`pnpm dev`) and seeded (`pnpm db:seed`).
 * Point it elsewhere with API_URL to smoke-test a deployed environment.
 *
 * This exists because unit tests, E2E tests and a green build together still
 * missed nine wiring bugs that only appeared when the services actually talked
 * to each other: a guard that was never registered, a principal nobody read, a
 * proxy targeting the wrong prefix. Every check below covers one of those seams.
 */
const API = process.env.API_URL ?? 'http://127.0.0.1:3000/api/v1';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'StaySphere-Dev-2026!';
let pass = 0, fail = 0;

const tokens = {};
async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(`login ${email}: ${JSON.stringify(j.error)}`);
  return j.data.tokens.accessToken;
}

async function call(method, path, { token, body, headers = {} } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await r.json(); } catch { /* empty body */ }
  return { status: r.status, json };
}

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}${detail ? '  ' + detail : ''}`); }
  else    { fail++; console.log(`  ✗ ${label}${detail ? '  ' + detail : ''}`); }
}

console.log('▸ Signing in');
for (const who of ['guest@example.com', 'reception@staysphere.local', 'housekeeping@staysphere.local',
                   'maintenance@staysphere.local', 'finance@staysphere.local', 'admin@staysphere.local']) {
  tokens[who] = await login(who);
}
check('six roles authenticated', Object.keys(tokens).length === 6);

const guest = tokens['guest@example.com'];
const desk = tokens['reception@staysphere.local'];
const hk = tokens['housekeeping@staysphere.local'];
const eng = tokens['maintenance@staysphere.local'];
const fin = tokens['finance@staysphere.local'];
const admin = tokens['admin@staysphere.local'];

console.log('\n▸ hotel-service');
const hotels = await call('GET', '/hotels');
const hotel = hotels.json.data[0];
check('public hotel listing', hotels.status === 200 && hotel.name === 'Seaside Grand', `${hotel.city} ${hotel.starRating}★`);
const bySlug = await call('GET', `/hotels/by-slug/${hotel.slug}`);
check('lookup by slug', bySlug.status === 200, bySlug.json?.data?.slug);
const manage = await call('GET', '/hotels/manage', { token: admin });
check('staff management list', manage.status === 200);
check('guest denied management list', (await call('GET', '/hotels/manage', { token: guest })).status === 403);

console.log('\n▸ room-service');
const board = await call('GET', `/rooms/board?hotelId=${hotel.id}`, { token: desk });
const floors = board.json?.data ?? [];
const rooms = floors.reduce((n, f) => n + f.rooms.length, 0);
check('floor board', board.status === 200 && rooms === 62, `${floors.length} floors, ${rooms} rooms`);
check('guest denied floor board', (await call('GET', `/rooms/board?hotelId=${hotel.id}`, { token: guest })).status === 403);

console.log('\n▸ pricing-service');
const quote = await call('GET', `/rates/quote?hotelId=${hotel.id}&roomTypeId=DELUXE&occupancy=0.9&leadTimeDays=2`);
check('public demand quote', quote.status === 200,
  `base ${quote.json?.data?.baseRate?.amountMinor} → ${quote.json?.data?.nightlyRate?.amountMinor} minor`);
const plan = await call('GET', `/rates/plans/${hotel.id}/SUITE`, { token: desk });
check('staff rate plan', plan.status === 200, `${plan.json?.data?.seasons?.length} seasons`);

console.log('\n▸ booking-service');
const avail = await call('GET', `/bookings/availability?hotelId=${hotel.id}&roomTypeId=DELUXE&checkIn=2027-03-05&checkOut=2027-03-08&adults=2`);
check('availability + quote', avail.status === 200 && avail.json.data.available,
  `${avail.json.data.roomsLeft} rooms, total ${avail.json.data.quote.total.amountMinor} minor`);
const created = await call('POST', '/bookings', {
  token: guest,
  headers: { 'idempotency-key': `full-stack-${Date.now()}` },
  body: { hotelId: hotel.id, roomTypeId: 'DELUXE', checkIn: '2027-03-05', checkOut: '2027-03-08',
          adults: 2, guestName: 'Full Stack Check', guestEmail: 'guest@example.com' },
});
check('booking created', created.status === 201, created.json?.data?.reference);
const booking = created.json.data;

console.log('\n▸ payment-service');
const payment = await call('POST', '/payments', {
  token: guest,
  headers: { 'idempotency-key': `pay-${Date.now()}` },
  body: { bookingId: booking.id, hotelId: hotel.id, amountMinor: booking.quote.total.amountMinor,
          currency: 'USD', provider: 'CASH', method: 'CASH', captureImmediately: true },
});
check('payment captured', payment.status === 201, `${payment.json?.data?.status} ${payment.json?.data?.capturedMinor} minor`);
const refund = await call('POST', `/payments/${payment.json.data.id}/refund`, {
  token: fin, headers: { 'idempotency-key': `rf-${Date.now()}` },
  body: { amountMinor: 999999, reason: 'OVERCHARGE' },
});
check('over-refund rejected', refund.status === 409, refund.json?.error?.code);

console.log('\n▸ stay-service');
const stay = await call('POST', '/stays/check-in', {
  token: desk,
  body: { bookingId: booking.id, hotelId: hotel.id, customerId: 'usr_guest', roomId: 'rm-check',
          roomNumber: '305', guestNames: ['Full Stack Check'], adults: 2,
          expectedCheckOut: '2027-03-08T11:00:00.000Z', currency: 'USD',
          roomChargeMinor: booking.quote.total.amountMinor },
});
check('check-in', stay.status === 201, stay.json?.data?.id ? `stay ${stay.json.data.id.slice(0, 12)}` : JSON.stringify(stay.json?.error));
if (stay.status === 201) {
  const folio = await call('GET', `/stays/${stay.json.data.id}/folio`, { token: desk });
  check('folio balance', folio.status === 200,
    `due ${folio.json?.data?.balance?.balanceDue?.amountMinor} minor`);
  const out = await call('POST', `/stays/${stay.json.data.id}/check-out`, {
    token: desk, body: { settlementMinor: booking.quote.total.amountMinor, allowUnsettled: false },
  });
  check('check-out settles the folio', out.status === 200, out.json?.data?.stay?.status);
}

console.log('\n▸ housekeeping-service');
const task = await call('POST', '/housekeeping/tasks', {
  token: hk,
  body: { hotelId: hotel.id, roomId: 'rm-check', roomNumber: '305', floor: 3,
          type: 'CHECKOUT_CLEAN', nextArrivalAt: new Date(Date.now() + 3600_000).toISOString(), vip: false },
});
check('cleaning task queued', task.status === 201, `priority ${task.json?.data?.priority}`);
check('priority escalated by imminent arrival', task.json?.data?.priority === 'CRITICAL');
const hkBoard = await call('GET', `/housekeeping/board?hotelId=${hotel.id}`, { token: hk });
check('housekeeping board', hkBoard.status === 200, `${hkBoard.json?.data?.length} open`);

console.log('\n▸ maintenance-service');
const ticket = await call('POST', '/maintenance/tickets', {
  token: eng,
  body: { hotelId: hotel.id, roomId: 'rm-check', roomNumber: '305', category: 'HVAC_FAILURE',
          summary: 'Air conditioning not cooling', roomOccupied: true },
});
check('ticket triaged', ticket.status === 201, `${ticket.json?.data?.priority}, offline=${ticket.json?.data?.takesRoomOffline}`);
check('occupied room escalates to CRITICAL', ticket.json?.data?.priority === 'CRITICAL');
const mSummary = await call('GET', `/maintenance/summary?hotelId=${hotel.id}`, { token: eng });
check('maintenance summary', mSummary.status === 200, `${mSummary.json?.data?.open} open, ${mSummary.json?.data?.roomsOffline} rooms offline`);

console.log('\n▸ review-service');
const rating = await call('GET', `/reviews/rating?hotelId=${hotel.id}`);
check('public rating', rating.status === 200, `${rating.json?.data?.reviewCount} reviews`);
const queue = await call('GET', '/reviews/moderation-queue', { token: admin });
check('moderation queue is staff-only', queue.status === 200);
check('guest denied moderation queue', (await call('GET', '/reviews/moderation-queue', { token: guest })).status === 403);

console.log('\n▸ notification-service');
const inbox = await call('GET', '/notifications', { token: guest });
check('notification inbox', inbox.status === 200, `${inbox.json?.data?.length ?? 0} items`);

console.log('\n▸ finance-service');
const revenue = await call('GET', `/invoices/revenue?hotelId=${hotel.id}`, { token: fin });
check('revenue summary', revenue.status === 200, `${revenue.json?.data?.invoices} invoices`);
check('guest denied revenue', (await call('GET', `/invoices/revenue?hotelId=${hotel.id}`, { token: guest })).status === 403);

console.log('\n▸ reporting-service');
const today = await call('GET', `/reports/today?hotelId=${hotel.id}`, { token: admin });
check('today snapshot', today.status === 200, `occupancy ${today.json?.data?.occupancyPct}%`);
const perf = await call('GET', `/reports/performance?hotelId=${hotel.id}&from=2026-01-01&to=2026-12-31`, { token: admin });
check('KPI performance', perf.status === 200, `ADR ${perf.json?.data?.current?.adr?.amountMinor} RevPAR ${perf.json?.data?.current?.revpar?.amountMinor}`);

console.log('\n▸ audit-service');
const audit = await call('POST', '/audit', {
  token: admin,
  body: { action: 'full-stack.check', resource: 'verification', resourceId: 'run-1',
          before: { rate: 10000, passwordHash: 'old-secret' }, after: { rate: 12500, passwordHash: 'new-secret' } },
});
check('audit entry recorded', audit.status === 201);
const changes = audit.json?.data?.changes ?? [];
const secretLeaked = JSON.stringify(changes).includes('secret');
check('secret redacted in the trail', !secretLeaked, JSON.stringify(changes));
const trail = await call('GET', '/audit?resource=verification', { token: admin });
check('audit searchable', trail.status === 200, `${trail.json?.data?.length} entries`);
check('guest denied the audit log', (await call('GET', '/audit', { token: guest })).status === 403);

console.log('\n▸ cleaning up');
const cancelled = await call('POST', `/bookings/${booking.id}/cancel`, {
  token: guest, body: { reason: 'full stack verification' },
});
check('booking cancelled', cancelled.status === 200, cancelled.json?.data?.policy);

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
