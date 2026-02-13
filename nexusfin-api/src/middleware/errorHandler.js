const { AppError } = require('../utils/errors');

const errorHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, message: err.message, details: err.details || undefined });
  }

  console.error(err);
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
};

module.exports = { errorHandler };
