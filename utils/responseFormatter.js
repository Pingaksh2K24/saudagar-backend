class ResponseFormatter {
  static success(res, statusCode, message, data = null) {
    const response = {
      success: true,
      statusCode,
      message,
      timestamp: new Date().toISOString()
    };

    if (data) {
      response.data = data;
    }

    return res.status(200).json(response);
  }

  static error(res, statusCode, message, field = 'server') {
    return res.status(200).json({
      success: false,
      statusCode,
      message,
      errors: { field },
      timestamp: new Date().toISOString()
    });
  }
}

// Named exports for backward compatibility
export const successResponse = ResponseFormatter.success;
export const errorResponse = ResponseFormatter.error;

export default ResponseFormatter;
