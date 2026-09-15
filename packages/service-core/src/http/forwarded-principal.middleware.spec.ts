import { Role } from '@staysphere/contracts';
import { ForwardedPrincipalMiddleware, PRINCIPAL_HEADERS } from './forwarded-principal.middleware';

interface TestRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: unknown;
}

function run(headers: Record<string, string | string[] | undefined>): TestRequest {
  const req: TestRequest = { headers };
  const next = jest.fn();
  new ForwardedPrincipalMiddleware().use(req as never, {}, next);
  expect(next).toHaveBeenCalledTimes(1);
  return req;
}

const complete = {
  [PRINCIPAL_HEADERS.id]: 'usr_1',
  [PRINCIPAL_HEADERS.email]: 'staff@example.com',
  [PRINCIPAL_HEADERS.roles]: 'RECEPTIONIST,FINANCE',
  [PRINCIPAL_HEADERS.sessionId]: 'ses_1',
  [PRINCIPAL_HEADERS.hotelId]: 'htl_1',
};

describe('ForwardedPrincipalMiddleware', () => {
  it('reconstructs the principal the gateway verified', () => {
    expect(run(complete).principal).toEqual({
      id: 'usr_1',
      email: 'staff@example.com',
      roles: [Role.RECEPTIONIST, Role.FINANCE],
      sessionId: 'ses_1',
      hotelId: 'htl_1',
    });
  });

  it('omits the hotel scope for an unscoped principal', () => {
    const { [PRINCIPAL_HEADERS.hotelId]: _drop, ...rest } = complete;
    expect(run(rest).principal).not.toHaveProperty('hotelId');
  });

  it('attaches nothing when no principal was forwarded', () => {
    // The guard then fails closed, which is the right outcome.
    expect(run({}).principal).toBeUndefined();
  });

  it('attaches nothing for a partial forward', () => {
    for (const missing of Object.values(PRINCIPAL_HEADERS).filter(
      (h) => h !== PRINCIPAL_HEADERS.hotelId,
    )) {
      const headers = { ...complete };
      delete headers[missing];
      expect({ missing, principal: run(headers).principal }).toEqual({
        missing,
        principal: undefined,
      });
    }
  });

  it('discards a role the platform does not define', () => {
    const principal = run({ ...complete, [PRINCIPAL_HEADERS.roles]: 'RECEPTIONIST,ROOT' })
      .principal as { roles: string[] };
    expect(principal.roles).toEqual([Role.RECEPTIONIST]);
  });

  it('attaches nothing when every forwarded role is unknown', () => {
    expect(
      run({ ...complete, [PRINCIPAL_HEADERS.roles]: 'ROOT,SUPERUSER' }).principal,
    ).toBeUndefined();
  });

  it('tolerates whitespace in the role list', () => {
    const principal = run({ ...complete, [PRINCIPAL_HEADERS.roles]: ' MANAGER , FINANCE ' })
      .principal as { roles: string[] };
    expect(principal.roles).toEqual([Role.MANAGER, Role.FINANCE]);
  });

  it('takes the first value when a header arrives repeated', () => {
    const principal = run({ ...complete, [PRINCIPAL_HEADERS.id]: ['usr_1', 'usr_2'] })
      .principal as { id: string };
    expect(principal.id).toBe('usr_1');
  });
});
