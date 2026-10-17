import { db } from '../config/database.js';

export const numericSeriesRepository = {
  /**
   * Insert a new numeric metric data point
   */
  async recordPoint({
    monitor_id,
    snapshot_id = null,
    raw_text,
    parsed_value = null,
    unit_or_currency = null,
    is_valid = true,
    error_reason = null,
    captured_at = new Date()
  }) {
    const query = `
      INSERT INTO numeric_metric_series (
        monitor_id,
        snapshot_id,
        raw_text,
        parsed_value,
        unit_or_currency,
        is_valid,
        error_reason,
        captured_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const res = await db.query(query, [
      monitor_id,
      snapshot_id,
      raw_text,
      parsed_value,
      unit_or_currency,
      is_valid,
      error_reason,
      captured_at
    ]);

    return res.rows[0];
  },

  /**
   * Fetch time-series data points for a monitor in chronological order
   */
  async findByMonitorId(monitorId, { limit = 100 } = {}) {
    const query = `
      SELECT 
        s.id,
        s.monitor_id,
        s.snapshot_id,
        s.raw_text,
        s.parsed_value,
        s.unit_or_currency,
        s.is_valid,
        s.error_reason,
        s.captured_at,
        snap.screenshot_path
      FROM numeric_metric_series s
      LEFT JOIN snapshots snap ON s.snapshot_id = snap.id
      WHERE s.monitor_id = $1
      ORDER BY s.captured_at ASC
      LIMIT $2
    `;

    const res = await db.query(query, [monitorId, limit]);
    const points = res.rows;

    // Deterministically compute increase / decrease relative to preceding point
    let previousValidValue = null;
    const enriched = points.map(pt => {
      const numVal = pt.parsed_value !== null ? parseFloat(pt.parsed_value) : null;
      let changeType = 'none'; // 'increase' | 'decrease' | 'neutral' | 'none'
      let delta = null;
      let percentChange = null;

      if (numVal !== null && pt.is_valid) {
        if (previousValidValue !== null) {
          delta = +(numVal - previousValidValue).toFixed(4);
          if (previousValidValue !== 0) {
            percentChange = +(((numVal - previousValidValue) / Math.abs(previousValidValue)) * 100).toFixed(2);
          }
          if (delta > 0) changeType = 'increase';
          else if (delta < 0) changeType = 'decrease';
          else changeType = 'neutral';
        }
        previousValidValue = numVal;
      }

      return {
        id: pt.id,
        monitorId: pt.monitor_id,
        snapshotId: pt.snapshot_id,
        screenshotPath: pt.screenshot_path,
        rawText: pt.raw_text,
        parsedValue: numVal,
        unit: pt.unit_or_currency,
        isValid: pt.is_valid,
        errorReason: pt.error_reason,
        capturedAt: pt.captured_at,
        changeType,
        delta,
        percentChange
      };
    });

    return enriched;
  },

  /**
   * Get latest data point for a monitor
   */
  async getLatest(monitorId) {
    const query = `
      SELECT *
      FROM numeric_metric_series
      WHERE monitor_id = $1
      ORDER BY captured_at DESC
      LIMIT 1
    `;
    const res = await db.query(query, [monitorId]);
    return res.rows[0] || null;
  }
};
