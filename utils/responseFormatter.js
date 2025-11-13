export const formatResponse = (success, statusCode, message, data = null, errors = null) => ({
  success,
  statusCode,
  message,
  ...(data && { data }),
  ...(errors && { errors }),
  timestamp: new Date().toISOString(),
});

export const successResponse = (message, data = null) => 
  formatResponse(true, 200, message, data);

export const errorResponse = (message, statusCode = 500, errors = { field: 'server' }) => 
  formatResponse(false, statusCode, message, null, errors);

export const validationErrorResponse = (message) => 
  formatResponse(false, 400, message, null, { field: 'validation' });