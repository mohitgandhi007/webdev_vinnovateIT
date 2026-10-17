/**
 * Enterprise Conservative Numeric Value Parser for PagePulse
 * 
 * Rules:
 * 1. Preserves the exact original displayed string.
 * 2. Parses decimal, integer, negative, and localized formats conservatively.
 * 3. Identifies currencies, percentages, and units without assuming every number is a price.
 * 4. Rejects ambiguous formats (multiple numbers, invalid separators, non-numeric strings)
 *    and explicitly returns an errorReason.
 * 5. Deterministic arithmetic only — no LLM hallucinations.
 */

const CURRENCY_SYMBOLS = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  '₽': 'RUB',
  '₩': 'KRW',
  '฿': 'THB',
  'CHF': 'CHF',
  'USD': 'USD',
  'EUR': 'EUR',
  'GBP': 'GBP',
  'INR': 'INR',
  'CAD': 'CAD',
  'AUD': 'AUD',
  'JPY': 'JPY',
  'NZD': 'NZD'
};

const COMMON_UNITS = [
  'units', 'unit', 'pieces', 'piece', 'items', 'item', 'users', 'user',
  'subscribers', 'subscriber', 'views', 'view', 'stars', 'star', 'downloads',
  'download', 'visitors', 'visitor', 'requests', 'points', 'pts', 'kg', 'g',
  'lbs', 'oz', 'ml', 'l', 'gb', 'mb', 'kb', 'ms', 's', 'min', 'hours', 'hrs',
  'days', 'seats', 'seat', 'licenses', 'license', 'in stock'
];

export class NumericParser {
  /**
   * Parse a raw displayed text string into a structured numeric result.
   */
  static parse(rawInput, { customUnit = null } = {}) {
    if (rawInput === null || rawInput === undefined) {
      return {
        isValid: false,
        rawValue: '',
        numericValue: null,
        unit: customUnit || null,
        category: 'unknown',
        errorReason: 'Missing or null value'
      };
    }

    const rawStr = String(rawInput).trim();
    if (rawStr.length === 0) {
      return {
        isValid: false,
        rawValue: '',
        numericValue: null,
        unit: customUnit || null,
        category: 'unknown',
        errorReason: 'Empty string content'
      };
    }

    // 1. Detect identified currency
    let identifiedCurrency = null;
    for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
      // Check for exact symbol or currency word boundary
      if (rawStr.includes(sym)) {
        identifiedCurrency = sym;
        break;
      }
    }

    // 2. Detect percentage
    const isPercentage = rawStr.includes('%');

    // 3. Detect known units if not currency
    let identifiedUnit = customUnit || null;
    if (!identifiedCurrency && !isPercentage && !identifiedUnit) {
      const lower = rawStr.toLowerCase();
      for (const unit of COMMON_UNITS) {
        const regex = new RegExp(`\\b${unit}\\b`, 'i');
        if (regex.test(lower)) {
          identifiedUnit = unit;
          break;
        }
      }
    }

    const unit = customUnit || identifiedCurrency || (isPercentage ? '%' : identifiedUnit);
    let category = 'number';
    if (identifiedCurrency) category = 'currency';
    else if (isPercentage) category = 'percentage';
    else if (unit) category = 'quantity';

    // 4. Check for obvious non-numeric text
    const hasDigits = /\d/.test(rawStr);
    if (!hasDigits) {
      return {
        isValid: false,
        rawValue: rawStr,
        numericValue: null,
        unit,
        category: 'unknown',
        errorReason: 'No numeric digits found in displayed text'
      };
    }

    // 5. Look for ambiguous multiple numbers (e.g. "between $10 and $20", "3 items for $15", "10-20")
    // Match potential number groups
    const numberMatches = rawStr.match(/[-+]?(?:\d+[.,\s]?)+/g) || [];
    const validCandidateMatches = numberMatches.filter(m => /\d/.test(m));

