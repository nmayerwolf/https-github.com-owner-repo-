const { parseTokenFromUrl, parseCookieHeader, parseTokenFromRequest, normalizeSymbols } = require('../src/realtime/wsHub');

describe('wsHub helpers', () => {
  test('parseTokenFromUrl extracts token param', () => {
    expect(parseTokenFromUrl('/ws?token=abc123')).toBe('abc123');
  });

  test('parseTokenFromUrl returns null for invalid input', () => {
    expect(parseTokenFromUrl('%%%')).toBeNull();
  });

  test('parseCookieHeader parses cookie pairs', () => {
    expect(parseCookieHeader('a=1; nxf_token=abc.123; theme=light')).toEqual({
      a: '1',
      nxf_token: 'abc.123',
      theme: 'light'
    });
  });

  test('parseTokenFromRequest prefers query token over cookie', () => {
    expect(parseTokenFromRequest({ url: '/ws?token=from-query', headers: { cookie: 'nxf_token=from-cookie' } })).toBe('from-query');
  });

  test('parseTokenFromRequest falls back to nxf_token cookie', () => {
    expect(parseTokenFromRequest({ url: '/ws', headers: { cookie: 'foo=1; nxf_token=from-cookie' } })).toBe('from-cookie');
  });

  test('normalizeSymbols sanitizes and uppercases values', () => {
    expect(normalizeSymbols([' aapl ', 'NvDa', '', null])).toEqual(['AAPL', 'NVDA']);
  });

  test('normalizeSymbols handles non-array input', () => {
    expect(normalizeSymbols('AAPL')).toEqual([]);
  });
});
