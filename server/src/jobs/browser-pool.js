import { chromium } from 'playwright';
import { logger } from '../utils/logger.js';

class BrowserPool {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 3;
    this.maxQueue = options.maxQueue || 50;
    this.activeCount = 0;
    this.queue = [];
    this.browser = null;
    this.launchPromise = null;
    this.isShuttingDown = false;
  }

  /**
   * Get or launch the shared Playwright browser instance
   */
  async getBrowser() {
    if (this.isShuttingDown) {
      throw new Error('Browser pool is shutting down');
    }

    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (!this.launchPromise) {
      this.launchPromise = (async () => {
        logger.info('BROWSER_LAUNCH', 'Launching headless Chromium browser instance...');
        const browser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--disable-extensions'
          ]
        });

        browser.on('disconnected', () => {
          logger.warn('BROWSER_DISCONNECTED', 'Chromium browser instance disconnected');
          this.browser = null;
          this.launchPromise = null;
        });

        this.browser = browser;
        this.launchPromise = null;
        return browser;
      })();
    }

    return this.launchPromise;
  }

  /**
   * Acquire a concurrency permit
   */
  async _acquirePermit(timeoutMs = 45000) {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      return;
    }

    if (this.queue.length >= this.maxQueue) {
      throw new Error(`Browser concurrency queue limit (${this.maxQueue}) reached. Worker is saturated.`);
    }

    return new Promise((resolve, reject) => {
      let timer = null;
      const callback = () => {
        if (timer) clearTimeout(timer);
        resolve();
      };

      timer = setTimeout(() => {
        const idx = this.queue.indexOf(callback);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new Error(`Timed out waiting for available browser permit after ${timeoutMs}ms`));
      }, timeoutMs);

      this.queue.push(callback);
    });
  }

  /**
   * Release a concurrency permit
   */
  _releasePermit() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.activeCount = Math.max(0, this.activeCount - 1);
    }
  }

  /**
   * Safely run an operation with an isolated browser context and page,
   * guaranteeing complete cleanup of contexts and pages even upon error or timeout.
   */
  async withPage(fn, { viewportWidth = 1440, viewportHeight = 900, userAgent } = {}) {
    await this._acquirePermit();

    let context = null;
    let page = null;

    try {
      const browser = await this.getBrowser();

      context = await browser.newContext({
        viewport: { width: viewportWidth, height: viewportHeight },
        userAgent: userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PagePulse/1.0 (+https://pagepulse.io/bot)',
        acceptDownloads: false,
        javaScriptEnabled: true,
        ignoreHTTPSErrors: true // Support self-signed certs in test environments
      });

      page = await context.newPage();

      return await fn(page, context);
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (err) {
          // Ignore close error on crashed pages
        }
      }

      if (context) {
        try {
          await context.close();
        } catch (err) {
          // Ignore close error on context
        }
      }

      this._releasePermit();
    }
  }

  /**
   * Graceful cleanup of browser process on shutdown
   */
  async closeAll() {
    this.isShuttingDown = true;
    if (this.browser) {
      try {
        logger.info('BROWSER_CLOSE', 'Closing shared Playwright browser instance...');
        await this.browser.close();
      } catch (err) {
        logger.warn('BROWSER_CLOSE_ERROR', `Error closing browser: ${err.message}`);
      } finally {
        this.browser = null;
      }
    }
  }
}

export const browserPool = new BrowserPool({ maxConcurrent: 3 });
