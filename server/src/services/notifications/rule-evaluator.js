import { KeywordMatcher } from '../../utils/keyword-matcher.js';

export class NotificationRuleEvaluator {
  /**
   * Evaluate whether a destination should receive a notification for an event
   * 
   * @param {Object} destination
   * @param {Object} event
   * @param {'change'|'failure'|'test'} event.type
   * @param {boolean} [event.hasChanged]
   * @param {string} [event.importance]
   * @param {number} [event.consecutiveFailures]
   * @param {string} [event.previousText]
   * @param {string} [event.currentText]
   * @returns {{ shouldNotify: boolean, triggerType: string, reasons: string[], keywordMatches?: Array }}
   */
  static evaluate(destination, event) {
    if (!destination.is_active) {
      return {
        shouldNotify: false,
        triggerType: 'none',
        reasons: ['Destination is inactive']
      };
    }

    const triggers = destination.triggers || {
      on_change: true,
      on_high_importance: false,
      on_failure: false,
      keywords: []
    };

    // 1. Manual test notification
    if (event.type === 'test') {
      return {
        shouldNotify: true,
        triggerType: 'test',
        reasons: ['Manual test notification requested']
      };
    }

    // 2. Monitoring failure event
    if (event.type === 'failure') {
      if (!triggers.on_failure) {
        return {
          shouldNotify: false,
          triggerType: 'failure',
          reasons: ['Failure notifications not enabled for this destination']
        };
      }

      const failures = event.consecutiveFailures || 1;
      // Do not automatically notify on a single temporary network hiccup
      if (failures < 2) {
        return {
          shouldNotify: false,
          triggerType: 'failure',
          reasons: ['Single transient failure ignored (requires at least 2 consecutive failures)']
        };
      }

      return {
        shouldNotify: true,
        triggerType: 'failure',
        reasons: [`Persistent monitoring failure (${failures} consecutive failures)`]
      };
    }

    // 3. Content change event
    if (event.type === 'change') {
      if (!event.hasChanged) {
        return {
          shouldNotify: false,
          triggerType: 'change',
          reasons: ['Content is unchanged; notifications suppressed']
        };
      }

      // A. Keyword filter evaluation
      const keywords = Array.isArray(triggers.keywords) ? triggers.keywords : [];
      if (keywords.length > 0) {
        const keywordEval = KeywordMatcher.matchKeywords({
          previousText: event.previousText,
          currentText: event.currentText,
          keywords
        });

        if (keywordEval.hasMatches) {
          return {
            shouldNotify: true,
            triggerType: 'keyword',
            reasons: keywordEval.matches.map(m => m.explanation),
            keywordMatches: keywordEval.matches
          };
        }
      }

      // B. High importance filter
      if (triggers.on_high_importance) {
        const isHigh = String(event.importance).toLowerCase() === 'high';
        if (isHigh) {
          return {
            shouldNotify: true,
            triggerType: 'high_importance',
            reasons: ['Change classified as high importance']
          };
        }
        return {
          shouldNotify: false,
          triggerType: 'high_importance',
          reasons: ['Change is not high importance and destination requires high importance']
        };
      }

      // C. General content change
      if (triggers.on_change !== false) {
        return {
          shouldNotify: true,
          triggerType: 'change',
          reasons: ['Meaningful content change detected']
        };
      }

      return {
        shouldNotify: false,
        triggerType: 'none',
        reasons: ['No matching notification rules satisfied']
      };
    }

    return {
      shouldNotify: false,
      triggerType: 'unknown',
      reasons: ['Unrecognized event type']
    };
  }
}
