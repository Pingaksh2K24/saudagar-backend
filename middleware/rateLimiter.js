const rateLimitStore = new Map();

export const createRateLimit = (windowMs = 15 * 60 * 1000, maxRequests = 1000) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    if (rateLimitStore.has(clientIP)) {
      const requests = rateLimitStore.get(clientIP).filter(time => time > windowStart);
      rateLimitStore.set(clientIP, requests);
    }
    
    const currentRequests = rateLimitStore.get(clientIP) || [];
    
    if (currentRequests.length >= maxRequests) {
      return res.status(200).json({
        success: false,
        statusCode: 429,
        message: 'Too many requests, please try again later',
        errors: { field: 'rate_limit' },
        timestamp: new Date().toISOString(),
      });
    }
    
    currentRequests.push(now);
    rateLimitStore.set(clientIP, currentRequests);
    
    next();
  };
};