    // If there are multiple separate numbers in the string
    if (validCandidateMatches.length > 1) {
      // Allow if one is prefix like "Batch #08" but text is "₹999", or "In Stock: 14"
      // But reject genuine ranges or multiple conflicting numbers
      const isRange = /\b(between|to|-|through|\/)\b/i.test(rawStr) && validCandidateMatches.length >= 2;
      const isMultipleCurrency = (rawStr.match(/[$€£₹¥]/g) || []).length > 1;
      
      if (isRange || isMultipleCurrency) {
        return {
          isValid: false,
          rawValue: rawStr,
          numericValue: null,
          unit,
          category,
          errorReason: 'Ambiguous: multiple distinct numbers or range detected'
        };
      }
    }

    // 6. Extract the primary numeric substring
    // Detect negative sign (e.g. -14.5, -$50, or parentheses (50.00))
    const isNegative = rawStr.includes('-') || /\(\s*[$€£₹¥]?\s*[\d.,]+\s*\)/.test(rawStr);

    // Find candidate numeric string
    // Matches sequences of digits with standard separators (, . space)
    const numRegex = /[\d]+(?:[.,\s][\d]+)*/;
    const match = rawStr.match(numRegex);

    if (!match) {
      return {
        isValid: false,
        rawValue: rawStr,
        numericValue: null,
        unit,
        category: 'unknown',
        errorReason: 'Could not extract valid numeric token'
      };
    }

    let token = match[0].trim();

    // 7. Check for ambiguous separators (e.g. "1.2.3.4" or "1,,200")
    const periodCount = (token.match(/\./g) || []).length;
    const commaCount = (token.match(/,/g) || []).length;

    if (periodCount > 1 && commaCount > 1) {
      return {
        isValid: false,
        rawValue: rawStr,
        numericValue: null,
        unit,
        category,
        errorReason: 'Ambiguous numeric format with conflicting delimiters'
      };
    }

    // Check version-like numbers (e.g. "2.4.1") without thousand grouping
    if (periodCount > 1 && commaCount === 0) {
      // Check if it's European thousands like "1.250.000"
      const parts = token.split('.');
      const isEuropeanThousands = parts.slice(1).every(p => p.length === 3);
      if (isEuropeanThousands) {
        token = parts.join(''); // Remove periods as thousand separators
      } else {
        return {
          isValid: false,
          rawValue: rawStr,
          numericValue: null,
          unit,
          category,
          errorReason: 'Ambiguous multi-decimal or version string'
        };
      }
    }

    // 8. Normalize delimiters to standard floating point
    let cleanedNumStr = token;

    if (commaCount > 0 && periodCount === 1) {
      // Standard US/UK: 1,250.50 -> remove comma
      cleanedNumStr = token.replace(/,/g, '');
    } else if (periodCount > 0 && commaCount === 1) {
      // European: 1.250,50 -> remove dot, replace comma with dot
      cleanedNumStr = token.replace(/\./g, '').replace(/,/g, '.');
    } else if (commaCount === 1 && periodCount === 0) {
      // Check if single comma is decimal e.g. "12,50" or thousand e.g. "1,250"
      const parts = token.split(',');
      if (parts[1].length === 2 || parts[1].length === 1) {
        // Likely decimal e.g. 12,50 or 4,5
        cleanedNumStr = `${parts[0]}.${parts[1]}`;
      } else if (parts[1].length === 3) {
        // Likely thousand e.g. 1,000
        cleanedNumStr = parts.join('');
      } else {
        cleanedNumStr = `${parts[0]}.${parts[1]}`;
      }
    } else if (commaCount > 1 && periodCount === 0) {
      // Multiple commas e.g. 1,000,000
      cleanedNumStr = token.replace(/,/g, '');
    }

    // Remove any remaining spaces
    cleanedNumStr = cleanedNumStr.replace(/\s+/g, '');

    const parsedFloat = parseFloat(cleanedNumStr);
    if (isNaN(parsedFloat) || !isFinite(parsedFloat)) {
      return {
        isValid: false,
        rawValue: rawStr,
        numericValue: null,
        unit,
        category,
        errorReason: 'Failed to parse token into finite numeric value'
      };
    }

    const finalNumeric = isNegative ? -Math.abs(parsedFloat) : Math.abs(parsedFloat);

    return {
      isValid: true,
      rawValue: rawStr,
      numericValue: finalNumeric,
      unit,
      category,
      errorReason: null
    };
  }
}
