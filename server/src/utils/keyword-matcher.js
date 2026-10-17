/**
 * Deterministic Keyword Matching Engine
 * Accurately detects whether configured words or phrases appeared, disappeared,
 * or changed in relevant context between two snapshot text extracts.
 */

export class KeywordMatcher {
  /**
   * Escape special characters for regex matching
   */
  static escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Build regex for keyword matching (handles boundary checks for words, exact match for phrases)
   */
  static buildRegex(keyword) {
    const trimmed = keyword.trim();
    const escaped = this.escapeRegex(trimmed);
    // If it's a single word (alphanumeric), require word boundaries
    if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
      return new RegExp(`\\b${escaped}\\b`, 'i');
    }
    // Multi-word phrase or special characters: match directly case-insensitive
    return new RegExp(escaped, 'i');
  }

  /**
   * Extract surrounding context snippet (up to 120 chars) around keyword match
   */
  static extractSnippet(text, keyword, maxLen = 140) {
    if (!text || typeof text !== 'string') return null;
    const regex = this.buildRegex(keyword);
    const match = regex.exec(text);
    if (!match) return null;

    const start = Math.max(0, match.index - 40);
    const end = Math.min(text.length, match.index + keyword.length + 80);
    let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
    if (start > 0) snippet = `...${snippet}`;
    if (end < text.length) snippet = `${snippet}...`;
    return snippet;
  }

  /**
   * Extract lines containing the keyword for context comparison
   */
  static extractMatchingLines(text, keyword) {
    if (!text || typeof text !== 'string') return [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const regex = this.buildRegex(keyword);
    return lines.filter(line => regex.test(line));
  }

  /**
   * Compare previous snapshot text and current snapshot text against a list of keywords
   * 
   * @param {Object} options
   * @param {string} options.previousText
   * @param {string} options.currentText
   * @param {string[]} options.keywords
   * @returns {{ hasMatches: boolean, matches: Array<{ keyword: string, status: 'appeared'|'disappeared'|'context_changed', previousContext: string|null, currentContext: string|null, explanation: string }> }}
   */
  static matchKeywords({ previousText = '', currentText = '', keywords = [] }) {
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return { hasMatches: false, matches: [] };
    }

    const cleanKeywords = Array.from(
      new Set(keywords.map(k => String(k || '').trim()).filter(k => k.length > 0))
    );

    if (cleanKeywords.length === 0) {
      return { hasMatches: false, matches: [] };
    }

    const prevStr = String(previousText || '');
    const currStr = String(currentText || '');
    const matches = [];

    for (const keyword of cleanKeywords) {
      const regex = this.buildRegex(keyword);
      const inPrev = regex.test(prevStr);
      const inCurr = regex.test(currStr);

      if (!inPrev && inCurr) {
        // Keyword appeared
        const currentContext = this.extractSnippet(currStr, keyword);
        matches.push({
          keyword,
          status: 'appeared',
          previousContext: null,
          currentContext,
          explanation: `Keyword "${keyword}" appeared in monitored content: "${currentContext || keyword}"`
        });
      } else if (inPrev && !inCurr) {
        // Keyword disappeared
        const previousContext = this.extractSnippet(prevStr, keyword);
        matches.push({
          keyword,
          status: 'disappeared',
          previousContext,
          currentContext: null,
          explanation: `Keyword "${keyword}" disappeared from monitored content (previously: "${previousContext || keyword}")`
        });
      } else if (inPrev && inCurr) {
        // Check if context changed
        const prevLines = this.extractMatchingLines(prevStr, keyword);
        const currLines = this.extractMatchingLines(currStr, keyword);

        const prevCombined = prevLines.join(' | ');
        const currCombined = currLines.join(' | ');

        if (prevCombined !== currCombined) {
          const prevSnippet = this.extractSnippet(prevStr, keyword);
          const currSnippet = this.extractSnippet(currStr, keyword);

          matches.push({
            keyword,
            status: 'context_changed',
            previousContext: prevSnippet,
            currentContext: currSnippet,
            explanation: `Keyword "${keyword}" context changed from "${prevSnippet}" to "${currSnippet}"`
          });
        }
      }
    }

    return {
      hasMatches: matches.length > 0,
      matches
    };
  }
}
