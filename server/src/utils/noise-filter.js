import { TextNormalizer } from './text-normalizer.js';

export class NoiseFilter {
  /**
   * Parse comma-separated or array of CSS selectors into a clean array
   */
  static parseIgnoredSelectors(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
      return input.map(s => String(s).trim()).filter(Boolean);
    }
    if (typeof input === 'string') {
      return input
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0 && TextNormalizer.isValidSelector(s));
    }
    return [];
  }

  /**
   * Deterministically filter noise from extracted text based on user configuration.
   *
   * CRITICAL GUARANTEE:
   * Universal regexes that wipe out numbers or dates are strictly forbidden.
   * A price changing from ₹999 to ₹1,199 or $49 to $59 MUST remain detectable.
   * A published deadline changing (e.g., "Registration ends Oct 25") MUST remain detectable.
   */
  static filterText(rawText, options = {}) {
    if (!rawText || typeof rawText !== 'string') return '';

    // 1. Standard text normalization (whitespace and newline collapsing)
    let text = TextNormalizer.normalize(rawText);

    // 2. Optional: Filter volatile numeric counters only when explicitly enabled by user
    if (options.ignoreNumericCounters === true) {
      // Targets specific visitor/view counters (e.g., "Visitor count: 12,345", "Live views: 42")
      // Explicitly preserves currency symbols ($, €, £, ¥, ₹) and price formats
      text = text.replace(/(?:visitors?|views?|pageviews?|live visitors?):\s*\d[\d,]*/gi, '$1: [COUNTER]');
    }

    // 3. Optional: Filter live relative time tickers only when explicitly enabled by user
    if (options.ignoreDynamicTimestamps === true) {
      // Targets relative tickers like "Updated 3 seconds ago", "Generated at 12:44:01 PM"
      // NEVER touches absolute dates, published deadlines, or event dates
      text = text.replace(/(?:last updated|updated|generated|page rendered|server time):\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|UTC|GMT)?/gi, '$1: [TIME]');
      text = text.replace(/\b\d+\s+(?:seconds?|minutes?)\s+ago\b/gi, '[RELATIVE_TIME]');
    }

    // 4. Custom user-defined regex patterns (if configured in monitor)
    if (Array.isArray(options.customPatterns) && options.customPatterns.length > 0) {
      for (const patternStr of options.customPatterns) {
        try {
          const regex = new RegExp(patternStr, 'g');
          text = text.replace(regex, '[IGNORED]');
        } catch {
          // Ignore invalid user regex
        }
      }
    }

    return TextNormalizer.normalize(text);
  }
}
