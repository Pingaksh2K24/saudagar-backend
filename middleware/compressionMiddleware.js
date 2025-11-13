export const compressionMiddleware = (req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  
  if (acceptEncoding.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
  }
  
  // Compress responses larger than 1KB
  const originalSend = res.send;
  res.send = function(data) {
    if (typeof data === 'string' && data.length > 1024) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    originalSend.call(this, data);
  };
  
  next();
};