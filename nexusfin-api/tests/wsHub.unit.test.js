const { parseTokenFromUrl, normalizeSymbols } = require('../src/realtime/wsHub');

describe('wsHub helpers', () => {
  test('parseTokenFromUrl extracts token param', () => {
    expect(parseTokenFromUrl('/ws?token=abc123')).toBe('abc123');
  });

  test('parseTokenFromUrl returns null for invalid input', () => {
    expect(parseTokenFromUrl('%%%')).toBeNull();
  });

  test('normalizeSymbols sanitizes and uppercases values', () => {
    expect(normalizeSymbols([' aapl ', 'NvDa', '', null])).toEqual(['AAPL', 'NVDA']);
  });

  test('normalizeSymbols handles non-array input', () => {
    expect(normalizeSymbols('AAPL')).toEqual([]);
  });
});
