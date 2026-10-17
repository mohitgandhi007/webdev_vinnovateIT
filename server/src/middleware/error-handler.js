import { config } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  let code = err.code;

  if (!code) {
    if (status === 404) code = 'NOT_FOUND';
    else if (status === 400) code = 'BAD_REQUEST';
    else if (status === 401) code = 'UNAUTHORIZED';
    else if (status === 403) code = 'FORBIDDEN';
    else if (status === 409) code = 'CONFLICT';
    else code = 'INTERNAL_SERVER_ERROR';
  }

  if (config.isDev || config.isTest) {
    if (status === 500) {
      console.error(`[Error] ${req.method} ${req.url} -> ${err.message}`);
      console.error(err.stack);
    }
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message: err.message || 'An unexpected error occurred.',
      ...(config.isDev ? { stack: err.stack } : {})
    }
  });
}


export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'RESOURCE_NOT_FOUND',
      message: `The requested endpoint '${req.method} ${req.path}' does not exist.`
    }
  });
}
