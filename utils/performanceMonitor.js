class PerformanceMonitor {
  static startTimer(label) {
    return {
      label,
      startTime: process.hrtime.bigint()
    };
  }

  static endTimer(timer) {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - timer.startTime) / 1000000; // Convert to milliseconds
    
    if (duration > 1000) { // Log slow queries (>1s)
      console.warn(`🐌 SLOW OPERATION: ${timer.label} took ${duration.toFixed(2)}ms`);
    }
    
    return duration;
  }

  static logMemoryUsage() {
    const usage = process.memoryUsage();
    console.log('📊 Memory Usage:', {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`
    });
  }
}

export default PerformanceMonitor;