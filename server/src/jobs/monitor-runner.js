import crypto from 'node:crypto';
import { db } from '../config/database.js';
import { monitorRepository } from '../repositories/monitor.repository.js';
import { snapshotRepository } from '../repositories/snapshot.repository.js';
import { pageFetcher, PageFetchError } from './page-fetcher.js';
import { changeDetector } from './change-detector.js';
import { TextNormalizer } from '../utils/text-normalizer.js';
import { logger } from '../utils/logger.js';
import { insightService } from '../services/insight.service.js';
import { notificationDispatcher } from '../services/notifications/notification-dispatcher.js';
import { NumericParser } from '../utils/numeric-parser.js';
import { numericSeriesRepository } from '../repositories/numeric-series.repository.js';

export function getCadenceMs(cadence) {
  const map = {
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000
  };
  return map[cadence] || 15 * 60 * 1000;
}

export function calculateRetryDelayMs(consecutiveFailures) {
  // Exponential backoff: 2m, 5m, 15m, 30m, capped at 1h, plus jitter
  const delays = [2 * 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000];
  const base = delays[Math.min(consecutiveFailures - 1, delays.length - 1)] || 60 * 60 * 1000;
  const jitter = Math.floor(Math.random() * 30000); // 0-30s jitter
  return base + jitter;
}

