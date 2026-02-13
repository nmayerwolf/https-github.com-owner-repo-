describe('env config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws when DATABASE_URL is missing', () => {
    process.env.JWT_SECRET = 'a'.repeat(32);

    expect(() => require('../src/config/env')).toThrow('Missing required env var: DATABASE_URL');
  });

  it('throws when JWT_SECRET is missing', () => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';

    expect(() => require('../src/config/env')).toThrow('Missing required env var: JWT_SECRET');
  });

  it('throws in production when JWT_SECRET is shorter than 32 chars', () => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
    process.env.JWT_SECRET = 'short-secret';
    process.env.NODE_ENV = 'production';

    expect(() => require('../src/config/env')).toThrow('JWT_SECRET must be at least 32 characters in production');
  });

  it('accepts short JWT_SECRET in development', () => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
    process.env.JWT_SECRET = 'short-secret';
    process.env.NODE_ENV = 'development';

    const { env } = require('../src/config/env');

    expect(env.jwtSecret).toBe('short-secret');
    expect(env.nodeEnv).toBe('development');
  });

  it('accepts strong JWT_SECRET in production', () => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
    process.env.JWT_SECRET = 'x'.repeat(32);
    process.env.NODE_ENV = 'production';

    const { env } = require('../src/config/env');

    expect(env.jwtSecret).toHaveLength(32);
    expect(env.nodeEnv).toBe('production');
  });
});
