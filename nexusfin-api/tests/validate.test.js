const { normalizeEmail, validateEmail, validatePassword, validatePositiveNumber } = require('../src/utils/validate');

describe('validate utils', () => {
  test('normalizeEmail lowercases and trims', () => {
    expect(normalizeEmail('  USER@Mail.Com  ')).toBe('user@mail.com');
  });

  test('validateEmail accepts valid email', () => {
    expect(validateEmail('test@example.com')).toBe('test@example.com');
  });

  test('validatePassword enforces basic policy', () => {
    expect(() => validatePassword('abc')).toThrow();
    expect(validatePassword('abc12345')).toBe('abc12345');
  });

  test('validatePositiveNumber rejects non-positive values', () => {
    expect(() => validatePositiveNumber(0, 'buyPrice')).toThrow();
    expect(validatePositiveNumber('12.5', 'buyPrice')).toBe(12.5);
  });
});