export const monitorRunner = {
  /**
   * Run a full check cycle for a single monitor.
   * Atomic lock prevents concurrent duplicate executions.
   */
  async runCheck(monitorId, { isManual = false } = {}) {
    const jobId = crypto.randomUUID();
    const startTime = Date.now();

    // 1. Atomic claim / lock monitor to prevent duplicate executions
    const claimRes = await db.query(
      `UPDATE monitors
       SET is_checking = true, last_attempt_at = NOW()
       WHERE id = $1 AND (is_checking = false OR last_attempt_at < NOW() - INTERVAL '3 minutes')
       RETURNING *`,
      [monitorId]
    );

    if (claimRes.rows.length === 0) {
      logger.warn('CHECK_SKIPPED', `Monitor ${monitorId} is currently checking or locked`, { monitorId });
      return {
        status: 'skipped',
        reason: 'Monitor is currently being checked by another worker'
      };
    }

    const monitor = claimRes.rows[0];
    logger.jobStarted(jobId, monitorId, { url: monitor.url, isManual });

    const TOTAL_JOB_TIMEOUT_MS = 45000;

    const executeCheck = async () => {
      // 2. Fetch page using Playwright
      const snapshotId = crypto.randomUUID();
      const fetchResult = await pageFetcher.fetchPage({
        url: monitor.url,
        mode: monitor.mode,
        cssSelector: monitor.css_selector,
        numericSelector: monitor.numeric_selector || '',
        ignoredSelectors: monitor.ignored_selectors || '',
        snapshotId
      });

      return { fetchResult, snapshotId };
    };

    try {
      // Enforce total job timeout to prevent hanging worker threads
      const { fetchResult, snapshotId } = await Promise.race([
        executeCheck(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new PageFetchError(`Total check execution exceeded hard limit of ${TOTAL_JOB_TIMEOUT_MS}ms`, {
            category: 'TIMEOUT',
            retryable: true
          })), TOTAL_JOB_TIMEOUT_MS)
        )
      ]);

      // 3. Normalize extracted text and compute content hash
      const normalizedText = TextNormalizer.normalize(fetchResult.rawText);
      const textHash = TextNormalizer.hash(normalizedText);

      // 4. Determine scan number by getting latest snapshot
      const latestSnapshot = await snapshotRepository.findLatestByCanonicalTargetId(
        monitor.canonical_target_id
      );
      const scanNumber = (latestSnapshot?.scan_number || 0) + 1;

      // 5. Save immutable snapshot record
      const snapshot = await snapshotRepository.create({
        canonical_target_id: monitor.canonical_target_id,
        scan_number: scanNumber,
        http_status_code: fetchResult.httpStatusCode,
        response_time_ms: fetchResult.responseTimeMs,
        text_content: normalizedText,
        text_hash: textHash,
        screenshot_path: fetchResult.screenshotPath,
        screenshot_hash: fetchResult.screenshotHash,
        dom_node_count: fetchResult.domNodeCount,
        status_category: fetchResult.statusCategory
      });

      logger.snapshotStored(snapshot.id, monitorId, {
        scanNumber,
        httpStatusCode: fetchResult.httpStatusCode,
        hasScreenshot: Boolean(fetchResult.screenshotPath)
      });

      // 5b. Record numerical tracking metric if configured
      let numericMetric = null;
      if (monitor.numeric_selector && monitor.numeric_selector.trim()) {
        const parsed = NumericParser.parse(fetchResult.numericRawText, {
          customUnit: monitor.numeric_unit
        });
        numericMetric = await numericSeriesRepository.recordPoint({
          monitor_id: monitorId,
          snapshot_id: snapshot.id,
          raw_text: parsed.rawValue,
          parsed_value: parsed.numericValue,
          unit_or_currency: parsed.unit,
          is_valid: parsed.isValid,
          error_reason: parsed.errorReason,
          captured_at: snapshot.captured_at || new Date()
        });
      }

      // 6. Evaluate Change against previous valid snapshot
      const changeEval = await changeDetector.evaluateChange({
        monitorId,
        currentSnapshot: snapshot,
        previousSnapshot: latestSnapshot,
        noiseThresholdPercent: monitor.noise_threshold_percent || 5,
        noiseOptions: {
          customPatterns: monitor.ignore_patterns || []
        }
      });


      // 7. Update monitor state upon successful capture
      const cadenceMs = getCadenceMs(monitor.check_cadence);
      const nextCheckAt = new Date(Date.now() + cadenceMs);

      let newStatus = 'healthy';
      if (changeEval.hasChanged) {
        newStatus = 'degraded'; // Atelier UI maps 'degraded' status badge to change alerts
      }

      await db.query(
        `UPDATE monitors
         SET 
           status = $1,
           previous_status = status,
           is_checking = false,
           consecutive_failures = 0,
           last_error = NULL,
           last_checked_at = NOW(),
           last_attempt_at = NOW(),
           next_check_at = $2,
           last_change_at = CASE WHEN $3 = true THEN NOW() ELSE last_change_at END,
           last_change_summary = CASE WHEN $3 = true THEN $4 ELSE last_change_summary END,
           is_reviewed = CASE WHEN $3 = true THEN false ELSE is_reviewed END
         WHERE id = $5`,
        [newStatus, nextCheckAt, changeEval.hasChanged, changeEval.summary, monitorId]
      );

      const durationMs = Date.now() - startTime;
      logger.jobCompleted(jobId, monitorId, durationMs, {
        newStatus,
        hasChanged: changeEval.hasChanged,
        isBaseline: changeEval.isBaseline
      });

      // 8. Trigger Gemini Change Intelligence summary asynchronously
      if (changeEval.hasChanged && changeEval.changeRecord?.id) {
        insightService.generateInsightForChange(changeEval.changeRecord.id)
          .then(insight => {
            // 9. Dispatch notifications for detected content change / keywords
            notificationDispatcher.dispatchForChange({
              changeRecord: changeEval.changeRecord,
              monitor,
              baselineSnapshot: latestSnapshot,
              currentSnapshot: snapshot,
              insight
            }).catch(dispatchErr => {
              logger.error('Failed to dispatch notifications for change', {
                changeId: changeEval.changeRecord.id,
                error: dispatchErr.message
              });
            });
          })
          .catch(err => {
            logger.error('Failed to generate AI insight for change', {
              changeId: changeEval.changeRecord.id,
              error: err.message
            });
            // Still dispatch notification even if AI insight generation had an issue
            notificationDispatcher.dispatchForChange({
              changeRecord: changeEval.changeRecord,
              monitor,
              baselineSnapshot: latestSnapshot,
              currentSnapshot: snapshot,
              insight: null
            }).catch(dispatchErr => {
              logger.error('Failed to dispatch fallback notification', {
                changeId: changeEval.changeRecord.id,
                error: dispatchErr.message
              });
            });
          });
      }

      return {
        status: 'completed',
        newStatus,
        monitorId,
        snapshotId: snapshot.id,
        numericMetric,
        isBaseline: changeEval.isBaseline,
        hasChanged: changeEval.hasChanged,
        changeRecord: changeEval.changeRecord,
        summary: changeEval.summary,
        durationMs
      };
    } catch (err) {
      // 8. Handle Failures gracefully without losing previous valid snapshot
      const durationMs = Date.now() - startTime;
      const isSecurityError = err instanceof PageFetchError && err.category === 'SECURITY_BLOCKED';
      const isSelectorError = err instanceof PageFetchError && err.category === 'SELECTOR_NOT_FOUND';
      const isBlocked = err instanceof PageFetchError && err.category === 'ACCESS_BLOCKED';
      const isEmpty = err instanceof PageFetchError && err.category === 'EMPTY_CONTENT';
      const isResourceLimit = err instanceof PageFetchError && err.category === 'RESOURCE_LIMIT_EXCEEDED';

      let errorStatus = 'failing';
      if (isSecurityError || isSelectorError || isEmpty || isResourceLimit) {
        errorStatus = 'degraded'; // Configuration, empty DOM or resource limits
      } else if (isBlocked) {
        errorStatus = 'blocked'; // Access challenge or captcha
      }

      const consecutiveFailures = (monitor.consecutive_failures || 0) + 1;
      const retryDelayMs = calculateRetryDelayMs(consecutiveFailures);
      const nextCheckAt = new Date(Date.now() + retryDelayMs);

      await db.query(
        `UPDATE monitors
         SET 
           status = $1,
           is_checking = false,
           consecutive_failures = $2,
           last_error = $3,
           last_attempt_at = NOW(),
           next_check_at = $4
         WHERE id = $5`,
        [errorStatus, consecutiveFailures, err.message, nextCheckAt, monitorId]
      );

      logger.jobFailed(jobId, monitorId, err.message, {
        category: err.category || 'UNKNOWN_ERROR',
        consecutiveFailures,
        nextRetryAt: nextCheckAt.toISOString()
      });

      // Dispatch failure notifications if persistent failure threshold (>= 2) reached
      if (consecutiveFailures >= 2) {
        notificationDispatcher.dispatchForFailure({
          monitor,
          consecutiveFailures,
          error: err
        }).catch(dispatchErr => {
          logger.error('Failed to dispatch failure notification', {
            monitorId,
            error: dispatchErr.message
          });
        });
      }

      return {
        status: 'failed',
        newStatus: errorStatus,
        monitorId,
        error: err.message,
        category: err.category || 'EXECUTION_ERROR',
        nextCheckAt: nextCheckAt.toISOString(),
        durationMs
      };
    }
  }
};
