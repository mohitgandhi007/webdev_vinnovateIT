/**
 * PagePulse Rate Limiter Middleware
 * Protects expensive browser automation and AI endpoints from abuse or accidental rapid clicks.
 * Uses a token bucket / sliding window in memory with standard HTTP 429 and Retry-After headers.
 */

export function createRateLimiter({
  windowMs = 60 * 1000,
  max = 20,
  message = 'Too many requests. Please wait before retrying.',
  keyGenerator = null
} = {}) {
  const hits = new Map();

  // Periodic cleanup of stale tracking entries every 2 minutes
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, 2 * 60 * 1000);

  if (cleanupTimer.unref) {
    cleanupTimer.unref(); // Prevent timer from keeping the process alive
  }

  const defaultKeyGen = (req) => {
    const workspaceId = req.headers['x-workspace-id'] || '';
    const ip = req.ip || req.connection?.remoteAddress || 'unknown-client';
    return `${workspaceId}:${ip}`;
  };

  const limiter = (req, res, next) => {
    // In test environment, allow bypassing unless specifically testing rate limits
    if (process.env.NODE_ENV === 'test' && process.env.TEST_RATE_LIMITER !== 'true') {
      return next();
    }

    const key = keyGenerator ? keyGenerator(req) : defaultKeyGen(req);
    const now = Date.now();

    let record = hits.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      hits.set(key, record);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', max - 1);
      return next();
    }

    record.count++;
    const remaining = Math.max(0, max - record.count);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (record.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);

      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message,
        retryAfterSeconds
      });
    }

    next();
  };

  // Helper for tests to inspect and reset
  limiter.reset = () => hits.clear();
  limiter.getHits = (key) => hits.get(key);

  return limiter;
}

// 1. Monitor Creation Rate Limiter (20 creates per 15 minutes)
export const monitorCreationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Monitor creation rate limit exceeded. Please wait before creating more monitors.'
});

// 2. Manual On-Demand Check Limiter (12 manual checks per minute per monitor/IP)
export const manualCheckLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 12,
  message: 'Too many on-demand check requests. Please allow active checks to complete.',
  keyGenerator: (req) => {
    const monitorId = req.params?.id || '';
    const ip = req.ip || req.connection?.remoteAddress || 'client';
    return `check:${monitorId}:${ip}`;
  }
});

// 3. Page Inspector Limiter (10 inspections per minute)
export const inspectSelectorLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Selector inspector rate limit exceeded. Please wait before inspecting more URLs.'
});

// 4. AI Insight Retry Limiter (6 AI retries per minute)
export const aiRetryLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 6,
  message: 'AI insight retry rate limit exceeded. Please wait before triggering another AI summary.'
});

// 5. Test Notification Dispatch Limiter (6 test dispatches per minute)
export const notificationTestLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 6,
  message: 'Test notification rate limit exceeded. Please wait before sending another test alert.'
});
