import { baseEnvSchema, parseBrokers, parseCorsOrigins, validateEnv } from './env.schema';

describe('validateEnv', () => {
  const valid = { SERVICE_NAME: 'booking-service', PORT: '3002' };

  it('applies defaults and coerces types', () => {
    const env = validateEnv(baseEnvSchema, valid as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(3002);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('reports every invalid key at once rather than only the first', () => {
    expect(() =>
      validateEnv(baseEnvSchema, { PORT: 'not-a-port', LOG_LEVEL: 'chatty' } as NodeJS.ProcessEnv),
    ).toThrow(/SERVICE_NAME[\s\S]*PORT[\s\S]*LOG_LEVEL|LOG_LEVEL[\s\S]*PORT/);
  });

  it('rejects a port outside the valid range', () => {
    expect(() =>
      validateEnv(baseEnvSchema, { ...valid, PORT: '70000' } as NodeJS.ProcessEnv),
    ).toThrow(/PORT/);
  });
});

describe('parseCorsOrigins', () => {
  it('treats * and empty as allow-any', () => {
    expect(parseCorsOrigins('*')).toBe(true);
    expect(parseCorsOrigins('   ')).toBe(true);
  });

  it('splits and trims an explicit allow-list', () => {
    expect(parseCorsOrigins('https://a.com, https://b.com ,')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});

describe('parseBrokers', () => {
  it('returns an empty list when unset', () => {
    expect(parseBrokers(undefined)).toEqual([]);
  });

  it('splits a comma-separated broker list', () => {
    expect(parseBrokers('kafka-1:9092, kafka-2:9092')).toEqual(['kafka-1:9092', 'kafka-2:9092']);
  });
});
