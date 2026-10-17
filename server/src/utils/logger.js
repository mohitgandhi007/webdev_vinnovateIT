/**
 * PagePulse Structured Observability Logger
 * Emits clean, structured JSON/readable logs with timestamps and contextual event tags.
 * Ensures sensitive data (tokens, headers, passwords) is never leaked.
 */

const LOG_LEVELS = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40
};

const CURRENT_LEVEL = process.env.LOG_LEVEL 
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
  : LOG_LEVELS.INFO;

function sanitize(meta = {}) {
  const sensitiveKeys = ['cookie', 'cookies', 'authorization', 'apiKey', 'api_key', 'token', 'password', 'secret'];
  const sanitized = {};

  for (const [key, value] of Object.entries(meta)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function emit(levelName, event, message, meta = {}) {
  if (LOG_LEVELS[levelName] < CURRENT_LEVEL) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level: levelName,
    event,
    message,
    ...sanitize(meta)
  };

  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify(entry));
  } else {
    const color = levelName === 'ERROR' ? '\x1b[31m' : levelName === 'WARN' ? '\x1b[33m' : '\x1b[36m';
    const reset = '\x1b[0m';
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(sanitize(meta))}` : '';
    console.log(`${color}[${entry.timestamp}] [${levelName}] [${event}]${reset} ${message}${metaStr}`);
  }
}

export const logger = {
  debug: (event, message, meta) => emit('DEBUG', event, message, meta),
  info: (event, message, meta) => emit('INFO', event, message, meta),
  warn: (event, message, meta) => emit('WARN', event, message, meta),
  error: (event, message, meta) => emit('ERROR', event, message, meta),

  // Specific lifecycle event helpers
  jobStarted: (jobId, monitorId, meta) => 
    emit('INFO', 'JOB_STARTED', `Check initiated for monitor ${monitorId}`, { jobId, monitorId, ...meta }),
  
  urlValidationFailure: (monitorId, reason, meta) => 
    emit('WARN', 'URL_VALIDATION_FAILURE', `Safe URL validation failed: ${reason}`, { monitorId, reason, ...meta }),

  navigationFailure: (monitorId, error, meta) => 
    emit('ERROR', 'NAVIGATION_FAILURE', `Navigation failed: ${error}`, { monitorId, error, ...meta }),

  snapshotStored: (snapshotId, monitorId, meta) => 
    emit('INFO', 'SNAPSHOT_STORED', `Snapshot ${snapshotId} saved`, { snapshotId, monitorId, ...meta }),

  changeDetected: (changeId, monitorId, summary, meta) => 
    emit('INFO', 'CHANGE_DETECTED', `Change detected: ${summary}`, { changeId, monitorId, summary, ...meta }),

  noChangeDetected: (monitorId, meta) => 
    emit('INFO', 'NO_CHANGE_DETECTED', `Content verified unchanged for monitor ${monitorId}`, { monitorId, ...meta }),

  retryScheduled: (monitorId, nextAttemptAt, attemptNumber, meta) => 
    emit('WARN', 'RETRY_SCHEDULED', `Retry #${attemptNumber} scheduled for ${nextAttemptAt}`, { monitorId, nextAttemptAt, attemptNumber, ...meta }),

  jobCompleted: (jobId, monitorId, durationMs, meta) => 
    emit('INFO', 'JOB_COMPLETED', `Check completed in ${durationMs}ms`, { jobId, monitorId, durationMs, ...meta }),

  jobFailed: (jobId, monitorId, error, meta) => 
    emit('ERROR', 'JOB_FAILED', `Check failed for monitor ${monitorId}: ${error}`, { jobId, monitorId, error, ...meta })
};
