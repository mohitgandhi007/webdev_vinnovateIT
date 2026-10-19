import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { browserPool } from './browser-pool.js';
import { ssrfGuard } from '../utils/ssrf-guard.js';
import { hostThrottler } from './host-throttler.js';
import { TextNormalizer } from '../utils/text-normalizer.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

export const MAX_RESPONSE_BYTES = 15 * 1024 * 1024; // 15MB response size cap
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024; // 10MB screenshot buffer cap

export class PageFetchError extends Error {
  constructor(message, { category = 'FETCH_ERROR', statusCode = null, retryable = true } = {}) {
    super(message);
    this.name = 'PageFetchError';
    this.category = category;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/**
 * Heuristics to detect CAPTCHAs, bot challenges, and access-denied screens
 */
export function detectBotChallenge({ html = '', text = '', title = '', statusCode = 200 }) {
  const combined = `${title} ${text}`.toLowerCase();

  const challengePhrases = [
    'verify you are human',
    'please wait while we verify',
    'just a moment...',
    'attention required! | cloudflare',
    'checking your browser before accessing',
    'access denied | cloudflare',
    'security check to access',
    'complete the security check',
    'ddos-guard',
    'incapsula incident id',
    'perimeterx',
    'challenge-platform'
  ];

  for (const phrase of challengePhrases) {
    if (combined.includes(phrase)) {
      return { isChallenge: true, reason: `Bot challenge detected: "${phrase}"` };
    }
  }

  // Check for common challenge widgets in HTML if text content is brief
  if (text.length < 500) {
    if (
      html.includes('cf-turnstile') ||
      html.includes('challenges.cloudflare.com') ||
      html.includes('g-recaptcha') ||
      html.includes('hcaptcha.com') ||
      html.includes('datadome.js')
    ) {
      return { isChallenge: true, reason: 'Anti-bot verification widget detected in DOM' };
    }
  }

  // Access denied / Forbidden checks
  if (statusCode === 401 || statusCode === 403) {
    if (combined.includes('access denied') || combined.includes('forbidden') || combined.includes('not authorized')) {
      return { isChallenge: true, reason: `Access denied by server (HTTP ${statusCode})` };
    }
  }

  return { isChallenge: false };
}

export const pageFetcher = {
  /**
   * Safe fetch and content extraction using Playwright with:
   * - Pre-flight & in-flight SSRF protection (request interception)
   * - Redirect validation to prohibited destinations
   * - Subresource access blocking
   * - Response size and screenshot size bounds
   * - Accurate failure classification (CAPTCHA, DNS, connection, timeout, empty DOM)
   * - Per-host rate throttling
   */
  async fetchPage({
    url,
    mode = 'both',
    cssSelector = '',
    numericSelector = '',
    ignoredSelectors = [],
    viewportWidth = 1440,
    viewportHeight = 900,
    snapshotId = crypto.randomUUID(),
    screenshotsDir = config.screenshotsDir,
    navigationTimeoutMs = 30000
  }) {
    const allowLocal = process.env.ALLOW_LOCAL_FIXTURES === 'true';

    // 1. Pre-flight SSRF and Protocol Security Verification
    const urlValidation = await ssrfGuard.validateRequestUrl(url, { allowLocalFixtures: allowLocal });
    if (!urlValidation.safe) {
      throw new PageFetchError(`URL failed security verification: ${urlValidation.reason}`, {
        category: 'SECURITY_BLOCKED',
        retryable: false
      });
    }

    // 2. Validate CSS selector format if provided
    if (cssSelector && !TextNormalizer.isValidSelector(cssSelector)) {
      throw new PageFetchError(`Invalid CSS selector format: '${cssSelector}'`, {
        category: 'INVALID_SELECTOR',
        retryable: false
      });
    }

    // 3. Acquire per-host rate limit permit
    await hostThrottler.acquire(url);

    const startTime = Date.now();

    try {
      // Bound viewport dimensions to reasonable maximums to avoid memory exhaustion
      const boundedWidth = Math.min(Math.max(viewportWidth, 320), 1920);
      const boundedHeight = Math.min(Math.max(viewportHeight, 240), 1080);

      return await browserPool.withPage(async (page) => {
        page.setDefaultNavigationTimeout(navigationTimeoutMs);
        page.setDefaultTimeout(navigationTimeoutMs);

        let mainFrameBlocked = null;
        let responseSizeExceeded = false;

        // In-flight network request interception for all subresources and redirects
        await page.route('**', async (route) => {
          const req = route.request();
          const reqUrl = req.url();
          const isMain = req.isNavigationRequest() || req.resourceType() === 'document' || (req.frame && req.frame() === page.mainFrame());

          // Allow safe embedded inline resources
          if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) {
            return route.continue();
          }

          // Intercept and inspect all outbound network requests
          const check = await ssrfGuard.validateRequestUrl(reqUrl, { allowLocalFixtures: allowLocal });
          if (!check.safe) {
            logger.warn('SSRF_INTERCEPT_BLOCKED', `Blocked request to restricted destination: ${reqUrl} (${check.reason})`, {
              url: reqUrl,
              isMain,
              reason: check.reason
            });

            if (isMain) {
              mainFrameBlocked = { url: reqUrl, reason: check.reason };
            }
            return route.abort('accessdenied');
          }

          return route.continue();
        });

        // Enforce maximum response size limit and inspect 3xx redirect destinations
        page.on('response', async (res) => {
          const status = res.status();
          if (status >= 300 && status < 400) {
            const location = res.headers()['location'];
            if (location) {
              try {
                const destUrl = new URL(location, res.url()).toString();
                const check = await ssrfGuard.validateRequestUrl(destUrl, { allowLocalFixtures: allowLocal });
                if (!check.safe) {
                  logger.warn('SSRF_REDIRECT_BLOCKED', `Prohibited redirect target detected: ${destUrl} (${check.reason})`, {
                    from: res.url(),
                    to: destUrl,
                    reason: check.reason
                  });
                  mainFrameBlocked = { url: destUrl, reason: check.reason };
                  page.close().catch(() => {});
                }
              } catch {}
            }
          }

          const headers = res.headers();
          const len = parseInt(headers['content-length'] || '0', 10);
          if (len > MAX_RESPONSE_BYTES) {
            responseSizeExceeded = true;
          }
        });

        // Prevent caching from returning stale responses on active targets
        await page.setExtraHTTPHeaders({
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }).catch(() => {});

        let response = null;
        try {
          response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: navigationTimeoutMs
          });
          // Allow client-side frameworks to complete hydration
          await page.waitForLoadState('load', { timeout: 4000 }).catch(() => {});
        } catch (navErr) {
          const errMsg = navErr.message || '';

          if (mainFrameBlocked || errMsg.includes('net::ERR_ACCESS_DENIED') || errMsg.includes('NS_ERROR_DOM_SECURITY_ERR') || (mainFrameBlocked && errMsg.includes('net::ERR_ABORTED'))) {
            const reason = mainFrameBlocked ? mainFrameBlocked.reason : errMsg;
            throw new PageFetchError(
              `Security violation: Navigation redirected to or attempted prohibited destination (${reason})`,
              { category: 'SECURITY_BLOCKED', retryable: false }
            );
          }

          if (responseSizeExceeded) {
            throw new PageFetchError(
              `Response exceeded maximum allowed size limit of ${MAX_RESPONSE_BYTES / (1024 * 1024)}MB`,
              { category: 'RESOURCE_LIMIT_EXCEEDED', retryable: false }
            );
          }

          if (navErr.name === 'TimeoutError' || errMsg.includes('timeout')) {
            // If mainFrameBlocked was set during the timeout window
            if (mainFrameBlocked) {
              throw new PageFetchError(
                `Security violation: Navigation redirected to prohibited destination (${mainFrameBlocked.reason})`,
                { category: 'SECURITY_BLOCKED', retryable: false }
              );
            }
            throw new PageFetchError(`Page navigation timed out after ${navigationTimeoutMs}ms`, {
              category: 'TIMEOUT',
              retryable: true
            });
          }

          if (errMsg.includes('net::ERR_NAME_NOT_RESOLVED') || errMsg.includes('ENOTFOUND') || errMsg.includes('EAI_AGAIN')) {
            throw new PageFetchError(`DNS lookup failed for target host: ${errMsg}`, {
              category: 'DNS_FAILURE',
              retryable: true
            });
          }

          if (errMsg.includes('net::ERR_CONNECTION_REFUSED') || errMsg.includes('ECONNREFUSED') || errMsg.includes('ECONNRESET')) {
            throw new PageFetchError(`Network connection refused or reset: ${errMsg}`, {
              category: 'CONNECTION_FAILED',
              retryable: true
            });
          }

          if (errMsg.includes('Target closed') || errMsg.includes('browser has been closed') || errMsg.includes('crash')) {
            throw new PageFetchError(`Browser process crashed during navigation: ${errMsg}`, {
              category: 'BROWSER_CRASH',
              retryable: true
            });
          }

          throw new PageFetchError(`Navigation failed: ${errMsg}`, {
            category: 'NAVIGATION_FAILED',
            retryable: true
          });
        }

        const responseTimeMs = Date.now() - startTime;
        const httpStatusCode = response ? response.status() : 200;

        // Extract title, HTML snippet, and body text for challenge verification
        const pageMeta = await page.evaluate(() => {
          return {
            title: document.title || '',
            bodyText: document.body ? document.body.innerText : '',
            htmlSnippet: document.documentElement ? document.documentElement.innerHTML.slice(0, 10000) : '',
            nodeCount: document.querySelectorAll('*').length
          };
        });

        // Detect CAPTCHA, bot challenges, or access-denied pages (even on HTTP 200)
        const challengeCheck = detectBotChallenge({
          html: pageMeta.htmlSnippet,
          text: pageMeta.bodyText,
          title: pageMeta.title,
          statusCode: httpStatusCode
        });

        if (challengeCheck.isChallenge) {
          throw new PageFetchError(challengeCheck.reason, {
            category: 'ACCESS_BLOCKED',
            statusCode: httpStatusCode,
            retryable: false
          });
        }

        // Check HTTP status code
        if (httpStatusCode >= 400) {
          throw new PageFetchError(`HTTP request failed with status code ${httpStatusCode}`, {
            category: 'HTTP_ERROR',
            statusCode: httpStatusCode,
            retryable: httpStatusCode >= 500
          });
        }

        // Check for targeted CSS selector if requested
        if (cssSelector && cssSelector.trim()) {
          try {
            await page.waitForSelector(cssSelector, { timeout: 3000 });
          } catch (selErr) {
            throw new PageFetchError(`Target CSS selector '${cssSelector}' was not found in the rendered DOM`, {
              category: 'SELECTOR_NOT_FOUND',
              retryable: false
            });
          }
        } else {
          // Bounded settling pause for client-side JavaScript hydration (600ms)
          await page.waitForTimeout(600);
        }

        // Extract raw text with user-configured ignored selectors stripped out
        const ignoredList = Array.isArray(ignoredSelectors)
          ? ignoredSelectors
          : typeof ignoredSelectors === 'string'
            ? ignoredSelectors.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        let rawText = '';
        if (cssSelector && cssSelector.trim()) {
          rawText = await page.evaluate(
            ({ selector, ignored }) => {
              const el = document.querySelector(selector);
              if (!el) return '';
              const elementsToHide = [];
              el.querySelectorAll('script, style, noscript, svg').forEach(node => {
                elementsToHide.push({ node, orig: node.style.display });
                node.style.display = 'none';
              });
              for (const ignSel of ignored) {
                try {
                  el.querySelectorAll(ignSel).forEach(node => {
                    elementsToHide.push({ node, orig: node.style.display });
                    node.style.display = 'none';
                  });
                } catch {}
              }
              const text = el.innerText || el.textContent || '';
              elementsToHide.forEach(({ node, orig }) => {
                node.style.display = orig;
              });
              return text;
            },
            { selector: cssSelector, ignored: ignoredList }
          );
        } else {
          rawText = await page.evaluate(
            ({ ignored }) => {
              if (!document.body) return '';
              const elementsToHide = [];
              document.querySelectorAll('script, style, noscript, svg').forEach(node => {
                elementsToHide.push({ node, orig: node.style.display });
                node.style.display = 'none';
              });
              for (const ignSel of ignored) {
                try {
                  document.querySelectorAll(ignSel).forEach(node => {
                    elementsToHide.push({ node, orig: node.style.display });
                    node.style.display = 'none';
                  });
                } catch {}
              }
              const text = document.body.innerText || document.body.textContent || '';
              elementsToHide.forEach(({ node, orig }) => {
                node.style.display = orig;
              });
              return text;
            },
            { ignored: ignoredList }
          );
        }

        // Extract raw string for optional numerical tracking
        let numericRawText = null;
        if (numericSelector && numericSelector.trim()) {
          try {
            numericRawText = await page.evaluate((sel) => {
              const el = document.querySelector(sel);
              return el ? (el.innerText || el.textContent || '').trim() : null;
            }, numericSelector.trim());
          } catch {
            numericRawText = null;
          }
        }

        // Count rendered DOM nodes for structural heuristics
        const domNodeCount = pageMeta.nodeCount;

        // Check for empty content failure (blank page or zero rendered text)
        if (!cssSelector && rawText.trim().length === 0 && domNodeCount < 5) {
          throw new PageFetchError('Target page rendered empty content or blank DOM', {
            category: 'EMPTY_CONTENT',
            retryable: true
          });
        }

        // Capture screenshot if required by mode ('visual' or 'both')
        let screenshotPath = null;
        let screenshotHash = null;

        if (mode === 'visual' || mode === 'both') {
          await fs.mkdir(screenshotsDir, { recursive: true });
          const filename = `${snapshotId}.png`;
          const destPath = path.join(screenshotsDir, filename);

          // Mask user-configured ignored elements to avoid visual false-positives
          if (ignoredList.length > 0) {
            await page.evaluate((ignored) => {
              for (const ignSel of ignored) {
                try {
                  document.querySelectorAll(ignSel).forEach(n => {
                    n.style.visibility = 'hidden';
                  });
                } catch {}
              }
            }, ignoredList);
          }

          let screenshotBuffer = null;
          if (cssSelector && cssSelector.trim()) {
            const element = await page.$(cssSelector);
            if (element) {
              screenshotBuffer = await element.screenshot();
            } else {
              screenshotBuffer = await page.screenshot({ fullPage: false });
            }
          } else {
            screenshotBuffer = await page.screenshot({ fullPage: false });
          }

          if (screenshotBuffer && screenshotBuffer.length > MAX_SCREENSHOT_BYTES) {
            throw new PageFetchError(
              `Screenshot exceeded maximum size limit of ${MAX_SCREENSHOT_BYTES / (1024 * 1024)}MB`,
              { category: 'RESOURCE_LIMIT_EXCEEDED', retryable: false }
            );
          }

          await fs.writeFile(destPath, screenshotBuffer);
          screenshotPath = `/uploads/screenshots/${filename}`;
          screenshotHash = crypto.createHash('sha256').update(screenshotBuffer).digest('hex');
        }

        return {
          httpStatusCode,
          responseTimeMs,
          rawText,
          numericRawText,
          domNodeCount,
          screenshotPath,
          screenshotHash,
          statusCategory: 'NOMINAL_CLEAN'
        };
      }, { viewportWidth: boundedWidth, viewportHeight: boundedHeight });
    } finally {
      hostThrottler.release(url);
    }
  }
};
