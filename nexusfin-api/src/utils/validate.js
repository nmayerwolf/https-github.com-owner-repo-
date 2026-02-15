const { badRequest } = require('./errors');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const validatePassword = (password) => {
  const value = String(password || '');
  if (value.length < 8 || !/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    throw badRequest('La contraseña debe tener al menos 8 caracteres, 1 letra y 1 número', 'WEAK_PASSWORD');
  }
  return value;
};

const validateEmail = (email) => {
  const value = normalizeEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(value)) {
    throw badRequest('Email inválido', 'INVALID_EMAIL');
  }
  return value;
};

const validatePositiveNumber = (value, field) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw badRequest(`${field} debe ser mayor a 0`, 'VALIDATION_ERROR');
  }
  return n;
};

const sanitizeText = (value, { field = 'campo', maxLen = 500, allowEmpty = true } = {}) => {
  const raw = String(value ?? '');
  // Remove control chars that can break logs/rendering.
  const cleaned = raw.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();

  if (!allowEmpty && !cleaned) {
    throw badRequest(`${field} requerido`, 'VALIDATION_ERROR');
  }

  if (cleaned.length > maxLen) {
    throw badRequest(`${field} no puede superar ${maxLen} caracteres`, 'VALIDATION_ERROR');
  }

  return cleaned;
};

module.exports = {
  normalizeEmail,
  validatePassword,
  validateEmail,
  validatePositiveNumber,
  sanitizeText
};
