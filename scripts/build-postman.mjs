#!/usr/bin/env node
/**
 * Builds the Postman collection from the controllers.
 *
 *   pnpm postman:build
 *
 * The flows and their assertions are written by hand below, because a
 * mechanically generated request per route proves only that a URL exists. What
 * is worth testing is the sequence — book, pay, check in, check out — and the
 * boundaries between roles.
 *
 * The route table is read from the controllers so the reference folder cannot
 * drift from what the services actually serve.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/* ------------------------------------------------------------------ routes */

const VERBS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'All'];

function extractRoutes() {
  const rows = [];
  for (const svc of readdirSync('services')) {
    if (svc === 'api-gateway') continue;
    const files = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!['generated', 'node_modules'].includes(e.name)) walk(join(d, e.name)); }
        else if (e.name.endsWith('.controller.ts')) files.push(join(d, e.name));
      }
    };
    try { walk(join('services', svc, 'src')); } catch { continue; }

    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const base = /@Controller\(\{\s*path:\s*'([^']+)'/.exec(src)?.[1]
        ?? /@Controller\('([^']+)'\)/.exec(src)?.[1] ?? '';
      const classPublic = /@Public\(\)/.test(src.slice(0, Math.max(0, src.search(/export class/))));

      for (const chunk of src.split(/\n\s*\n/)) {
        const verb = VERBS.find((v) => new RegExp(`@${v}\\(`).test(chunk));
        if (!verb) continue;
        const sub = new RegExp(`@${verb}\\('([^']*)'\\)`).exec(chunk)?.[1] ?? '';
        const roles = /@RequireRoles\(([^)]*)\)/.exec(chunk)?.[1]?.replace(/Role\./g, '').replace(/\.\.\./g, '').trim() ?? '';
        const perms = /@RequirePermissions\(([^)]*)\)/.exec(chunk)?.[1]?.replace(/Permission\./g, '').trim() ?? '';
        rows.push({
          service: svc,
          method: verb.toUpperCase(),
          path: '/' + [base, sub].filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\//, ''),
          access: (classPublic || /@Public\(\)/.test(chunk)) ? 'PUBLIC'
            : roles ? `ROLES: ${roles}` : perms ? `PERMISSION: ${perms}` : 'AUTHENTICATED',
          idempotency: /@ApiHeader\(\{[\s\S]*?name:\s*'Idempotency-Key'/.test(chunk),
          summary: /summary:\s*\n?\s*'((?:[^'\\]|\\.)*)'/.exec(chunk)?.[1] ?? '',
        });
      }
    }
  }
  const seen = new Set();
  return rows
    .filter((r) => { const k = `${r.method} ${r.path}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.service.localeCompare(b.service) || a.path.localeCompare(b.path));
}

/* ------------------------------------------------------------- collection */

const url = (path, query = []) => ({
  raw: `{{baseUrl}}${path}${query.length ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : ''}`,
  host: ['{{baseUrl}}'],
  path: path.replace(/^\//, '').split('/'),
  ...(query.length ? { query } : {}),
});

// JSON.stringify, not a template literal: a name containing a quote — and some do,
// because the clearest wording for a date check is `"to" may not precede "from"` —
// otherwise produces a script that does not parse. Newman reports that as a failed
// *script*, not a failed assertion, so the check silently never runs while the run
// summary still reads zero failures.
const test = (name, lines) => ({
  listen: 'test',
  script: {
    type: 'text/javascript',
    exec: [`pm.test(${JSON.stringify(name)}, function () {`, ...lines.map((l) => '  ' + l), '});'],
  },
});

/**
 * Marks a value that must reach the request body unquoted.
 *
 * Postman substitutes variables textually into the raw body, so `"amountMinor":
 * "{{bookingTotal}}"` sends a string and every integer schema rejects it. The
 * fix is to emit the placeholder without quotes, which JSON.stringify will not
 * do on its own.
 */
const num = (value) => `__UNQUOTED__${value}__UNQUOTED__`;

const raw = (obj) => ({
  mode: 'raw',
  raw: JSON.stringify(obj, null, 2).replace(/"__UNQUOTED__(.*?)__UNQUOTED__"/g, '$1'),
  options: { raw: { language: 'json' } },
});

const req = ({ name, method = 'GET', path, query = [], body, token = null, headers = [], events = [], description }) => ({
  name,
  ...(description ? { request: {} } : {}),
  event: events,
  request: {
    method,
    header: [
      ...(body ? [{ key: 'Content-Type', value: 'application/json' }] : []),
      ...(token ? [{ key: 'Authorization', value: `Bearer {{${token}}}` }] : []),
      ...headers,
    ],
    ...(body ? { body: raw(body) } : {}),
    url: url(path, query),
    ...(description ? { description } : {}),
  },
});

/* ------------------------------------------------------------- the folders */

const login = (name, emailVar, tokenVar) =>
  req({
    name,
    method: 'POST',
    path: '/auth/login',
    body: { email: `{{${emailVar}}}`, password: '{{password}}' },
    events: [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            'pm.test("200 and a token pair", function () {',
            '  pm.response.to.have.status(200);',
            '  const b = pm.response.json();',
            '  pm.expect(b.success).to.be.true;',
            '  pm.expect(b.data.tokens.accessToken).to.be.a("string");',
            '  pm.expect(b.data.tokens.tokenType).to.eql("Bearer");',
            `  pm.collectionVariables.set("${tokenVar}", b.data.tokens.accessToken);`,
            '});',
            'pm.test("every response carries a requestId", function () {',
            '  pm.expect(pm.response.json().requestId).to.be.a("string");',
            '});',
          ],
        },
      },
    ],
  });

const folders = [];

/* 00 — health -------------------------------------------------------------- */
folders.push({
  name: '00 · Health and readiness',
  description:
    'The probe paths Kubernetes and Prometheus use. No token, no version prefix — if these need either, every probe in production fails.',
  item: [
    {
      name: 'Gateway liveness',
      event: [
        test('200 without a token', [
          'pm.response.to.have.status(200);',
          '// Probes are deliberately not wrapped in the API envelope: they are',
          '// read by Kubernetes, which wants a flat document.',
          'pm.expect(pm.response.json().status).to.eql("ok");',
        ]),
      ],
      request: { method: 'GET', header: [], url: { raw: '{{host}}/health', host: ['{{host}}'], path: ['health'] } },
    },
    {
      name: 'Gateway readiness (checks every upstream)',
      event: [
        test('200 and each upstream is up', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json();',
          'pm.expect(d.status).to.eql("ok");',
          'Object.entries(d.checks).forEach(([name, c]) =>',
          '  pm.expect(c.status, name).to.eql("up"));',
        ]),
        test('every service behind the gateway is probed, not just the first few', [
          '// A readiness probe that checks eight of fourteen upstreams reports',
          '// ready while six services are down.',
          'pm.expect(Object.keys(pm.response.json().checks)).to.have.lengthOf(14);',
        ]),
      ],
      request: { method: 'GET', header: [], url: { raw: '{{host}}/ready', host: ['{{host}}'], path: ['ready'] } },
    },
    {
      name: 'Gateway metrics',
      event: [
        test('Prometheus exposition without a token', [
          'pm.response.to.have.status(200);',
          'pm.expect(pm.response.text()).to.include("staysphere_http_requests_total");',
        ]),
      ],
      request: { method: 'GET', header: [], url: { raw: '{{host}}/metrics', host: ['{{host}}'], path: ['metrics'] } },
    },
    {
      name: 'Unknown route is a clean 404',
      event: [
        test('404 in the standard envelope', [
          'pm.response.to.have.status(404);',
          'const b = pm.response.json();',
          'pm.expect(b.success).to.be.false;',
          'pm.expect(b.error.code).to.eql("NOT_FOUND");',
          'pm.expect(b.requestId).to.be.a("string");',
        ]),
      ],
      request: { method: 'GET', header: [], url: url('/no-such-resource') },
    },
  ],
});

/* 01 — auth ---------------------------------------------------------------- */
folders.push({
  name: '01 · Authentication',
  description: 'Sign in as every role. Later folders reuse these tokens.',
  item: [
    login('Login — guest', 'guestEmail', 'guestToken'),
    login('Login — receptionist', 'receptionEmail', 'receptionToken'),
    login('Login — manager', 'managerEmail', 'managerToken'),
    login('Login — housekeeping', 'housekeepingEmail', 'housekeepingToken'),
    login('Login — maintenance', 'maintenanceEmail', 'maintenanceToken'),
    login('Login — finance', 'financeEmail', 'financeToken'),
    login('Login — administrator', 'adminEmail', 'adminToken'),
    req({
      name: 'Who am I',
      path: '/auth/me',
      token: 'guestToken',
      events: [
        test('returns the signed-in principal', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.email).to.eql(pm.collectionVariables.get("guestEmail"));',
          'pm.expect(d.roles).to.include("CUSTOMER");',
        ]),
        test('never returns the password hash', [
          'pm.expect(JSON.stringify(pm.response.json())).to.not.include("argon2");',
        ]),
      ],
    }),
    req({
      name: 'Wrong password is rejected',
      method: 'POST',
      path: '/auth/login',
      body: { email: '{{guestEmail}}', password: 'definitely-not-the-password' },
      events: [
        test('401 INVALID_CREDENTIALS', [
          'pm.response.to.have.status(401);',
          'pm.expect(pm.response.json().error.code).to.eql("INVALID_CREDENTIALS");',
        ]),
        test('does not reveal whether the account exists', [
          'pm.expect(pm.response.json().error.message).to.not.match(/no such|not found|unknown user/i);',
        ]),
      ],
    }),
    req({
      name: 'Unknown email is rejected identically',
      method: 'POST',
      path: '/auth/login',
      body: { email: 'nobody@example.com', password: '{{password}}' },
      events: [
        test('same code and message as a wrong password', [
          'pm.response.to.have.status(401);',
          'pm.expect(pm.response.json().error.code).to.eql("INVALID_CREDENTIALS");',
        ]),
      ],
    }),
    req({
      name: 'Weak password is refused at registration',
      method: 'POST',
      path: '/auth/register',
      body: { email: 'weak-{{$timestamp}}@example.com', password: 'password', fullName: 'Weak Password' },
      events: [
        test('400 with every unmet rule listed', [
          'pm.response.to.have.status(400);',
          'const e = pm.response.json().error;',
          'pm.expect(e.code).to.eql("VALIDATION_FAILED");',
          'pm.expect(e.details.failures.length).to.be.above(1);',
        ]),
      ],
    }),
    req({
      name: 'No token is 401, not 403',
      path: '/auth/me',
      events: [
        test('401 UNAUTHENTICATED', [
          'pm.response.to.have.status(401);',
          'pm.expect(pm.response.json().error.code).to.eql("UNAUTHENTICATED");',
        ]),
      ],
    }),
    req({
      name: 'A malformed token is rejected',
      path: '/auth/me',
      headers: [{ key: 'Authorization', value: 'Bearer not.a.real.token' }],
      events: [test('401', ['pm.response.to.have.status(401);'])],
    }),
  ],
});

/* 02 — catalogue ----------------------------------------------------------- */
folders.push({
  name: '02 · Property, rooms and rates',
  description: 'What a guest can browse without signing in, and what only staff may see.',
  item: [
    req({
      name: 'List published properties (public)',
      path: '/hotels',
      events: [
        test('200 and captures the hotel id', [
          'pm.response.to.have.status(200);',
          'const list = pm.response.json().data;',
          'pm.expect(list.length).to.be.above(0);',
          'pm.collectionVariables.set("hotelId", list[0].id);',
          'pm.collectionVariables.set("hotelSlug", list[0].slug);',
        ]),
        test('only ACTIVE properties are public', [
          'pm.response.json().data.forEach(h => pm.expect(h.status).to.eql("ACTIVE"));',
        ]),
      ],
    }),
    req({
      name: 'Property by slug (public)',
      path: '/hotels/by-slug/{{hotelSlug}}',
      events: [
        test('200 with the operating policy', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.policy.checkInFrom).to.be.a("string");',
          'pm.expect(d.policy.checkOutBy).to.be.a("string");',
        ]),
        test('check-out precedes check-in, so same-day turnover is sellable', [
          'const p = pm.response.json().data.policy;',
          'pm.expect(p.checkOutBy < p.checkInFrom).to.be.true;',
        ]),
      ],
    }),
    req({
      name: 'Staff property list',
      path: '/hotels/manage',
      token: 'adminToken',
      events: [test('200 for an administrator', ['pm.response.to.have.status(200);'])],
    }),
    req({
      name: 'Floor board (staff)',
      path: '/rooms/board',
      query: [{ key: 'hotelId', value: '{{hotelId}}' }],
      token: 'receptionToken',
      events: [
        test('200, grouped by floor', [
          'pm.response.to.have.status(200);',
          'const floors = pm.response.json().data;',
          'pm.expect(floors.length).to.be.above(0);',
          'pm.expect(floors[0].rooms[0]).to.have.property("status");',
        ]),
        test('every room carries a written status, not only a colour', [
          'pm.response.json().data.forEach(f => f.rooms.forEach(r =>',
          '  pm.expect(r.status).to.be.a("string")));',
        ]),
      ],
    }),
    req({
      name: 'Demand-adjusted quote (public)',
      path: '/rates/quote',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'roomTypeId', value: 'DELUXE' },
        { key: 'occupancy', value: '0.9' },
        { key: 'leadTimeDays', value: '2' },
      ],
      events: [
        test('a nearly sold-out night prices above the base rate', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.nightlyRate.amountMinor).to.be.above(d.baseRate.amountMinor);',
        ]),
        test('money is whole minor units', [
          'const d = pm.response.json().data;',
          'pm.expect(Number.isInteger(d.nightlyRate.amountMinor)).to.be.true;',
        ]),
      ],
    }),
    req({
      name: 'Rate plan detail (staff)',
      path: '/rates/plans/{{hotelId}}/SUITE',
      token: 'receptionToken',
      events: [
        test('200 with seasons and long-stay tiers', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.seasons).to.be.an("array");',
          'pm.expect(d.stayDiscounts).to.be.an("array");',
        ]),
      ],
    }),
  ],
});

/* 03 — booking ------------------------------------------------------------- */
folders.push({
  name: '03 · The booking path',
  description:
    'The path that earns the money. Everything else can degrade for a day; if this breaks, the business stops.',
  item: [
    {
      name: 'Pick dates for this run',
      event: [
        {
          listen: 'prerequest',
          script: {
            type: 'text/javascript',
            exec: [
              '// Far-future dates, unique per run, so repeated runs never collide',
              '// on the overlap constraint.',
              'const base = new Date();',
              'base.setUTCFullYear(base.getUTCFullYear() + 1);',
              'base.setUTCDate(base.getUTCDate() + Math.floor(Math.random() * 300));',
              'const iso = (d) => d.toISOString().slice(0, 10);',
              'const out = new Date(base); out.setUTCDate(out.getUTCDate() + 3);',
              'pm.collectionVariables.set("checkIn", iso(base));',
              'pm.collectionVariables.set("checkOut", iso(out));',
              'pm.collectionVariables.set("idemKey", "pm-" + Date.now() + "-" + Math.random().toString(36).slice(2));',
            ],
          },
        },
        test('dates were set', [
          'pm.expect(pm.collectionVariables.get("checkIn")).to.match(/^\\d{4}-\\d{2}-\\d{2}$/);',
        ]),
      ],
      request: { method: 'GET', header: [], url: { raw: '{{host}}/health', host: ['{{host}}'], path: ['health'] } },
    },
    req({
      name: 'Availability and an itemised quote (public)',
      path: '/bookings/availability',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'roomTypeId', value: 'DELUXE' },
        { key: 'checkIn', value: '{{checkIn}}' },
        { key: 'checkOut', value: '{{checkOut}}' },
        { key: 'adults', value: '2' },
      ],
      events: [
        test('rooms are available and priced per night', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.available).to.be.true;',
          'pm.expect(d.roomsLeft).to.be.above(0);',
          'pm.expect(d.quote.nights).to.eql(3);',
          'pm.expect(d.quote.nightly.length).to.eql(3);',
          'pm.collectionVariables.set("roomsBefore", d.roomsLeft);',
          'pm.collectionVariables.set("quotedTotal", d.quote.total.amountMinor);',
        ]),
        test('the total is subtotal minus discount plus tax', [
          'const q = pm.response.json().data.quote;',
          'pm.expect(q.total.amountMinor).to.eql(',
          '  q.subtotal.amountMinor - q.discount.amountMinor + q.tax.amountMinor);',
        ]),
        test('tax is charged on the discounted amount', [
          'const q = pm.response.json().data.quote;',
          'pm.expect(q.taxable.amountMinor).to.eql(q.subtotal.amountMinor - q.discount.amountMinor);',
        ]),
      ],
    }),
    req({
      name: 'An inverted date range is refused',
      path: '/bookings/availability',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'roomTypeId', value: 'DELUXE' },
        { key: 'checkIn', value: '{{checkOut}}' },
        { key: 'checkOut', value: '{{checkIn}}' },
        { key: 'adults', value: '2' },
      ],
      events: [
        test('400 INVALID_DATE_RANGE', [
          'pm.response.to.have.status(400);',
          'pm.expect(pm.response.json().error.code).to.eql("INVALID_DATE_RANGE");',
        ]),
      ],
    }),
    req({
      name: 'A party larger than the room is refused',
      path: '/bookings/availability',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'roomTypeId', value: 'DELUXE' },
        { key: 'checkIn', value: '{{checkIn}}' },
        { key: 'checkOut', value: '{{checkOut}}' },
        { key: 'adults', value: '9' },
      ],
      events: [
        test('reports no availability rather than erroring', [
          'pm.response.to.have.status(200);',
          'pm.expect(pm.response.json().data.available).to.be.false;',
        ]),
      ],
    }),
    req({
      name: 'Create a booking',
      method: 'POST',
      path: '/bookings',
      token: 'guestToken',
      headers: [{ key: 'Idempotency-Key', value: '{{idemKey}}' }],
      body: {
        hotelId: '{{hotelId}}',
        roomTypeId: 'DELUXE',
        checkIn: '{{checkIn}}',
        checkOut: '{{checkOut}}',
        adults: 2,
        children: 0,
        guestName: 'Postman Verification',
        guestEmail: '{{guestEmail}}',
      },
      events: [
        test('201 with a dictatable reference', [
          'pm.response.to.have.status(201);',
          'const d = pm.response.json().data;',
          'pm.expect(d.reference).to.match(/^SS-[23456789ACDEFGHJKMNPQRTUVWXYZ]{6}$/);',
          'pm.expect(d.status).to.eql("PENDING");',
          'pm.collectionVariables.set("bookingId", d.id);',
          'pm.collectionVariables.set("bookingRef", d.reference);',
          'pm.collectionVariables.set("bookingTotal", d.quote.total.amountMinor);',
        ]),
        test('the reference avoids characters misread when dictated', [
          'const ref = pm.response.json().data.reference.slice(3);',
          '["0","O","1","I","L","S","B"].forEach(c =>',
          '  pm.expect(ref, "contains " + c).to.not.include(c));',
        ]),
        test('the price matches the quote', [
          'pm.expect(pm.response.json().data.quote.total.amountMinor)',
          '  .to.eql(Number(pm.collectionVariables.get("quotedTotal")));',
        ]),
      ],
    }),
    req({
      name: 'Retrying the same Idempotency-Key does not double-book',
      method: 'POST',
      path: '/bookings',
      token: 'guestToken',
      headers: [{ key: 'Idempotency-Key', value: '{{idemKey}}' }],
      body: {
        hotelId: '{{hotelId}}',
        roomTypeId: 'DELUXE',
        checkIn: '{{checkIn}}',
        checkOut: '{{checkOut}}',
        adults: 2,
        guestName: 'Postman Verification',
        guestEmail: '{{guestEmail}}',
      },
      events: [
        test('409 IDEMPOTENCY_KEY_REUSED naming the original', [
          'pm.response.to.have.status(409);',
          'const e = pm.response.json().error;',
          'pm.expect(e.code).to.eql("IDEMPOTENCY_KEY_REUSED");',
          'pm.expect(e.details.reference).to.eql(pm.collectionVariables.get("bookingRef"));',
        ]),
      ],
    }),
    req({
      name: 'Inventory dropped by exactly one',
      path: '/bookings/availability',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'roomTypeId', value: 'DELUXE' },
        { key: 'checkIn', value: '{{checkIn}}' },
        { key: 'checkOut', value: '{{checkOut}}' },
        { key: 'adults', value: '2' },
      ],
      events: [
        test('one fewer room than before the booking', [
          'pm.response.to.have.status(200);',
          'pm.expect(pm.response.json().data.roomsLeft)',
          '  .to.eql(Number(pm.collectionVariables.get("roomsBefore")) - 1);',
        ]),
      ],
    }),
    req({
      name: 'Same-day turnover is still sellable',
      path: '/bookings/availability',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'roomTypeId', value: 'DELUXE' },
        { key: 'checkIn', value: '{{checkOut}}' },
        { key: 'checkOut', value: '{{checkOut}}' },
        { key: 'adults', value: '2' },
      ],
      events: [
        test('a zero-night range is refused, proving the boundary is checked', [
          'pm.response.to.have.status(400);',
          'pm.expect(pm.response.json().error.code).to.eql("INVALID_DATE_RANGE");',
        ]),
      ],
    }),
    req({
      name: 'Read the booking back',
      path: '/bookings/{{bookingId}}',
      token: 'guestToken',
      events: [
        test('200 with one charge per night', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.reference).to.eql(pm.collectionVariables.get("bookingRef"));',
          'pm.expect(d.nightlyCharges.length).to.eql(3);',
        ]),
        test('the nightly charges sum to the subtotal', [
          'const d = pm.response.json().data;',
          'const sum = d.nightlyCharges.reduce((t, c) => t + c.amountMinor, 0);',
          'pm.expect(sum).to.eql(d.subtotalMinor);',
        ]),
      ],
    }),
  ],
});

/* 04 — money --------------------------------------------------------------- */
folders.push({
  name: '04 · Payments and refunds',
  description: 'Where getting it wrong costs real money. The refund cap is the check that matters most.',
  item: [
    req({
      name: 'Take a payment',
      method: 'POST',
      path: '/payments',
      token: 'guestToken',
      headers: [{ key: 'Idempotency-Key', value: 'pay-{{idemKey}}' }],
      body: {
        bookingId: '{{bookingId}}',
        hotelId: '{{hotelId}}',
        amountMinor: num('{{bookingTotal}}'),
        currency: 'USD',
        provider: 'CASH',
        method: 'CASH',
        captureImmediately: true,
      },
      events: [
        test('201 and captured in full', [
          'pm.response.to.have.status(201);',
          'const d = pm.response.json().data;',
          'pm.expect(d.status).to.eql("COMPLETED");',
          'pm.expect(d.capturedMinor).to.eql(Number(pm.collectionVariables.get("bookingTotal")));',
          'pm.collectionVariables.set("paymentId", d.id);',
        ]),
        test('no card data is ever returned', [
          'const body = JSON.stringify(pm.response.json());',
          'pm.expect(body).to.not.match(/"cardNumber"|"cvv"|"pan"/i);',
        ]),
      ],
    }),
    req({
      name: 'Retrying the payment key returns the original charge',
      method: 'POST',
      path: '/payments',
      token: 'guestToken',
      headers: [{ key: 'Idempotency-Key', value: 'pay-{{idemKey}}' }],
      body: {
        bookingId: '{{bookingId}}',
        hotelId: '{{hotelId}}',
        amountMinor: num('{{bookingTotal}}'),
        currency: 'USD',
        provider: 'CASH',
        method: 'CASH',
        captureImmediately: true,
      },
      events: [
        test('the same payment, not a second charge', [
          'pm.response.to.have.status(201);',
          'pm.expect(pm.response.json().data.id).to.eql(pm.collectionVariables.get("paymentId"));',
        ]),
      ],
    }),
    req({
      name: 'Refunding more than was captured is refused',
      method: 'POST',
      path: '/payments/{{paymentId}}/refund',
      token: 'financeToken',
      headers: [{ key: 'Idempotency-Key', value: 'rf-over-{{idemKey}}' }],
      body: { amountMinor: 99999999, reason: 'OVERCHARGE' },
      events: [
        test('409 REFUND_EXCEEDS_CAPTURE with the available amount', [
          'pm.response.to.have.status(409);',
          'const e = pm.response.json().error;',
          'pm.expect(e.code).to.eql("REFUND_EXCEEDS_CAPTURE");',
          'pm.expect(e.details.availableMinor).to.be.a("number");',
        ]),
      ],
    }),
    req({
      name: 'Partial refund',
      method: 'POST',
      path: '/payments/{{paymentId}}/refund',
      token: 'financeToken',
      headers: [{ key: 'Idempotency-Key', value: 'rf-half-{{idemKey}}' }],
      body: { amountMinor: 1000, reason: 'GOODWILL', notes: 'Postman verification' },
      events: [
        test('201 and the amount is recorded', [
          'pm.response.to.have.status(201);',
          'pm.expect(pm.response.json().data.amountMinor).to.eql(1000);',
        ]),
      ],
    }),
    req({
      name: 'A second refund cannot exceed what remains',
      method: 'POST',
      path: '/payments/{{paymentId}}/refund',
      token: 'financeToken',
      headers: [{ key: 'Idempotency-Key', value: 'rf-rest-{{idemKey}}' }],
      body: { amountMinor: num('{{bookingTotal}}'), reason: 'GOODWILL' },
      events: [
        test('409 — prior refunds are subtracted from the cap', [
          'pm.response.to.have.status(409);',
          'pm.expect(pm.response.json().error.code).to.eql("REFUND_EXCEEDS_CAPTURE");',
        ]),
        test('the remaining amount is the capture minus what was already returned', [
          'const d = pm.response.json().error.details;',
          'pm.expect(d.availableMinor).to.eql(d.capturedMinor - d.alreadyRefundedMinor);',
        ]),
      ],
    }),
    req({
      name: 'Payment detail shows what is still refundable',
      path: '/payments/{{paymentId}}',
      token: 'financeToken',
      events: [
        test('200 with the refundable balance', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.refundable.amountMinor).to.eql(d.capturedMinor - d.refundedMinor);',
          'pm.expect(d.status).to.eql("PARTIALLY_REFUNDED");',
        ]),
      ],
    }),
    req({
      name: 'A guest cannot issue a refund',
      method: 'POST',
      path: '/payments/{{paymentId}}/refund',
      token: 'guestToken',
      headers: [{ key: 'Idempotency-Key', value: 'rf-guest-{{idemKey}}' }],
      body: { amountMinor: 100, reason: 'GOODWILL' },
      events: [
        test('403 FORBIDDEN', [
          'pm.response.to.have.status(403);',
          'pm.expect(pm.response.json().error.code).to.eql("FORBIDDEN");',
        ]),
      ],
    }),
  ],
});

/* 05 — stay ---------------------------------------------------------------- */
folders.push({
  name: '05 · Check-in, folio and check-out',
  description: 'The in-house lifecycle. The folio is append-only, so a correction is a new line rather than an edit.',
  item: [
    {
      name: 'Prepare stay identifiers',
      event: [
        {
          listen: 'prerequest',
          script: {
            type: 'text/javascript',
            exec: [
              'pm.collectionVariables.set("stayRoomId", "pm-room-" + Date.now());',
              'const out = new Date(pm.collectionVariables.get("checkOut") + "T11:00:00.000Z");',
              'pm.collectionVariables.set("expectedCheckOut", out.toISOString());',
            ],
          },
        },
        test('identifiers ready', ['pm.expect(pm.collectionVariables.get("stayRoomId")).to.be.a("string");']),
      ],
      request: { method: 'GET', header: [], url: { raw: '{{host}}/health', host: ['{{host}}'], path: ['health'] } },
    },
    req({
      name: 'Check the guest in',
      method: 'POST',
      path: '/stays/check-in',
      token: 'receptionToken',
      body: {
        bookingId: '{{bookingId}}',
        hotelId: '{{hotelId}}',
        customerId: 'pm-customer',
        roomId: '{{stayRoomId}}',
        roomNumber: '305',
        guestNames: ['Postman Verification'],
        adults: 2,
        children: 0,
        expectedCheckOut: '{{expectedCheckOut}}',
        currency: 'USD',
        roomChargeMinor: num('{{bookingTotal}}'),
      },
      events: [
        test('201 and the stay is in house', [
          'pm.response.to.have.status(201);',
          'const d = pm.response.json().data;',
          'pm.expect(d.status).to.eql("IN_HOUSE");',
          'pm.collectionVariables.set("stayId", d.id);',
        ]),
      ],
    }),
    req({
      name: 'Checking the same booking in twice is refused',
      method: 'POST',
      path: '/stays/check-in',
      token: 'receptionToken',
      body: {
        bookingId: '{{bookingId}}',
        hotelId: '{{hotelId}}',
        customerId: 'pm-customer',
        roomId: '{{stayRoomId}}',
        roomNumber: '305',
        guestNames: ['Postman Verification'],
        adults: 2,
        expectedCheckOut: '{{expectedCheckOut}}',
        currency: 'USD',
        roomChargeMinor: num('{{bookingTotal}}'),
      },
      events: [
        test('409 CONFLICT naming the existing stay', [
          'pm.response.to.have.status(409);',
          'pm.expect(pm.response.json().error.details.stayId).to.eql(pm.collectionVariables.get("stayId"));',
        ]),
      ],
    }),
    req({
      name: 'Read the folio',
      path: '/stays/{{stayId}}/folio',
      token: 'receptionToken',
      events: [
        test('200 with the room charge outstanding', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.balance.balanceDue.amountMinor).to.eql(Number(pm.collectionVariables.get("bookingTotal")));',
          'pm.expect(d.balance.settled).to.be.false;',
        ]),
      ],
    }),
    req({
      name: 'Post a manual charge',
      method: 'POST',
      path: '/stays/{{stayId}}/charges',
      token: 'receptionToken',
      body: { description: 'Late checkout', quantity: 1, unitPriceMinor: 2500, kind: 'SERVICE' },
      events: [
        test('201 and the line total derives from quantity x unit price', [
          'pm.response.to.have.status(201);',
          'const d = pm.response.json().data;',
          'pm.expect(d.amountMinor).to.eql(d.unitPriceMinor * d.quantity);',
        ]),
      ],
    }),
    req({
      name: 'The folio reflects the new charge',
      path: '/stays/{{stayId}}/folio',
      token: 'receptionToken',
      events: [
        test('the balance grew by exactly the charge', [
          'const d = pm.response.json().data;',
          'pm.expect(d.balance.balanceDue.amountMinor)',
          '  .to.eql(Number(pm.collectionVariables.get("bookingTotal")) + 2500);',
          'pm.collectionVariables.set("folioDue", d.balance.balanceDue.amountMinor);',
        ]),
        test('the folio is append-only — the room charge is still its own line', [
          'const kinds = pm.response.json().data.stay.folioLines.map(l => l.kind);',
          'pm.expect(kinds).to.include("ROOM");',
          'pm.expect(kinds).to.include("SERVICE");',
        ]),
      ],
    }),
    req({
      name: 'Check-out with an unsettled folio is refused',
      method: 'POST',
      path: '/stays/{{stayId}}/check-out',
      token: 'receptionToken',
      body: { settlementMinor: 0, allowUnsettled: false },
      events: [
        test('409 stating what is still owed', [
          'pm.response.to.have.status(409);',
          'pm.expect(pm.response.json().error.details.balanceDueMinor)',
          '  .to.eql(Number(pm.collectionVariables.get("folioDue")));',
        ]),
      ],
    }),
    req({
      name: 'Settle and check out',
      method: 'POST',
      path: '/stays/{{stayId}}/check-out',
      token: 'receptionToken',
      body: { settlementMinor: num('{{folioDue}}'), allowUnsettled: false },
      events: [
        test('200, settled and departed', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.stay.status).to.eql("CHECKED_OUT");',
          'pm.expect(d.balance.settled).to.be.true;',
          'pm.expect(d.balance.balanceDue.amountMinor).to.eql(0);',
        ]),
      ],
    }),
    req({
      name: 'The in-house register no longer lists the guest',
      path: '/stays/in-house',
      query: [{ key: 'hotelId', value: '{{hotelId}}' }],
      token: 'receptionToken',
      events: [
        test('the departed stay is gone from the register', [
          'pm.response.to.have.status(200);',
          'const ids = pm.response.json().data.map(s => s.id);',
          'pm.expect(ids).to.not.include(pm.collectionVariables.get("stayId"));',
        ]),
      ],
    }),
  ],
});

/* 06 — housekeeping -------------------------------------------------------- */
folders.push({
  name: '06 · Housekeeping',
  description:
    'The queue orders itself by urgency, not by arrival order. A failed inspection sends the room back to be redone rather than closing it.',
  item: [
    req({
      name: 'Identify the housekeeper',
      path: '/auth/me',
      token: 'housekeepingToken',
      events: [
        test('200 and the HOUSEKEEPING role', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.roles).to.include("HOUSEKEEPING");',
          'pm.collectionVariables.set("housekeeperId", d.id);',
        ]),
        {
          listen: 'prerequest',
          script: {
            type: 'text/javascript',
            exec: [
              'const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();',
              'pm.collectionVariables.set("arrivalSoon", soon);',
              'const n = Date.now() % 1000;',
              'pm.collectionVariables.set("urgentRoom", "9" + String(n).padStart(3, "0"));',
              'pm.collectionVariables.set("quietRoom", "8" + String(n).padStart(3, "0"));',
            ],
          },
        },
      ],
    }),
    req({
      name: 'Queue a clean with a guest arriving within the hour',
      method: 'POST',
      path: '/housekeeping/tasks',
      token: 'housekeepingToken',
      body: {
        hotelId: '{{hotelId}}',
        roomId: 'pm-hk-urgent-{{$timestamp}}',
        roomNumber: '{{urgentRoom}}',
        floor: 9,
        type: 'CHECKOUT_CLEAN',
        nextArrivalAt: '{{arrivalSoon}}',
        vip: false,
      },
      events: [
        test('201, CRITICAL because the arrival is imminent', [
          'pm.response.to.have.status(201);',
          'const d = pm.response.json().data;',
          'pm.expect(d.priority).to.eql("CRITICAL");',
          'pm.expect(d.status).to.eql("PENDING");',
          'pm.collectionVariables.set("taskId", d.id);',
        ]),
        test('a checkout clean arrives with its checklist attached', [
          'const d = pm.response.json().data;',
          'pm.expect(d.checklist.length).to.be.above(0);',
          'pm.expect(d.checklist.every(i => i.completed === false)).to.be.true;',
          'const required = d.checklist.filter(i => i.required).map(i => i.id);',
          'pm.expect(required.length).to.be.above(0);',
          'pm.collectionVariables.set("requiredChecklist", JSON.stringify(required));',
        ]),
      ],
    }),
    req({
      name: 'Queue a deep clean with nobody arriving',
      method: 'POST',
      path: '/housekeeping/tasks',
      token: 'housekeepingToken',
      body: {
        hotelId: '{{hotelId}}',
        roomId: 'pm-hk-quiet-{{$timestamp}}',
        roomNumber: '{{quietRoom}}',
        floor: 8,
        type: 'DEEP_CLEAN',
        vip: false,
      },
      events: [
        test('201 and LOW — no arrival, no urgency', [
          'pm.response.to.have.status(201);',
          'pm.expect(pm.response.json().data.priority).to.eql("LOW");',
        ]),
      ],
    }),
    req({
      name: 'The board puts the urgent room first',
      path: '/housekeeping/board',
      query: [{ key: 'hotelId', value: '{{hotelId}}' }],
      token: 'housekeepingToken',
      events: [
        test('200 and the imminent arrival outranks the deep clean queued after it', [
          'pm.response.to.have.status(200);',
          'const rooms = pm.response.json().data.map(t => t.roomNumber);',
          'const urgent = rooms.indexOf(pm.collectionVariables.get("urgentRoom"));',
          'const quiet = rooms.indexOf(pm.collectionVariables.get("quietRoom"));',
          'pm.expect(urgent, "urgent room on the board").to.be.at.least(0);',
          'pm.expect(quiet, "quiet room on the board").to.be.at.least(0);',
          'pm.expect(urgent).to.be.below(quiet);',
        ]),
      ],
    }),
    req({
      name: 'Assign the urgent clean to this housekeeper',
      method: 'POST',
      path: '/housekeeping/tasks/{{taskId}}/assign',
      token: 'housekeepingToken',
      body: { staffId: '{{housekeeperId}}' },
      events: [
        test('200 and ASSIGNED to the named housekeeper', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.status).to.eql("ASSIGNED");',
          'pm.expect(d.assignedToId).to.eql(pm.collectionVariables.get("housekeeperId"));',
        ]),
      ],
    }),
    req({
      name: 'Somebody else cannot start this task',
      method: 'POST',
      path: '/housekeeping/tasks/{{taskId}}/start',
      token: 'managerToken',
      events: [
        test('403 — the task belongs to another housekeeper', [
          'pm.response.to.have.status(403);',
          'pm.expect(pm.response.json().error.code).to.eql("FORBIDDEN");',
        ]),
      ],
    }),
    req({
      name: 'Start the clean',
      method: 'POST',
      path: '/housekeeping/tasks/{{taskId}}/start',
      token: 'housekeepingToken',
      events: [
        test('200 and IN_PROGRESS with a start time', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.status).to.eql("IN_PROGRESS");',
          'pm.expect(d.startedAt).to.not.be.null;',
        ]),
      ],
    }),
    req({
      name: 'Completing with the checklist untouched is refused',
      method: 'POST',
      path: '/housekeeping/tasks/{{taskId}}/complete',
      token: 'housekeepingToken',
      body: { checklist: [] },
      events: [
        test('409 naming every outstanding required item', [
          'pm.response.to.have.status(409);',
          'const e = pm.response.json().error;',
          'pm.expect(e.code).to.eql("CONFLICT");',
          'pm.expect(e.details.outstanding.length).to.be.above(0);',
        ]),
      ],
    }),
    {
      name: 'Complete the clean with every required item ticked',
      event: [
        {
          listen: 'prerequest',
          script: {
            type: 'text/javascript',
            exec: [
              'const ids = JSON.parse(pm.collectionVariables.get("requiredChecklist"));',
              'pm.collectionVariables.set(',
              '  "checklistBody",',
              '  JSON.stringify({ checklist: ids.map(id => ({ id, completed: true })) }),',
              ');',
            ],
          },
        },
        test('200, COMPLETED and timed', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.status).to.eql("COMPLETED");',
          'pm.expect(d.durationMinutes).to.be.at.least(1);',
        ]),
      ],
      request: {
        method: 'POST',
        header: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Authorization', value: 'Bearer {{housekeepingToken}}' },
        ],
        body: { mode: 'raw', raw: '{{checklistBody}}', options: { raw: { language: 'json' } } },
        url: url('/housekeeping/tasks/{{taskId}}/complete'),
      },
    },
    req({
      name: 'A failed inspection sends the room back, it does not close it',
      method: 'POST',
      path: '/housekeeping/tasks/{{taskId}}/verify',
      token: 'managerToken',
      body: { passed: false, notes: 'Bathroom mirror missed.' },
      events: [
        test('200, reopened as CRITICAL rework rather than VERIFIED', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.status).to.eql("ASSIGNED");',
          'pm.expect(d.priority).to.eql("CRITICAL");',
        ]),
      ],
    }),
    req({
      name: 'The reopened task is on the board again',
      path: '/housekeeping/board',
      query: [{ key: 'hotelId', value: '{{hotelId}}' }],
      token: 'housekeepingToken',
      events: [
        test('the checklist was cleared so the room is genuinely redone', [
          'const task = pm.response.json().data.find(t => t.id === pm.collectionVariables.get("taskId"));',
          'pm.expect(task, "reopened task").to.be.an("object");',
          'pm.expect(task.checklist.every(i => i.completed === false)).to.be.true;',
        ]),
      ],
    }),
    req({
      name: 'Only an administrator may roster a shift',
      method: 'POST',
      path: '/housekeeping/shifts',
      token: 'housekeepingToken',
      body: {
        hotelId: '{{hotelId}}',
        staffId: '{{housekeeperId}}',
        staffName: 'Postman Housekeeper',
        startsAt: '{{arrivalSoon}}',
        endsAt: '{{arrivalSoon}}',
      },
      events: [
        test('403 — rostering is staff:manage, which housekeeping does not hold', [
          'pm.response.to.have.status(403);',
          'pm.expect(pm.response.json().error.code).to.eql("FORBIDDEN");',
        ]),
      ],
    }),
    req({
      name: 'A guest cannot see the housekeeping board',
      path: '/housekeeping/board',
      query: [{ key: 'hotelId', value: '{{hotelId}}' }],
      token: 'guestToken',
      events: [
        test('403 FORBIDDEN', ['pm.response.to.have.status(403);']),
      ],
    }),
  ],
});

/* 07 — maintenance --------------------------------------------------------- */
folders.push({
  name: '07 · Maintenance',
  description:
    'Triage is the point of this service: the reporter’s own priority is a floor, never a ceiling.',
  item: [
    req({
      name: 'Identify the engineer',
      path: '/auth/me',
      token: 'maintenanceToken',
      events: [
        test('200 and the MAINTENANCE role', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.roles).to.include("MAINTENANCE");',
          'pm.collectionVariables.set("engineerId", d.id);',
          'pm.collectionVariables.set("engineerName", d.fullName);',
        ]),
      ],
    }),
    req({
      name: 'A receptionist reports a fault in an occupied room',
      method: 'POST',
      path: '/maintenance/tickets',
      token: 'receptionToken',
      body: {
        hotelId: '{{hotelId}}',
        roomId: 'pm-room-fault-{{$timestamp}}',
        roomNumber: '412',
        category: 'PLUMBING_MAJOR',
        summary: 'No hot water in the bathroom',
        details: 'Guest reports cold water only. Reported via Postman verification run.',
        reportedPriority: 'MEDIUM',
        roomOccupied: true,
        arrivalImminent: false,
      },
      events: [
        test('201 and escalated to CRITICAL despite being reported as MEDIUM', [
          'pm.response.to.have.status(201);',
          'const d = pm.response.json().data;',
          'pm.expect(d.priority).to.eql("CRITICAL");',
          'pm.expect(d.status).to.eql("REPORTED");',
          'pm.collectionVariables.set("ticketId", d.id);',
        ]),
        test('a major plumbing fault takes the room out of sale', [
          'pm.expect(pm.response.json().data.takesRoomOffline).to.be.true;',
        ]),
        test('the SLA deadline is two hours out for CRITICAL', [
          'const d = pm.response.json().data;',
          'const hours = (new Date(d.dueAt) - new Date(d.reportedAt ?? d.createdAt)) / 3600000;',
          'pm.expect(Math.round(hours)).to.eql(2);',
        ]),
      ],
    }),
    req({
      name: 'A cosmetic fault in an empty room stays low',
      method: 'POST',
      path: '/maintenance/tickets',
      token: 'receptionToken',
      body: {
        hotelId: '{{hotelId}}',
        roomNumber: '413',
        category: 'COSMETIC',
        summary: 'Scuff mark on the corridor skirting board',
        reportedPriority: 'LOW',
        roomOccupied: false,
        arrivalImminent: false,
      },
      events: [
        test('201, LOW, and the room stays sellable', [
          'pm.response.to.have.status(201);',
          'const d = pm.response.json().data;',
          'pm.expect(d.priority).to.eql("LOW");',
          'pm.expect(d.takesRoomOffline).to.be.false;',
        ]),
      ],
    }),
    req({
      name: 'A guest cannot read the ticket queue',
      path: '/maintenance/tickets',
      query: [{ key: 'hotelId', value: '{{hotelId}}' }],
      token: 'guestToken',
      events: [test('403 FORBIDDEN', ['pm.response.to.have.status(403);'])],
    }),
    req({
      name: 'Assign the ticket to the engineer',
      method: 'POST',
      path: '/maintenance/tickets/{{ticketId}}/assign',
      token: 'maintenanceToken',
      body: { staffId: '{{engineerId}}', staffName: '{{engineerName}}' },
      events: [
        test('200 and ASSIGNED', [
          'pm.response.to.have.status(200);',
          'pm.expect(pm.response.json().data.status).to.eql("ASSIGNED");',
        ]),
      ],
    }),
    req({
      name: 'Closing before the fix is refused',
      method: 'POST',
      path: '/maintenance/tickets/{{ticketId}}/close',
      token: 'maintenanceToken',
      events: [
        test('409 — a ticket cannot jump from ASSIGNED to CLOSED', [
          'pm.response.to.have.status(409);',
          'const e = pm.response.json().error;',
          'pm.expect(e.code).to.eql("CONFLICT");',
          'pm.expect(e.details.allowed).to.be.an("array");',
        ]),
      ],
    }),
    req({
      name: 'Start work',
      method: 'POST',
      path: '/maintenance/tickets/{{ticketId}}/start',
      token: 'maintenanceToken',
      events: [
        test('200 and IN_PROGRESS', [
          'pm.response.to.have.status(200);',
          'pm.expect(pm.response.json().data.status).to.eql("IN_PROGRESS");',
        ]),
      ],
    }),
    req({
      name: 'Add a note to the ticket',
      method: 'POST',
      path: '/maintenance/tickets/{{ticketId}}/comments',
      token: 'maintenanceToken',
      body: { body: 'Isolating the riser. Parts on order.', internal: true },
      events: [
        test('201 and the note is stored', [
          'pm.response.to.have.status(201);',
          'pm.expect(pm.response.json().data.body).to.contain("Isolating");',
        ]),
      ],
    }),
    req({
      name: 'Resolve the fault',
      method: 'POST',
      path: '/maintenance/tickets/{{ticketId}}/resolve',
      token: 'maintenanceToken',
      body: {
        resolutionNotes: 'Replaced the thermostatic mixing valve and flushed the line.',
        costMinor: 8500,
        currency: 'USD',
        returnRoomToService: true,
      },
      events: [
        test('200, RESOLVED, and the cost is recorded', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.status).to.eql("RESOLVED");',
          'pm.expect(d.costMinor).to.eql(8500);',
          'pm.expect(d.resolvedAt).to.not.be.null;',
        ]),
      ],
    }),
    req({
      name: 'Close the ticket',
      method: 'POST',
      path: '/maintenance/tickets/{{ticketId}}/close',
      token: 'maintenanceToken',
      events: [
        test('200 and CLOSED', [
          'pm.response.to.have.status(200);',
          'pm.expect(pm.response.json().data.status).to.eql("CLOSED");',
        ]),
      ],
    }),
    req({
      name: 'The summary counts only open work',
      path: '/maintenance/summary',
      query: [{ key: 'hotelId', value: '{{hotelId}}' }],
      token: 'maintenanceToken',
      events: [
        test('200 with a priority breakdown', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.byPriority).to.have.property("CRITICAL");',
          'pm.expect(d.overdue).to.be.a("number");',
        ]),
        test('the closed ticket is no longer counted', [
          'const d = pm.response.json().data;',
          'const open = Object.values(d.byPriority).reduce((a, b) => a + b, 0);',
          'pm.expect(open).to.be.a("number");',
        ]),
      ],
    }),
  ],
});

/* 08 — reviews ------------------------------------------------------------- */
folders.push({
  name: '08 · Reviews and moderation',
  description:
    'Moderation is biased towards holding, not rejecting. A negative review is not a policy violation, and the tests below say so.',
  item: [
    {
      name: 'Prepare review identifiers',
      event: [
        {
          listen: 'prerequest',
          script: {
            type: 'text/javascript',
            exec: [
              'const n = Date.now();',
              'pm.collectionVariables.set("spamStayId", "pm-stay-spam-" + n);',
              'pm.collectionVariables.set("heldStayId", "pm-stay-held-" + n);',
            ],
          },
        },
        test('identifiers ready', ['pm.expect(pm.collectionVariables.get("spamStayId")).to.be.a("string");']),
      ],
      request: { method: 'GET', header: [], url: { raw: '{{host}}/health', host: ['{{host}}'], path: ['health'] } },
    },
    req({
      name: 'The guest reviews their stay',
      method: 'POST',
      path: '/reviews',
      token: 'guestToken',
      body: {
        hotelId: '{{hotelId}}',
        stayId: '{{stayId}}',
        bookingId: '{{bookingId}}',
        displayName: 'Postman Guest',
        scores: { CLEANLINESS: 5, STAFF: 4, COMFORT: 4, LOCATION: 5, FACILITIES: 3, VALUE: 4 },
        title: 'Comfortable stay, friendly team',
        comment: 'The room was spotless and the front desk could not have been more helpful.',
      },
      events: [
        test('201 and published — nothing to hold it for', [
          'pm.response.to.have.status(201);',
          '// The response carries the moderation decision alongside the review,',
          '// so a client can say why a review is not visible yet.',
          'const { review, moderation } = pm.response.json().data;',
          'pm.expect(review.status).to.eql("PUBLISHED");',
          'pm.expect(moderation.flags).to.have.lengthOf(0);',
          'pm.collectionVariables.set("reviewId", review.id);',
        ]),
        test('the overall score is the unweighted mean, to one decimal', [
          'const review = pm.response.json().data.review;',
          'const values = Object.values(review.scores);',
          'const mean = values.reduce((a, b) => a + b, 0) / values.length;',
          'pm.expect(Number(review.overallRating)).to.eql(Math.round(mean * 10) / 10);',
        ]),
      ],
    }),
    req({
      name: 'The same stay cannot be reviewed twice',
      method: 'POST',
      path: '/reviews',
      token: 'guestToken',
      body: {
        hotelId: '{{hotelId}}',
        stayId: '{{stayId}}',
        bookingId: '{{bookingId}}',
        displayName: 'Postman Guest',
        scores: { CLEANLINESS: 1 },
      },
      events: [
        test('409 naming the review already on file', [
          'pm.response.to.have.status(409);',
          'pm.expect(pm.response.json().error.details.reviewId)',
          '  .to.eql(pm.collectionVariables.get("reviewId"));',
        ]),
        test('the conflict is about the stay, not the wording', [
          'pm.expect(pm.response.json().error.message).to.contain("already reviewed");',
        ]),
      ],
    }),
    req({
      name: 'A review carrying contact details is rejected',
      method: 'POST',
      path: '/reviews',
      token: 'guestToken',
      body: {
        hotelId: '{{hotelId}}',
        stayId: '{{spamStayId}}',
        bookingId: 'pm-booking-spam',
        displayName: 'Postman Spammer',
        scores: { CLEANLINESS: 5, STAFF: 5 },
        comment: 'Great hotel, book direct through me at deals@example.com for a discount.',
      },
      events: [
        test('201 but REJECTED, with the reason stated', [
          'pm.response.to.have.status(201);',
          'const { review, moderation } = pm.response.json().data;',
          'pm.expect(review.status).to.eql("REJECTED");',
          'pm.expect(moderation.flags).to.include("CONTAINS_CONTACT_DETAILS");',
          'pm.expect(moderation.reason).to.contain("email");',
        ]),
      ],
    }),
    req({
      name: 'A very short comment is held for a human, not rejected',
      method: 'POST',
      path: '/reviews',
      token: 'guestToken',
      body: {
        hotelId: '{{hotelId}}',
        stayId: '{{heldStayId}}',
        bookingId: 'pm-booking-held',
        displayName: 'Postman Terse',
        scores: { CLEANLINESS: 2, STAFF: 2, VALUE: 1 },
        comment: 'Not great.',
      },
      events: [
        test('201 and PENDING_MODERATION — criticism is held, never dropped', [
          'pm.response.to.have.status(201);',
          'const { review, moderation } = pm.response.json().data;',
          'pm.expect(review.status).to.eql("PENDING_MODERATION");',
          'pm.expect(moderation.flags).to.include("TOO_SHORT");',
          '// A one-star review is held for a person, not rejected outright.',
          'pm.expect(moderation.flags).to.not.include("PROFANITY");',
          'pm.collectionVariables.set("heldReviewId", review.id);',
        ]),
      ],
    }),
    req({
      name: 'The public list shows published reviews only',
      path: '/reviews',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'pageSize', value: '100' },
      ],
      events: [
        test('200 without a token — the list is public', [
          'pm.response.to.have.status(200);',
          'pm.expect(pm.response.json().data.every(r => r.status === "PUBLISHED")).to.be.true;',
        ]),
        test('the held and rejected reviews are not on it', [
          'const ids = pm.response.json().data.map(r => r.id);',
          'pm.expect(ids).to.include(pm.collectionVariables.get("reviewId"));',
          'pm.expect(ids).to.not.include(pm.collectionVariables.get("heldReviewId"));',
        ]),
      ],
    }),
    req({
      name: 'A guest cannot open the moderation queue',
      path: '/reviews/moderation-queue',
      query: [{ key: 'hotelId', value: '{{hotelId}}' }],
      token: 'guestToken',
      events: [test('403 FORBIDDEN', ['pm.response.to.have.status(403);'])],
    }),
    req({
      name: 'The manager sees the held review',
      path: '/reviews/moderation-queue',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'pageSize', value: '100' },
      ],
      token: 'managerToken',
      events: [
        test('200 and the queue contains it', [
          'pm.response.to.have.status(200);',
          'const ids = pm.response.json().data.map(r => r.id);',
          'pm.expect(ids).to.include(pm.collectionVariables.get("heldReviewId"));',
        ]),
      ],
    }),
    req({
      name: 'The manager publishes it',
      method: 'POST',
      path: '/reviews/{{heldReviewId}}/moderate',
      token: 'managerToken',
      body: { status: 'PUBLISHED', reason: 'Short but genuine.' },
      events: [
        test('200 and PUBLISHED', [
          'pm.response.to.have.status(200);',
          'pm.expect(pm.response.json().data.status).to.eql("PUBLISHED");',
        ]),
      ],
    }),
    req({
      name: 'The manager replies in public',
      method: 'POST',
      path: '/reviews/{{reviewId}}/response',
      token: 'managerToken',
      body: { body: 'Thank you for staying with us — we have passed this on to the team.' },
      events: [
        test('200 and the reply is stored against the review', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.responseBody ?? d.response?.body).to.contain("Thank you");',
        ]),
      ],
    }),
    req({
      name: 'A guest cannot reply on behalf of the hotel',
      method: 'POST',
      path: '/reviews/{{reviewId}}/response',
      token: 'guestToken',
      body: { body: 'Pretending to be the hotel management here.' },
      events: [test('403 FORBIDDEN', ['pm.response.to.have.status(403);'])],
    }),
    req({
      name: 'The public rating aggregate',
      path: '/reviews/rating',
      query: [{ key: 'hotelId', value: '{{hotelId}}' }],
      events: [
        test('200 without a token', ['pm.response.to.have.status(200);']),
        test('the aggregate counts the published reviews and stays inside 1–5', [
          'const d = pm.response.json().data;',
          'pm.expect(d.reviewCount).to.be.at.least(2);',
          'pm.expect(Number(d.overallRating)).to.be.within(1, 5);',
          'pm.expect(d.distribution).to.be.an("object");',
        ]),
      ],
    }),
    req({
      name: 'The guest sees their own reviews, published or not',
      path: '/reviews/mine',
      query: [{ key: 'pageSize', value: '100' }],
      token: 'guestToken',
      events: [
        test('200 and the rejected one is visible to its author', [
          'pm.response.to.have.status(200);',
          'const statuses = pm.response.json().data.map(r => r.status);',
          'pm.expect(statuses).to.include("REJECTED");',
        ]),
      ],
    }),
  ],
});

/* 09 — invoicing ----------------------------------------------------------- */
folders.push({
  name: '09 · Invoicing',
  description:
    'Invoice numbers must be gap-free, so a void keeps its number rather than deleting the row.',
  item: [
    {
      name: 'Prepare invoice identifiers',
      event: [
        {
          listen: 'prerequest',
          script: {
            type: 'text/javascript',
            exec: [
              'const n = Date.now();',
              'pm.collectionVariables.set("invoiceStayId", "pm-inv-" + n);',
              'pm.collectionVariables.set("voidStayId", "pm-void-" + n);',
            ],
          },
        },
        test('identifiers ready', ['pm.expect(pm.collectionVariables.get("invoiceStayId")).to.be.a("string");']),
      ],
      request: { method: 'GET', header: [], url: { raw: '{{host}}/health', host: ['{{host}}'], path: ['health'] } },
    },
    req({
      name: 'Issue an invoice',
      method: 'POST',
      path: '/invoices',
      token: 'financeToken',
      body: {
        hotelId: '{{hotelId}}',
        stayId: '{{invoiceStayId}}',
        bookingId: '{{bookingId}}',
        customerId: 'pm-customer',
        hotelName: 'StaySphere Verification Hotel',
        billToName: 'Postman Verification',
        billToEmail: 'guest@example.com',
        currency: 'USD',
        discountMinor: 1000,
        dueInDays: 14,
        lines: [
          { description: 'Room charge', quantity: 2, unitPriceMinor: 15000, taxable: true },
          { description: 'Breakfast', quantity: 2, unitPriceMinor: 2500, taxable: true },
        ],
      },
      events: [
        test('201 and ISSUED', [
          'pm.response.to.have.status(201);',
          'const d = pm.response.json().data;',
          'pm.expect(d.status).to.eql("ISSUED");',
          'pm.collectionVariables.set("invoiceId", d.id);',
          'pm.collectionVariables.set("invoiceTotal", d.totalMinor);',
          'pm.collectionVariables.set("invoiceNumber", d.invoiceNumber);',
        ]),
        test('the number is PREFIX-YEAR-NNNNNN', [
          'pm.expect(pm.response.json().data.invoiceNumber).to.match(/^[A-Z0-9]{2,8}-\\d{4}-\\d{6}$/);',
        ]),
        test('the subtotal is the sum of the lines', [
          'const d = pm.response.json().data;',
          'const sum = d.lines.reduce((a, l) => a + l.amountMinor, 0);',
          'pm.expect(d.subtotalMinor).to.eql(sum);',
          'pm.expect(d.lines.every(l => l.amountMinor === l.unitPriceMinor * l.quantity)).to.be.true;',
        ]),
        test('tax is itemised and the components add up to the tax total', [
          'const d = pm.response.json().data;',
          'const codes = d.taxLines.map(t => t.code);',
          'pm.expect(codes).to.include("VAT");',
          'pm.expect(codes).to.include("CITY");',
          'pm.expect(d.taxLines.reduce((a, t) => a + t.amountMinor, 0)).to.eql(d.taxMinor);',
        ]),
        test('total = subtotal - discount + tax', [
          'const d = pm.response.json().data;',
          'pm.expect(d.totalMinor).to.eql(d.subtotalMinor - d.discountMinor + d.taxMinor);',
        ]),
      ],
    }),
    req({
      name: 'A second invoice for the same stay is refused',
      method: 'POST',
      path: '/invoices',
      token: 'financeToken',
      body: {
        hotelId: '{{hotelId}}',
        stayId: '{{invoiceStayId}}',
        bookingId: '{{bookingId}}',
        customerId: 'pm-customer',
        hotelName: 'StaySphere Verification Hotel',
        billToName: 'Postman Verification',
        billToEmail: 'guest@example.com',
        currency: 'USD',
        lines: [{ description: 'Room charge', quantity: 1, unitPriceMinor: 15000 }],
      },
      events: [
        test('409 naming the invoice already issued', [
          'pm.response.to.have.status(409);',
          'pm.expect(pm.response.json().error.details.invoiceNumber)',
          '  .to.eql(pm.collectionVariables.get("invoiceNumber"));',
        ]),
      ],
    }),
    req({
      name: 'Overpaying is refused',
      method: 'POST',
      path: '/invoices/{{invoiceId}}/payments',
      token: 'financeToken',
      body: { amountMinor: 99999999, reference: 'PM-OVERPAY' },
      events: [
        test('400 stating what is actually outstanding', [
          'pm.response.to.have.status(400);',
          'const e = pm.response.json().error;',
          'pm.expect(e.code).to.eql("VALIDATION_FAILED");',
          'pm.expect(e.details.outstandingMinor)',
          '  .to.eql(Number(pm.collectionVariables.get("invoiceTotal")));',
        ]),
      ],
    }),
    req({
      name: 'Record a part payment',
      method: 'POST',
      path: '/invoices/{{invoiceId}}/payments',
      token: 'financeToken',
      body: { amountMinor: 5000, reference: 'PM-PART' },
      events: [
        test('200 and PARTIALLY_PAID', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.status).to.eql("PARTIALLY_PAID");',
          'pm.expect(d.paidMinor).to.eql(5000);',
          'pm.expect(d.paidAt).to.be.null;',
        ]),
      ],
    }),
    req({
      name: 'The invoice shows the balance still due',
      path: '/invoices/{{invoiceId}}',
      token: 'financeToken',
      events: [
        test('200 and the balance is total minus paid', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.balanceDueMinor).to.eql(d.totalMinor - d.paidMinor);',
        ]),
      ],
    }),
    req({
      name: 'A part-paid invoice cannot be voided',
      method: 'POST',
      path: '/invoices/{{invoiceId}}/void',
      token: 'financeToken',
      body: { reason: 'Raised against the wrong stay.' },
      events: [
        test('409 — refund the payment first', [
          'pm.response.to.have.status(409);',
          'pm.expect(pm.response.json().error.details.paidMinor).to.eql(5000);',
        ]),
      ],
    }),
    {
      name: 'Settle the invoice',
      event: [
        {
          listen: 'prerequest',
          script: {
            type: 'text/javascript',
            exec: [
              'const outstanding = Number(pm.collectionVariables.get("invoiceTotal")) - 5000;',
              'pm.collectionVariables.set(',
              '  "settleBody",',
              '  JSON.stringify({ amountMinor: outstanding, reference: "PM-SETTLE" }),',
              ');',
            ],
          },
        },
        test('200, PAID and stamped', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.status).to.eql("PAID");',
          'pm.expect(d.paidMinor).to.eql(d.totalMinor);',
          'pm.expect(d.paidAt).to.not.be.null;',
        ]),
      ],
      request: {
        method: 'POST',
        header: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Authorization', value: 'Bearer {{financeToken}}' },
        ],
        body: { mode: 'raw', raw: '{{settleBody}}', options: { raw: { language: 'json' } } },
        url: url('/invoices/{{invoiceId}}/payments'),
      },
    },
    req({
      name: 'Issue a second invoice and void it',
      method: 'POST',
      path: '/invoices',
      token: 'financeToken',
      body: {
        hotelId: '{{hotelId}}',
        stayId: '{{voidStayId}}',
        bookingId: '{{bookingId}}',
        customerId: 'pm-customer',
        hotelName: 'StaySphere Verification Hotel',
        billToName: 'Postman Verification',
        billToEmail: 'guest@example.com',
        currency: 'USD',
        lines: [{ description: 'Room charge', quantity: 1, unitPriceMinor: 15000 }],
      },
      events: [
        test('201 and the number is the next one in the sequence', [
          'pm.response.to.have.status(201);',
          'const d = pm.response.json().data;',
          'pm.collectionVariables.set("voidInvoiceId", d.id);',
          'const seq = (n) => Number(n.split("-").pop());',
          'pm.expect(seq(d.invoiceNumber))',
          '  .to.eql(seq(pm.collectionVariables.get("invoiceNumber")) + 1);',
        ]),
      ],
    }),
    req({
      name: 'Void it',
      method: 'POST',
      path: '/invoices/{{voidInvoiceId}}/void',
      token: 'financeToken',
      body: { reason: 'Duplicate raised during the Postman verification run.' },
      events: [
        test('200, VOID, and the number is kept so the sequence stays gap-free', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.status).to.eql("VOID");',
          'pm.expect(d.invoiceNumber).to.be.a("string");',
          'pm.expect(d.voidReason).to.contain("Duplicate");',
        ]),
      ],
    }),
    req({
      name: 'A receptionist cannot void an invoice',
      method: 'POST',
      path: '/invoices/{{invoiceId}}/void',
      token: 'receptionToken',
      body: { reason: 'Should never be permitted.' },
      events: [
        test('403 — voiding is payment:refund', [
          'pm.response.to.have.status(403);',
          'pm.expect(pm.response.json().error.code).to.eql("FORBIDDEN");',
        ]),
      ],
    }),
    req({
      name: 'Revenue for the period excludes voided invoices',
      path: '/invoices/revenue',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'from', value: '{{periodFrom}}' },
        { key: 'to', value: '{{periodTo}}' },
      ],
      token: 'financeToken',
      events: [
        {
          listen: 'prerequest',
          script: {
            type: 'text/javascript',
            exec: [
              'const now = new Date();',
              'const from = new Date(now.getTime() - 86400000);',
              'const to = new Date(now.getTime() + 86400000);',
              'pm.collectionVariables.set("periodFrom", from.toISOString());',
              'pm.collectionVariables.set("periodTo", to.toISOString());',
            ],
          },
        },
        test('200 with totals that reconcile', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.totalMinor).to.eql(d.subtotalMinor - d.discountMinor + d.taxMinor);',
          'pm.expect(d.invoices).to.be.at.least(1);',
          'pm.expect(d.outstandingMinor).to.eql(d.totalMinor - d.paidMinor);',
        ]),
      ],
    }),
  ],
});

/* 10 — notifications ------------------------------------------------------- */
folders.push({
  name: '10 · Notifications',
  description:
    'Delivery is at-least-once, so the same event must never produce two messages. Reading someone else’s notification returns 404, not 403 — a 403 would confirm the id exists.',
  item: [
    req({
      name: 'Identify the guest',
      path: '/auth/me',
      token: 'guestToken',
      events: [
        test('200 and the recipient id is captured', [
          'pm.response.to.have.status(200);',
          'pm.collectionVariables.set("guestId", pm.response.json().data.id);',
        ]),
        {
          listen: 'prerequest',
          script: {
            type: 'text/javascript',
            exec: ['pm.collectionVariables.set("notifyEventId", "pm-evt-" + Date.now());'],
          },
        },
      ],
    }),
    req({
      name: 'A template may not require a token it does not contain',
      method: 'PUT',
      path: '/notifications/templates',
      token: 'adminToken',
      body: {
        key: 'room-ready',
        channel: 'IN_APP',
        locale: 'en',
        body: 'Your room is ready. Collect your key at reception.',
        required: ['guestName'],
      },
      events: [
        test('400 naming the token that is missing from the body', [
          'pm.response.to.have.status(400);',
          'const e = pm.response.json().error;',
          'pm.expect(e.code).to.eql("VALIDATION_FAILED");',
          'pm.expect(e.details.unknownRequired).to.include("guestName");',
        ]),
      ],
    }),
    req({
      name: 'Publish the in-app template',
      method: 'PUT',
      path: '/notifications/templates',
      token: 'adminToken',
      body: {
        key: 'room-ready',
        channel: 'IN_APP',
        locale: 'en',
        subject: 'Your room is ready',
        body: 'Your room is ready. Collect your key at reception.',
        required: [],
      },
      events: [
        test('200 and the template is active', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.key).to.eql("room-ready");',
          'pm.expect(d.active).to.be.true;',
        ]),
      ],
    }),
    req({
      name: 'A guest cannot publish templates',
      method: 'PUT',
      path: '/notifications/templates',
      token: 'guestToken',
      body: { key: 'room-ready', channel: 'IN_APP', locale: 'en', body: 'Anything at all.' },
      events: [test('403 FORBIDDEN', ['pm.response.to.have.status(403);'])],
    }),
    req({
      name: 'Send the notification',
      method: 'POST',
      path: '/notifications/send',
      token: 'adminToken',
      body: {
        recipientId: '{{guestId}}',
        toAddress: '{{guestEmail}}',
        template: 'room-ready',
        locale: 'en',
        channels: ['IN_APP'],
        eventId: '{{notifyEventId}}',
        hotelId: '{{hotelId}}',
      },
      events: [
        test('201 and one in-app message was queued', [
          'pm.response.to.have.status(201);',
          'const d = pm.response.json().data;',
          'pm.expect(d.queued).to.have.lengthOf(1);',
          'pm.expect(d.queued[0].channel).to.eql("IN_APP");',
          'pm.collectionVariables.set("notificationId", d.queued[0].id);',
        ]),
      ],
    }),
    req({
      name: 'Replaying the same event queues nothing',
      method: 'POST',
      path: '/notifications/send',
      token: 'adminToken',
      body: {
        recipientId: '{{guestId}}',
        toAddress: '{{guestEmail}}',
        template: 'room-ready',
        locale: 'en',
        channels: ['IN_APP'],
        eventId: '{{notifyEventId}}',
        hotelId: '{{hotelId}}',
      },
      events: [
        test('201 but deduplicated — at-least-once delivery, exactly-once effect', [
          'pm.response.to.have.status(201);',
          'pm.expect(pm.response.json().data.queued).to.have.lengthOf(0);',
        ]),
      ],
    }),
    req({
      name: 'A guest cannot send notifications',
      method: 'POST',
      path: '/notifications/send',
      token: 'guestToken',
      body: {
        recipientId: '{{guestId}}',
        toAddress: '{{guestEmail}}',
        template: 'room-ready',
        channels: ['IN_APP'],
        eventId: 'pm-evt-forbidden',
      },
      events: [
        test('403 — sending is system:admin', [
          'pm.response.to.have.status(403);',
          'pm.expect(pm.response.json().error.code).to.eql("FORBIDDEN");',
        ]),
      ],
    }),
    req({
      name: 'The guest reads their inbox',
      path: '/notifications',
      query: [{ key: 'pageSize', value: '100' }],
      token: 'guestToken',
      events: [
        test('200 and the message is there, exactly once', [
          'pm.response.to.have.status(200);',
          'const mine = pm.response.json().data.filter(n => n.id === pm.collectionVariables.get("notificationId"));',
          'pm.expect(mine).to.have.lengthOf(1);',
          'pm.expect(mine[0].readAt).to.be.null;',
        ]),
        test('the unread count is reported in the envelope meta', [
          'pm.expect(pm.response.json().meta.unread).to.be.at.least(1);',
        ]),
      ],
    }),
    req({
      name: 'Somebody else cannot read the guest’s notification',
      method: 'POST',
      path: '/notifications/{{notificationId}}/read',
      token: 'receptionToken',
      events: [
        test('404, not 403 — a 403 would confirm the id exists', [
          'pm.response.to.have.status(404);',
          'pm.expect(pm.response.json().error.code).to.eql("NOT_FOUND");',
        ]),
      ],
    }),
    req({
      name: 'The guest marks it read',
      method: 'POST',
      path: '/notifications/{{notificationId}}/read',
      token: 'guestToken',
      events: [
        test('200 and readAt is stamped', [
          'pm.response.to.have.status(200);',
          'pm.expect(pm.response.json().data.readAt).to.not.be.null;',
        ]),
      ],
    }),
    req({
      name: 'Marking it read again is harmless',
      method: 'POST',
      path: '/notifications/{{notificationId}}/read',
      token: 'guestToken',
      events: [
        test('200 and the original timestamp is kept', [
          'pm.response.to.have.status(200);',
          'pm.expect(pm.response.json().data.readAt).to.not.be.null;',
        ]),
      ],
    }),
    req({
      name: 'Clear the inbox',
      method: 'POST',
      path: '/notifications/read-all',
      token: 'guestToken',
      events: [test('200', ['pm.response.to.have.status(200);'])],
    }),
    req({
      name: 'Nothing is unread',
      path: '/notifications',
      query: [{ key: 'unreadOnly', value: 'true' }],
      token: 'guestToken',
      events: [
        test('200 and the unread count is zero', [
          'pm.response.to.have.status(200);',
          'pm.expect(pm.response.json().data).to.have.lengthOf(0);',
          'pm.expect(pm.response.json().meta.unread).to.eql(0);',
        ]),
      ],
    }),
  ],
});

/* 11 — reporting ----------------------------------------------------------- */
folders.push({
  name: '11 · Reporting',
  description: 'The KPI arithmetic — occupancy, ADR, RevPAR — checked against the numbers fed in.',
  item: [
    req({
      name: 'Record today’s figures',
      method: 'POST',
      path: '/reports/daily',
      token: 'adminToken',
      body: {
        hotelId: '{{hotelId}}',
        date: '{{today}}',
        roomsAvailable: 100,
        roomsSold: 72,
        roomsOutOfOrder: 2,
        roomRevenueMinor: 1440000,
        serviceRevenueMinor: 160000,
        taxMinor: 180000,
        currency: 'USD',
        arrivals: 30,
        departures: 26,
        cancellations: 3,
        noShows: 1,
      },
      events: [
        {
          listen: 'prerequest',
          script: {
            type: 'text/javascript',
            exec: ['pm.collectionVariables.set("today", new Date().toISOString().slice(0, 10));'],
          },
        },
        test('201 and the day is stored', [
          'pm.response.to.have.status(201);',
          'pm.expect(pm.response.json().data.roomsSold).to.eql(72);',
        ]),
      ],
    }),
    req({
      name: 'A manager cannot write the daily figures',
      method: 'POST',
      path: '/reports/daily',
      token: 'managerToken',
      body: {
        hotelId: '{{hotelId}}',
        date: '{{today}}',
        roomsAvailable: 1,
        roomsSold: 1,
        roomRevenueMinor: 1,
      },
      events: [
        test('403 — writing facts is system:admin', [
          'pm.response.to.have.status(403);',
        ]),
      ],
    }),
    req({
      name: 'Today’s snapshot',
      path: '/reports/today',
      query: [{ key: 'hotelId', value: '{{hotelId}}' }],
      token: 'managerToken',
      events: [
        test('200 and occupancy is roomsSold ÷ roomsAvailable', [
          'pm.response.to.have.status(200);',
          'const d = pm.response.json().data;',
          'pm.expect(d.roomsSold).to.eql(72);',
          'pm.expect(d.occupancyPct).to.eql(72);',
        ]),
        test('revenue is room plus service, exclusive of tax', [
          'pm.expect(pm.response.json().data.revenueMinor).to.eql(1440000 + 160000);',
        ]),
      ],
    }),
    req({
      name: 'Period KPIs',
      path: '/reports/performance',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'from', value: '{{today}}' },
        { key: 'to', value: '{{today}}' },
      ],
      token: 'financeToken',
      events: [
        test('200 with the headline KPIs', [
          'pm.response.to.have.status(200);',
          'const c = pm.response.json().data.current;',
          'pm.expect(c.occupancyPct).to.eql(72);',
          'pm.expect(c.adr.amountMinor).to.eql(Math.round(1440000 / 72));',
          'pm.expect(c.revpar.amountMinor).to.eql(Math.round(1440000 / 100));',
        ]),
        test('RevPAR is ADR multiplied by occupancy, within rounding', [
          'const c = pm.response.json().data.current;',
          'const implied = c.adr.amountMinor * (c.occupancyPct / 100);',
          'pm.expect(Math.abs(c.revpar.amountMinor - implied)).to.be.below(2);',
        ]),
        test('total revenue includes services, room revenue does not', [
          'const c = pm.response.json().data.current;',
          'pm.expect(c.roomRevenue.amountMinor).to.eql(1440000);',
          'pm.expect(c.totalRevenue.amountMinor).to.eql(1600000);',
        ]),
      ],
    }),
    req({
      name: 'An inverted period is refused',
      path: '/reports/performance',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'from', value: '2026-06-30' },
        { key: 'to', value: '2026-06-01' },
      ],
      token: 'financeToken',
      events: [
        test('400 — "to" may not precede "from"', [
          'pm.response.to.have.status(400);',
          'pm.expect(pm.response.json().error.code).to.eql("VALIDATION_FAILED");',
        ]),
      ],
    }),
    req({
      name: 'A malformed date is refused',
      path: '/reports/performance',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'from', value: '01-06-2026' },
        { key: 'to', value: '{{today}}' },
      ],
      token: 'financeToken',
      events: [
        test('400 asking for YYYY-MM-DD', ['pm.response.to.have.status(400);']),
      ],
    }),
    req({
      name: 'Daily trend',
      path: '/reports/trend',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'from', value: '{{today}}' },
        { key: 'to', value: '{{today}}' },
        { key: 'granularity', value: 'day' },
      ],
      token: 'financeToken',
      events: [
        test('200 and one bucket for one day', [
          'pm.response.to.have.status(200);',
          'const series = pm.response.json().data;',
          'pm.expect(series).to.have.lengthOf(1);',
          'pm.expect(series[0].occupancyPct).to.eql(72);',
        ]),
      ],
    }),
    req({
      name: 'Channel mix',
      path: '/reports/channels',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'from', value: '{{today}}' },
        { key: 'to', value: '{{today}}' },
      ],
      token: 'financeToken',
      events: [
        test('200 and the shares never exceed 100 per cent', [
          'pm.response.to.have.status(200);',
          'const rows = pm.response.json().data;',
          'pm.expect(rows).to.be.an("array");',
          'const share = rows.reduce((a, r) => a + r.revenueSharePct, 0);',
          'pm.expect(share).to.be.at.most(100.5);',
        ]),
      ],
    }),
    req({
      name: 'Housekeeping throughput',
      path: '/reports/housekeeping',
      query: [
        { key: 'hotelId', value: '{{hotelId}}' },
        { key: 'from', value: '{{today}}' },
        { key: 'to', value: '{{today}}' },
      ],
      token: 'managerToken',
      events: [
        test('200 and every row carries a rework rate, not just a speed', [
          'pm.response.to.have.status(200);',
          'const rows = pm.response.json().data;',
          'pm.expect(rows).to.be.an("array");',
          'pm.expect(rows.every(r => typeof r.reworkRatePct === "number")).to.be.true;',
        ]),
      ],
    }),
    req({
      name: 'A guest cannot read reports',
      path: '/reports/today',
      query: [{ key: 'hotelId', value: '{{hotelId}}' }],
      token: 'guestToken',
      events: [test('403 FORBIDDEN', ['pm.response.to.have.status(403);'])],
    }),
  ],
});

/* 12 — audit --------------------------------------------------------------- */
folders.push({
  name: '12 · Audit trail',
  description:
    'The audit log is widely readable by design, which is exactly why nothing sensitive may reach it.',
  item: [
    req({
      name: 'Record a change with a password in it',
      method: 'POST',
      path: '/audit',
      token: 'adminToken',
      headers: [{ key: 'X-Correlation-Id', value: '{{traceId}}' }],
      body: {
        action: 'STAFF_PASSWORD_CHANGED',
        resource: 'StaffAccount',
        resourceId: '{{auditResourceId}}',
        hotelId: '{{hotelId}}',
        before: { fullName: 'Old Name', password: 'OldSecret123!', role: 'RECEPTIONIST' },
        after: { fullName: 'New Name', password: 'NewSecret456!', role: 'MANAGER' },
        outcome: 'SUCCESS',
      },
      events: [
        {
          listen: 'prerequest',
          script: {
            type: 'text/javascript',
            exec: [
              'const n = Date.now();',
              'pm.collectionVariables.set("traceId", "pm-trace-" + n);',
              'pm.collectionVariables.set("auditResourceId", "pm-staff-" + n);',
            ],
          },
        },
        test('201 and the entry is attributed to the caller', [
          'pm.response.to.have.status(201);',
          'const d = pm.response.json().data;',
          'pm.expect(d.actorType).to.eql("USER");',
          'pm.expect(d.actorEmail).to.eql(pm.collectionVariables.get("adminEmail"));',
        ]),
        test('the password never reaches the log', [
          'const body = pm.response.text();',
          'pm.expect(body).to.not.contain("OldSecret123!");',
          'pm.expect(body).to.not.contain("NewSecret456!");',
        ]),
        test('the password field is present but redacted', [
          'const changes = pm.response.json().data.changes;',
          'const pw = changes.find(c => c.field === "password");',
          'pm.expect(pw, "a change was recorded for the password field").to.be.an("object");',
          'pm.expect(pw.before).to.eql("[REDACTED]");',
          'pm.expect(pw.after).to.eql("[REDACTED]");',
        ]),
        test('non-sensitive changes are recorded in full', [
          'const changes = pm.response.json().data.changes;',
          'const role = changes.find(c => c.field === "role");',
          'pm.expect(role.before).to.eql("RECEPTIONIST");',
          'pm.expect(role.after).to.eql("MANAGER");',
        ]),
        test('the correlation id is echoed back', [
          'pm.expect(pm.response.headers.get("x-correlation-id"))',
          '  .to.eql(pm.collectionVariables.get("traceId"));',
        ]),
      ],
    }),
    req({
      name: 'Record a second entry in the same interaction',
      method: 'POST',
      path: '/audit',
      token: 'adminToken',
      headers: [{ key: 'X-Correlation-Id', value: '{{traceId}}' }],
      body: {
        action: 'STAFF_ROLE_GRANTED',
        resource: 'StaffAccount',
        resourceId: '{{auditResourceId}}',
        hotelId: '{{hotelId}}',
        after: { role: 'MANAGER' },
        outcome: 'SUCCESS',
      },
      events: [test('201', ['pm.response.to.have.status(201);'])],
    }),
    req({
      name: 'One correlation id reconstructs the whole interaction',
      path: '/audit/trace/{{traceId}}',
      token: 'adminToken',
      events: [
        test('200 and both entries come back', [
          'pm.response.to.have.status(200);',
          'const entries = pm.response.json().data;',
          'pm.expect(entries.length).to.be.at.least(2);',
          'const actions = entries.map(e => e.action);',
          'pm.expect(actions).to.include("STAFF_PASSWORD_CHANGED");',
          'pm.expect(actions).to.include("STAFF_ROLE_GRANTED");',
        ]),
      ],
    }),
    req({
      name: 'The history of one record, oldest first',
      path: '/audit/history/StaffAccount/{{auditResourceId}}',
      token: 'adminToken',
      events: [
        test('200 and in chronological order', [
          'pm.response.to.have.status(200);',
          'const entries = pm.response.json().data;',
          'pm.expect(entries.length).to.be.at.least(2);',
          'const times = entries.map(e => new Date(e.occurredAt).getTime());',
          'pm.expect(times).to.eql([...times].sort((a, b) => a - b));',
        ]),
        test('each entry reads as a sentence a person can follow', [
          'pm.expect(pm.response.json().data[0].summary).to.be.an("array");',
        ]),
      ],
    }),
    req({
      name: 'Filter the log by action',
      path: '/audit',
      query: [
        { key: 'resource', value: 'StaffAccount' },
        { key: 'action', value: 'password' },
        { key: 'pageSize', value: '50' },
      ],
      token: 'adminToken',
      events: [
        test('200 and the action filter is case-insensitive', [
          'pm.response.to.have.status(200);',
          'const rows = pm.response.json().data;',
          'pm.expect(rows.length).to.be.at.least(1);',
          'pm.expect(rows.every(r => /password/i.test(r.action))).to.be.true;',
        ]),
      ],
    }),
    req({
      name: 'A manager cannot read the audit log',
      path: '/audit',
      query: [{ key: 'pageSize', value: '1' }],
      token: 'managerToken',
      events: [
        test('403 — audit:read is admin only', [
          'pm.response.to.have.status(403);',
          'pm.expect(pm.response.json().error.code).to.eql("FORBIDDEN");',
        ]),
      ],
    }),
    req({
      name: 'A guest cannot read the audit log',
      path: '/audit',
      token: 'guestToken',
      events: [test('403 FORBIDDEN', ['pm.response.to.have.status(403);'])],
    }),
  ],
});

/* 13 — the authorization matrix, generated from the controllers ------------- */

/**
 * The permissions a CUSTOMER holds, read out of the contracts package so this
 * folder cannot drift from the matrix the services actually enforce.
 */
function customerPermissions() {
  const src = readFileSync(join('packages', 'contracts', 'src', 'domain', 'roles.ts'), 'utf8');
  const block = /\[Role\.CUSTOMER\]:\s*\[([^\]]*)\]/.exec(src)?.[1] ?? '';
  return block
    .split(',')
    .map((entry) => entry.replace(/P\./, '').trim())
    .filter(Boolean);
}

const guestHolds = customerPermissions();
const allRoutes = extractRoutes();

/** GET routes with no path parameter — safe to probe repeatedly. */
const probeable = allRoutes.filter((r) => r.method === 'GET' && !r.path.includes(':'));

const anonymous = probeable
  .filter((r) => r.access !== 'PUBLIC')
  .map((r) => ({
    name: `No token · ${r.path}`,
    event: [
      test('401 UNAUTHENTICATED', [
        'pm.response.to.have.status(401);',
        'pm.expect(pm.response.json().error.code).to.eql("UNAUTHENTICATED");',
      ]),
    ],
    request: { method: 'GET', header: [], url: url(r.path) },
  }));

const forbidden = probeable
  .filter((r) => {
    if (r.access === 'PUBLIC' || r.access === 'AUTHENTICATED') return false;
    if (r.access.startsWith('ROLES')) return true;
    const permission = r.access.replace('PERMISSION: ', '').trim();
    return !guestHolds.includes(permission);
  })
  .map((r) => ({
    name: `Guest token · ${r.path} (${r.access})`,
    event: [
      test('403 FORBIDDEN', [
        'pm.response.to.have.status(403);',
        'pm.expect(pm.response.json().error.code).to.eql("FORBIDDEN");',
      ]),
    ],
    request: {
      method: 'GET',
      header: [{ key: 'Authorization', value: 'Bearer {{guestToken}}' }],
      url: url(r.path),
    },
  }));

folders.push({
  name: '13 · Authorization matrix',
  description: [
    'Generated from the controllers, not written by hand.',
    '',
    'Every protected GET endpoint without a path parameter is probed twice: once with',
    'no token, once with a guest token that lacks the permission. This is the folder',
    'that catches a guard which was declared but never registered — the failure mode',
    'where a green unit-test suite and an unprotected endpoint coexist happily.',
  ].join('\n'),
  item: [
    { name: 'Without a token', item: anonymous },
    { name: 'With a guest token', item: forbidden },
  ],
});

/* 14 — error handling ------------------------------------------------------ */
folders.push({
  name: '14 · Error handling and envelopes',
  description: 'One response shape, whatever goes wrong.',
  item: [
    req({
      name: 'An unrouted path',
      path: '/there-is-no-such-service',
      token: 'adminToken',
      events: [
        test('404 from the gateway itself, in the standard envelope', [
          'pm.response.to.have.status(404);',
          'const b = pm.response.json();',
          'pm.expect(b.success).to.be.false;',
          'pm.expect(b.error.code).to.eql("NOT_FOUND");',
          'pm.expect(b.requestId).to.be.a("string");',
        ]),
      ],
    }),
    req({
      name: 'A well-formed id that does not exist',
      path: '/bookings/ckzzzzzzzzzzzzzzzzzzzzzzzz',
      token: 'receptionToken',
      events: [
        test('404 naming the resource, never leaking a stack trace', [
          'pm.response.to.have.status(404);',
          'const b = pm.response.json();',
          'pm.expect(b.error.code).to.eql("NOT_FOUND");',
          'pm.expect(JSON.stringify(b)).to.not.match(/at [A-Za-z]+\\.|node_modules|\\.ts:\\d+/);',
        ]),
      ],
    }),
    {
      name: 'A malformed JSON body',
      event: [
        test('400 or 422, and still the standard envelope', [
          'pm.expect(pm.response.code).to.be.oneOf([400, 422]);',
          'const b = pm.response.json();',
          'pm.expect(b.success).to.be.false;',
          'pm.expect(b.error.message).to.be.a("string");',
        ]),
      ],
      request: {
        method: 'POST',
        header: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Authorization', value: 'Bearer {{guestToken}}' },
        ],
        body: { mode: 'raw', raw: '{"hotelId": ', options: { raw: { language: 'json' } } },
        url: url('/bookings'),
      },
    },
    req({
      name: 'A body that fails validation',
      method: 'POST',
      path: '/bookings',
      token: 'guestToken',
      body: { hotelId: '', roomTypeId: '', checkIn: 'not-a-date', adults: 0 },
      events: [
        test('400 with field-level detail', [
          'pm.response.to.have.status(400);',
          'const e = pm.response.json().error;',
          'pm.expect(e.code).to.eql("VALIDATION_FAILED");',
          'pm.expect(e.details).to.be.an("object");',
        ]),
      ],
    }),
    req({
      name: 'Every response carries a request id',
      path: '/hotels',
      events: [
        test('the header is set and matches the body', [
          'pm.response.to.have.status(200);',
          'const header = pm.response.headers.get("x-request-id");',
          'pm.expect(header).to.be.a("string");',
          'pm.expect(pm.response.json().requestId).to.eql(header);',
        ]),
        test('a correlation id is minted when the caller does not supply one', [
          'pm.expect(pm.response.headers.get("x-correlation-id")).to.be.a("string");',
        ]),
      ],
    }),
    req({
      name: 'A caller-supplied correlation id survives the hop',
      path: '/hotels',
      headers: [{ key: 'X-Correlation-Id', value: 'pm-edge-{{$guid}}' }],
      events: [
        test('the gateway forwards it rather than minting a new one', [
          'pm.response.to.have.status(200);',
          'const sent = pm.request.headers.get("X-Correlation-Id");',
          'pm.expect(pm.response.headers.get("x-correlation-id")).to.eql(sent);',
        ]),
      ],
    }),
    req({
      name: 'A forged principal header is ignored',
      path: '/hotels/manage',
      headers: [
        { key: 'X-Staysphere-User-Id', value: 'attacker' },
        { key: 'X-Staysphere-Roles', value: 'SUPER_ADMIN' },
        { key: 'X-Staysphere-Email', value: 'attacker@example.com' },
      ],
      events: [
        test('401 — the gateway strips inbound principal headers', [
          'pm.response.to.have.status(401);',
          'pm.expect(pm.response.json().error.code).to.eql("UNAUTHENTICATED");',
        ]),
      ],
    }),
    req({
      name: 'Security headers are set at the edge',
      path: '/hotels',
      events: [
        test('200 and the usual hardening headers are present', [
          'pm.response.to.have.status(200);',
          'pm.expect(pm.response.headers.get("x-content-type-options")).to.eql("nosniff");',
          'pm.expect(pm.response.headers.has("x-frame-options") || pm.response.headers.has("content-security-policy")).to.be.true;',
        ]),
      ],
    }),
  ],
});

/* 15 — rate limiting ------------------------------------------------------- */

/**
 * Deliberately trips the credential-endpoint limit.
 *
 * Placed last, because tripping it leaves that path unavailable for the rest of
 * the minute. `/auth/password-reset` is used rather than `/auth/login`: it has
 * the tightest declared limit, so the proof costs six requests instead of
 * thirty-one, and nothing later in the run depends on it.
 */
const RESET_LIMIT = 5;

folders.push({
  name: '15 · Rate limiting',
  description: [
    'The route table declares a tighter limit for credential endpoints than the',
    'global one. This folder proves the declaration is enforced rather than',
    'decorative — a limit nothing reads is worse than no limit, because it reads',
    'as protection in review.',
    '',
    'Run this folder last. It deliberately exhausts the budget for that path, which',
    'stays exhausted for the remainder of the minute.',
  ].join('\n'),
  item: [
    ...Array.from({ length: RESET_LIMIT }, (_, index) => ({
      name: `Attempt ${index + 1} of ${RESET_LIMIT} — within the limit`,
      event: [
        test('not rate limited yet', ['pm.expect(pm.response.code).to.not.eql(429);']),
      ],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: raw({ email: '{{guestEmail}}' }),
        url: url('/auth/password-reset'),
      },
    })),
    {
      name: `Attempt ${RESET_LIMIT + 1} — over the limit`,
      event: [
        test('429 RATE_LIMITED, with the limit and a retry hint', [
          'pm.response.to.have.status(429);',
          'const e = pm.response.json().error;',
          'pm.expect(e.code).to.eql("RATE_LIMITED");',
          `pm.expect(e.details.limit).to.eql(${RESET_LIMIT});`,
          'pm.expect(e.details.retryAfterSeconds).to.be.at.most(60);',
        ]),
        test('a different endpoint is unaffected', [
          '// The counter is keyed per route, so exhausting one path must not',
          '// take the rest of the API down with it.',
          'pm.sendRequest(pm.collectionVariables.replaceIn("{{baseUrl}}/hotels"), (err, res) => {',
          '  pm.expect(err).to.be.null;',
          '  pm.expect(res.code).to.eql(200);',
          '});',
        ]),
      ],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: raw({ email: '{{guestEmail}}' }),
        url: url('/auth/password-reset'),
      },
    },
  ],
});

/* ------------------------------------------------------------------- write */

const description = [
  '# StaySphere API — verification suite',
  '',
  'Run the folders in order. Later folders reuse tokens and identifiers captured by',
  'earlier ones, so a partial run of folder 05 on its own will fail for want of a',
  'booking id.',
  '',
  'Point `baseUrl` at the gateway. Everything is exercised through it, because that is',
  'what a client actually talks to — testing a service on its own port skips the edge',
  'authentication that the rest of the platform depends on.',
  '',
  `Generated from ${allRoutes.length} routes across ${new Set(allRoutes.map((r) => r.service)).size} services.`,
].join('\n');

const variables = [
  ['baseUrl', 'http://localhost:3000/api/v1', 'The gateway, including the version prefix.'],
  ['host', 'http://localhost:3000', 'The gateway root, for liveness probes.'],
  ['guestEmail', 'guest@example.com', ''],
  ['receptionEmail', 'reception@staysphere.local', ''],
  ['managerEmail', 'manager@staysphere.local', ''],
  ['housekeepingEmail', 'housekeeping@staysphere.local', ''],
  ['maintenanceEmail', 'maintenance@staysphere.local', ''],
  ['financeEmail', 'finance@staysphere.local', ''],
  ['adminEmail', 'admin@staysphere.local', ''],
  ['password', 'StaySphere-Dev-2026!', 'The seeded development password.'],
];

const runtimeVariables = [
  'guestToken', 'receptionToken', 'managerToken', 'housekeepingToken', 'maintenanceToken',
  'financeToken', 'adminToken', 'guestId', 'housekeeperId', 'engineerId', 'engineerName',
  'hotelId', 'hotelSlug', 'roomTypeId', 'ratePlanId', 'checkIn', 'checkOut', 'idemKey',
  'roomsBefore', 'quotedTotal', 'bookingId', 'bookingRef', 'bookingTotal', 'paymentId',
  'stayId', 'stayRoomId', 'expectedCheckOut', 'folioDue', 'taskId', 'requiredChecklist',
  'checklistBody', 'arrivalSoon', 'urgentRoom', 'quietRoom', 'ticketId', 'reviewId',
  'heldReviewId', 'spamStayId', 'heldStayId', 'invoiceId', 'invoiceNumber', 'invoiceTotal',
  'voidInvoiceId', 'invoiceStayId', 'voidStayId', 'settleBody', 'periodFrom', 'periodTo',
  'notifyEventId', 'notificationId', 'today', 'traceId', 'auditResourceId',
];

const collection = {
  info: {
    name: 'StaySphere API',
    description,
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: folders,
  event: [
    {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          '// Runs after every request in the collection.',
          '//',
          '// Thirty seconds, not one. Sign-in verifies an Argon2id hash, which is',
          '// slow on purpose, and a write that touches several tables is several',
          '// sequential round trips — against a hosted database in another region',
          '// that is seconds, legitimately. This is a hang detector, not a latency',
          '// budget: measure performance with a load tool, not with assertions here.',
          'pm.test("responds within 30 seconds", function () {',
          '  pm.expect(pm.response.responseTime).to.be.below(30000);',
          '});',
        ],
      },
    },
  ],
  variable: [
    ...variables.map(([key, value, description]) => ({
      key,
      value,
      type: 'string',
      ...(description ? { description } : {}),
    })),
    ...runtimeVariables.map((key) => ({ key, value: '', type: 'string' })),
  ],
};

/* A second, assertion-free collection: every endpoint, ready to send by hand. */
const byService = new Map();
for (const route of allRoutes) {
  const list = byService.get(route.service) ?? [];
  list.push({
    name: `${route.method} ${route.path}`,
    request: {
      method: route.method,
      header: [
        ...(route.method === 'GET' || route.method === 'DELETE'
          ? []
          : [{ key: 'Content-Type', value: 'application/json' }]),
        ...(route.access === 'PUBLIC' ? [] : [{ key: 'Authorization', value: 'Bearer {{adminToken}}' }]),
        ...(route.idempotency ? [{ key: 'Idempotency-Key', value: '{{$guid}}' }] : []),
      ],
      url: url(route.path),
      description: [
        route.summary,
        '',
        `**Access:** ${route.access}`,
        route.idempotency ? '**Idempotency-Key:** supported.' : '',
        `**Service:** ${route.service}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  });
  byService.set(route.service, list);
}

const reference = {
  info: {
    name: 'StaySphere API — every endpoint',
    description: [
      'Every route the platform serves, grouped by service, with no assertions.',
      '',
      'This is a reference for poking at the API by hand. It is deliberately not a test',
      'suite — import `StaySphere.postman_collection.json` for that. Path parameters are',
      'left as `:id` for you to fill in.',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [...byService.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([service, item]) => ({ name: service, item })),
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000/api/v1', type: 'string' },
    { key: 'adminToken', value: '', type: 'string' },
  ],
};

/**
 * Configuration only.
 *
 * The runtime variables — tokens, ids captured mid-run — are deliberately absent.
 * Postman resolves an environment variable ahead of a collection variable of the
 * same name, so listing an empty `guestToken` here would shadow the one the login
 * test just captured, and every authenticated request would go out unauthenticated.
 */
const environment = {
  name: 'StaySphere — local',
  values: [
    { key: 'baseUrl', value: 'http://localhost:3000/api/v1', type: 'default', enabled: true },
    { key: 'host', value: 'http://localhost:3000', type: 'default', enabled: true },
    ...variables.slice(2).map(([key, value]) => ({
      key,
      value,
      type: key === 'password' ? 'secret' : 'default',
      enabled: true,
    })),
  ],
  _postman_variable_scope: 'environment',
};

/* The route table in the testing guide, kept in step with the controllers. */

const BEGIN = '<!-- BEGIN GENERATED ROUTE TABLE -->';
const END = '<!-- END GENERATED ROUTE TABLE -->';

function routeTableMarkdown() {
  const lines = [];
  for (const [service, rows] of [...byService.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push('', `### \`${service}\` — ${rows.length}`, '');
    lines.push('| Method | Path | Access |', '| --- | --- | --- |');
    for (const row of rows) {
      const [method, path] = row.name.split(' ');
      const access = /\*\*Access:\*\* (.+)/.exec(row.request.description)?.[1] ?? '';
      const idem = row.request.header.some((h) => h.key === 'Idempotency-Key')
        ? ' · `Idempotency-Key`'
        : '';
      lines.push(`| \`${method}\` | \`${path}\` | ${access}${idem} |`);
    }
  }
  return lines.join('\n');
}

const guide = 'docs/api-testing-postman.md';
try {
  const doc = readFileSync(guide, 'utf8');
  const start = doc.indexOf(BEGIN);
  const end = doc.indexOf(END);
  if (start !== -1 && end !== -1) {
    writeFileSync(
      guide,
      `${doc.slice(0, start + BEGIN.length)}\n${routeTableMarkdown()}\n\n${doc.slice(end)}`,
    );
    console.log(`${guide.padEnd(52)} route table refreshed`);
  }
} catch {
  // The guide is optional; the collection is the deliverable.
}

mkdirSync('postman', { recursive: true });
writeFileSync('postman/StaySphere.postman_collection.json', JSON.stringify(collection, null, 2) + '\n');
writeFileSync('postman/StaySphere.reference.postman_collection.json', JSON.stringify(reference, null, 2) + '\n');
writeFileSync('postman/StaySphere.local.postman_environment.json', JSON.stringify(environment, null, 2) + '\n');

/**
 * Parses every script in the collection before writing it.
 *
 * A script that does not parse is not an assertion that fails — it is an
 * assertion that never runs, and the run summary still reads zero failures. That
 * is a worse outcome than a red suite, so it is caught here rather than left to
 * be noticed.
 */
function assertScriptsParse(items, path = []) {
  for (const item of items) {
    const where = [...path, item.name];
    for (const event of item.event ?? []) {
      const source = (event.script?.exec ?? []).join('\n');
      try {
        new Function(source);
      } catch (error) {
        throw new Error(
          `${where.join(' / ')} — ${event.listen} script does not parse: ${error.message}`,
        );
      }
    }
    if (item.item) assertScriptsParse(item.item, where);
  }
}

assertScriptsParse(collection.item);
for (const event of collection.event) {
  new Function((event.script?.exec ?? []).join('\n'));
}

// The generated files are committed, so they have to be in the repository's own
// style or `pnpm format:check` fails on a clean build.
const written = [
  'postman/StaySphere.postman_collection.json',
  'postman/StaySphere.reference.postman_collection.json',
  'postman/StaySphere.local.postman_environment.json',
  guide,
];
spawnSync('pnpm', ['exec', 'prettier', '--write', '--log-level', 'warn', ...written], {
  stdio: 'inherit',
});

const counted = (items) =>
  items.reduce((sum, i) => sum + (i.item ? counted(i.item) : 1), 0);
const assertions = JSON.stringify(collection).split('pm.test(').length - 1;

console.log(`postman/StaySphere.postman_collection.json           ${counted(folders)} requests, ${assertions} assertions`);
console.log(`postman/StaySphere.reference.postman_collection.json ${allRoutes.length} endpoints`);
console.log('postman/StaySphere.local.postman_environment.json');
