const { AppError } = require('../utils/errors');

const errorHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const payload = { error: err.code, message: err.message, details: err.details || undefined };
    if (err.status === 429 && err.details?.retryAfter) {
      const retryAfter = Number(err.details.retryAfter);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        payload.retryAfter = retryAfter;
        res.setHeader('Retry-After', String(Math.ceil(retryAfter)));
      }
    }
    return res.status(err.status).json(payload);
  }

  console.error(err);
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
};

module.exports = { errorHandler };
