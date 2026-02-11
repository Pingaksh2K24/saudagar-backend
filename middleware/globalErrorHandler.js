import ErrorLogService from '../services/ErrorLogService.js';

export const globalErrorHandler = async (err, req, res, next) => {
  console.error('=== GLOBAL ERROR ===');
  console.error('Error Message:', err.message);
  console.error('Error Stack:', err.stack);
  console.error('Request URL:', req.url);
  console.error('Request Method:', req.method);
  
  // Log error to database
  await ErrorLogService.logError(err, req, req.user?.id);
  
  if (res.headersSent) return next(err);
  
  res.status(200).json({
    success: false,
    statusCode: 500,
    message: err.message || 'Internal server error',
    errors: { field: 'server' },
    timestamp: new Date().toISOString(),
  });
};