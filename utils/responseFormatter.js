class ResponseFormatter {
  static success(res, statusCode, message, data = null) {
    return res.status(200).json({
      success: true,
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString()
    });
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

export default ResponseFormatter;