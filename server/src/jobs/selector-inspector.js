import { browserPool } from './browser-pool.js';
import { validateSafeUrl, ssrfGuard } from '../utils/ssrf.js';
import { TextNormalizer } from '../utils/text-normalizer.js';

export class SelectorInspectorError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'SelectorInspectorError';
    this.statusCode = statusCode;
  }
}

export const selectorInspector = {
  /**
   * Safely inspects a webpage and extracts semantic CSS selector candidates
   * with text previews and bounding box dimensions.
   */
  async inspectUrl(url) {
    const allowLocal = process.env.ALLOW_LOCAL_FIXTURES === 'true';
    const urlValidation = await ssrfGuard.validateRequestUrl(url, { allowLocalFixtures: allowLocal });
    if (!urlValidation.safe) {
      throw new SelectorInspectorError(`URL failed security verification: ${urlValidation.reason}`, 400);
    }

    return await browserPool.withPage(async (page) => {
      page.setDefaultNavigationTimeout(20000);

      let mainFrameBlocked = null;
      await page.route('**', async (route) => {
        const req = route.request();
        const reqUrl = req.url();
        const isMain = req.isNavigationRequest();

        if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) {
          return route.continue();
        }

        const check = await ssrfGuard.validateRequestUrl(reqUrl, { allowLocalFixtures: allowLocal });
        if (!check.safe) {
          if (isMain) {
            mainFrameBlocked = { url: reqUrl, reason: check.reason };
          }
          return route.abort('accessdenied');
        }
        return route.continue();
      });

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch (err) {
        if (mainFrameBlocked) {
          throw new SelectorInspectorError(`Security violation: ${mainFrameBlocked.reason}`, 400);
        }
        throw new SelectorInspectorError(`Failed to load target URL for inspection: ${err.message}`, 400);
      }

      // Short bounded wait for dynamic elements
      await page.waitForTimeout(500);

      // Safe DOM evaluation inside browser context
      const candidates = await page.evaluate(() => {
        const results = [];
        const seenSelectors = new Set();

        function addCandidate(el, customSelector = null, label = '') {
          if (!el) return;
          const rect = el.getBoundingClientRect();
          // Filter out hidden or zero-size elements
          if (rect.width < 10 || rect.height < 10) return;

          let selector = customSelector;
          if (!selector) {
            if (el.id) {
              selector = `#${CSS.escape(el.id)}`;
            } else if (el.dataset?.testid) {
              selector = `[data-testid="${CSS.escape(el.dataset.testid)}"]`;
            } else if (el.className && typeof el.className === 'string') {
              const classes = el.className.split(/\s+/).filter(c => c && !c.includes(':') && !c.includes('/'));
              if (classes.length > 0) {
                selector = `${el.tagName.toLowerCase()}.${CSS.escape(classes[0])}`;
              }
            }
          }

          if (!selector) {
            selector = el.tagName.toLowerCase();
          }

          if (seenSelectors.has(selector)) return;
          seenSelectors.add(selector);

          // Get trimmed text preview
          const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
          if (!text && el.tagName !== 'IMG') return;

          results.push({
            selector,
            tagName: el.tagName.toLowerCase(),
            tag: el.tagName.toLowerCase(),
            label: label || `${el.tagName.toLowerCase()}${el.id ? ` (#${el.id})` : ''}`,
            textPreview: text.substring(0, 150) + (text.length > 150 ? '...' : ''),
            textSnippet: text.substring(0, 150) + (text.length > 150 ? '...' : ''),
            nodeCount: el.querySelectorAll('*').length,
            dimensions: {
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
          });
        }

        // 1. Semantic landmarks
        ['main', 'article', 'section', 'nav', 'header', 'footer'].forEach(tag => {
          document.querySelectorAll(tag).forEach((el, idx) => {
            const selector = el.id ? `#${el.id}` : `${tag}${idx > 0 ? `:nth-of-type(${idx + 1})` : ''}`;
            addCandidate(el, selector, `Landmark <${tag}>`);
          });
        });

        // 2. Elements with explicit IDs
        document.querySelectorAll('[id]').forEach(el => {
          if (results.length < 25) {
            addCandidate(el, `#${el.id}`, `Element #${el.id}`);
          }
        });

        // 3. Elements with data-testid
        document.querySelectorAll('[data-testid]').forEach(el => {
          if (results.length < 25) {
            addCandidate(el, `[data-testid="${el.dataset.testid}"]`, `Test ID: ${el.dataset.testid}`);
          }
        });

        // 4. Common content and pricing containers
        const commonClasses = ['pricing', 'price-box', 'catalog', 'products', 'content', 'hero', 'article-body', 'table'];
        for (const cls of commonClasses) {
          document.querySelectorAll(`[class*="${cls}"]`).forEach(el => {
            if (results.length < 25) {
              const firstClass = el.className.split(' ').find(c => c.includes(cls));
              if (firstClass) {
                addCandidate(el, `.${firstClass}`, `Class .${firstClass}`);
              }
            }
          });
        }

        return results.slice(0, 20); // Top 20 distinct candidates
      });

      return {
        url,
        title: await page.title(),
        candidatesCount: candidates.length,
        candidates
      };
    });
  }
};
