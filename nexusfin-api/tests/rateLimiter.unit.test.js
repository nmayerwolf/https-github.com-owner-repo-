const { keyFromUserOrIp } = require('../src/middleware/rateLimiter');

describe('rateLimiter helpers', () => {
  test('uses user id key when authenticated user exists', () => {
    const key = keyFromUserOrIp({ user: { id: 'u1' }, ip: '10.0.0.1' });
    expect(key).toBe('user:u1');
  });

  test('falls back to ip key when user is missing', () => {
    const key = keyFromUserOrIp({ ip: '10.0.0.1' });
    expect(key).toBe('ip:10.0.0.1');
  });
});
