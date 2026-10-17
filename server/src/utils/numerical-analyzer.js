/**
 * Numerical and Financial Change Analyzer
 * Deterministically extracts and calculates exact numerical and price differences
 * so that LLMs are not the source of truth for arithmetic.
 */

export class NumericalAnalyzer {
  /**
   * Currency patterns matching standard symbols and codes
   */
  static CURRENCY_REGEX = /(?:[₹$€£¥]|(?:INR|USD|EUR|GBP|AUD|CAD)\s*)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi;

  /**
   * Extract currency and price mentions from text or lines
   * @param {string|string[]} input
   * @returns {Array<{ symbol: string, raw: string, value: number, line: string }>}
   */
  static extractPrices(input) {
    let lines = [];
    if (typeof input === 'string') {
      lines = input.split('\n');
    } else if (Array.isArray(input)) {
      lines = input;
    } else {
      return [];
    }

    const results = [];

    for (const line of lines) {
      if (!line || typeof line !== 'string') continue;
      const regex = new RegExp(this.CURRENCY_REGEX.source, 'gi');
      let match;
      while ((match = regex.exec(line)) !== null) {
        const fullMatch = match[0];
        const numPart = match[1];
        if (!numPart) continue;

        // Clean commas and parse decimal
        const cleanNum = numPart.replace(/,/g, '');
        const val = parseFloat(cleanNum);
        if (isNaN(val)) continue;

        // Extract currency symbol/code
        let currency = '₹';
        if (fullMatch.includes('$')) currency = '$';
        else if (fullMatch.includes('€')) currency = '€';
        else if (fullMatch.includes('£')) currency = '£';
        else if (fullMatch.includes('¥')) currency = '¥';
        else if (/INR/i.test(fullMatch)) currency = 'INR';
        else if (/USD/i.test(fullMatch)) currency = 'USD';
        else if (/EUR/i.test(fullMatch)) currency = 'EUR';
        else if (/GBP/i.test(fullMatch)) currency = 'GBP';

        results.push({
          raw: fullMatch.trim(),
          currency,
          value: Math.round(val * 100) / 100, // Decimal-safe round to 2 places
          line: line.trim()
        });
      }
    }

    return results;
  }

  /**
   * Compare previous lines/text vs current lines/text to detect numerical / price changes
   * @param {string|string[]} previousInput
   * @param {string|string[]} currentInput
   * @returns {Array<{ type: string, currency: string, previous: number, current: number, previousValue: number, currentValue: number, difference: number, percentDelta: number, percentChange: number, explanation: string, description: string }>}
   */
  static analyzePriceChanges(previousInput, currentInput) {
    const prevPrices = this.extractPrices(previousInput);
    const currPrices = this.extractPrices(currentInput);

    if (prevPrices.length === 0 || currPrices.length === 0) {
      return [];
    }

    const priceDeltas = [];

    // Match pairs with identical currency
    for (const prev of prevPrices) {
      // Find matching current price in same currency with different value
      const match = currPrices.find(c => c.currency === prev.currency && Math.abs(c.value - prev.value) > 0.001);
      if (match) {
        const difference = Math.round((match.value - prev.value) * 100) / 100;
        let percentChange = 0;
        if (prev.value !== 0) {
          percentChange = Math.round(((match.value - prev.value) / prev.value) * 10000) / 100; // e.g. 20.02
        }

        const isIncrease = difference > 0;
        const sign = isIncrease ? '+' : '';
        const direction = isIncrease ? 'increase' : 'decrease';

        const description = `Price altered from ${prev.currency}${prev.value.toLocaleString()} to ${match.currency}${match.value.toLocaleString()} (${sign}${prev.currency}${Math.abs(difference).toLocaleString()}, approximately ${sign}${percentChange}% ${direction})`;

        priceDeltas.push({
          type: 'price_change',
          currency: prev.currency,
          previousRaw: prev.raw,
          currentRaw: match.raw,
          previous: prev.value,
          current: match.value,
          previousValue: prev.value,
          currentValue: match.value,
          difference,
          percentDelta: percentChange,
          percentChange,
          explanation: description,
          description
        });
      }
    }

    return priceDeltas;
  }
}
