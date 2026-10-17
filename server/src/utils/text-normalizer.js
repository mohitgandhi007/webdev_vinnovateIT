import crypto from 'node:crypto';

export class TextNormalizer {
  /**
   * Normalize extracted raw text into a consistent, stable representation:
   * - Strips non-printable control characters
   * - Normalizes multiple spaces/tabs into a single space on each line
   * - Trims each line
   * - Collapses 3 or more consecutive newlines into 2 (paragraph break)
   * - Trims leading and trailing outer whitespace
   */
  static normalize(text) {
    if (!text || typeof text !== 'string') return '';

    return text
      // Replace carriage returns with standard newlines
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove zero-width spaces, soft hyphens, and weird non-printable control chars (except \n and \t)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .split('\n')
      // Collapse horizontal whitespace within each line
      .map(line => line.replace(/[ \t\f\v]+/g, ' ').trim())
      // Filter out completely blank lines or collapse excessive newlines
      .join('\n')
      // Collapse 3+ newlines into 2
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Computes a SHA-256 hash of normalized text
   */
  static hash(text) {
    const normalized = this.normalize(text);
    return crypto.createHash('sha256').update(normalized, 'utf-8').digest('hex');
  }

  /**
   * Validates CSS selector syntax format
   */
  static isValidSelector(selector) {
    if (!selector || typeof selector !== 'string') return false;
    const trimmed = selector.trim();
    if (!trimmed) return false;

    // Check for common illegal characters in CSS selectors
    if (/[<>{};"']/.test(trimmed)) return false;

    // Reject dangerous or malformed selectors
    try {
      // Basic check of balanced brackets/parens
      const opens = (trimmed.match(/\[/g) || []).length;
      const closes = (trimmed.match(/\]/g) || []).length;
      if (opens !== closes) return false;

      const pOpens = (trimmed.match(/\(/g) || []).length;
      const pCloses = (trimmed.match(/\)/g) || []).length;
      if (pOpens !== pCloses) return false;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Calculate word and line metrics
   */
  static getMetrics(text) {
    const normalized = this.normalize(text);
    if (!normalized) {
      return { charCount: 0, wordCount: 0, lineCount: 0 };
    }

    const lines = normalized.split('\n').filter(Boolean);
    const words = normalized.split(/\s+/).filter(Boolean);

    return {
      charCount: normalized.length,
      wordCount: words.length,
      lineCount: lines.length
    };
  }
}
