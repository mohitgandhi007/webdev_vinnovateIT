/**
 * Per-Host Throttler and Rate Limiter
 * Prevents multiple concurrent checks from overwhelming a single host
 * and enforces polite delays between consecutive fetches to the same domain.
 */

class HostThrottler {
  constructor(options = {}) {
    // Minimum interval between requests to the same hostname (e.g. 1000ms)
    this.minIntervalMs = options.minIntervalMs || 1000;
    // Maximum concurrent requests to the same hostname
    this.maxConcurrentPerHost = options.maxConcurrentPerHost || 2;

    this.lastRequestTimes = new Map();
    this.activePerHost = new Map();
    this.waitingQueue = new Map();
  }

  extractHostname(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase();
    } catch {
      return 'unknown-host';
    }
  }

  /**
   * Acquire a slot for fetching a URL with polite spacing and host concurrency limits
   */
  async acquire(url) {
    const host = this.extractHostname(url);

    while (true) {
      const activeCount = this.activePerHost.get(host) || 0;
      const lastTime = this.lastRequestTimes.get(host) || 0;
      const now = Date.now();
      const elapsed = now - lastTime;

      if (activeCount < this.maxConcurrentPerHost && elapsed >= this.minIntervalMs) {
        // Safe to proceed
        this.activePerHost.set(host, activeCount + 1);
        this.lastRequestTimes.set(host, now);
        return;
      }

      // Calculate needed wait time
      const waitTime = Math.max(50, this.minIntervalMs - elapsed);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Release host slot after fetch completes
   */
  release(url) {
    const host = this.extractHostname(url);
    const activeCount = this.activePerHost.get(host) || 1;
    if (activeCount <= 1) {
      this.activePerHost.delete(host);
    } else {
      this.activePerHost.set(host, activeCount - 1);
    }
    this.lastRequestTimes.set(host, Date.now());
  }
}

export const hostThrottler = new HostThrottler({
  minIntervalMs: process.env.NODE_ENV === 'test' ? 10 : 1000,
  maxConcurrentPerHost: 2
});
