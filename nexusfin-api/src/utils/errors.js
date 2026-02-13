class AppError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, code = 'VALIDATION_ERROR', details = null) => new AppError(422, code, message, details);
const unauthorized = (message = 'No autorizado', code = 'UNAUTHORIZED') => new AppError(401, code, message);
const forbidden = (message = 'Operación no permitida', code = 'FORBIDDEN') => new AppError(403, code, message);
const notFound = (message = 'No encontrado', code = 'NOT_FOUND') => new AppError(404, code, message);
const conflict = (message, code = 'CONFLICT') => new AppError(409, code, message);
const tooManyRequests = (message = 'Demasiados intentos', code = 'TOO_MANY_REQUESTS') => new AppError(429, code, message);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, tooManyRequests };
