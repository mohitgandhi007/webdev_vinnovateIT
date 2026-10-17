import { DiffEngine } from '../utils/diff-engine.js';
import { changeRepository } from '../repositories/change.repository.js';
import { logger } from '../utils/logger.js';

export const changeDetector = {
  /**
   * Compare a newly captured snapshot against the previous valid snapshot for a monitor.
   *
   * @param {Object} params
   * @param {string} params.monitorId
   * @param {Object} params.currentSnapshot
   * @param {Object|null} params.previousSnapshot
   * @param {number} params.noiseThresholdPercent
   * @returns {Promise<{ hasChanged: boolean, changeRecord: Object|null, isBaseline: boolean, summary: string }>}
   */
  async evaluateChange({
    monitorId,
    currentSnapshot,
    previousSnapshot,
    noiseThresholdPercent = 5,
    noiseOptions = {}
  }) {
    // 1. Initial Snapshot Check (Baseline establishment)
    if (!previousSnapshot) {
      logger.info('BASELINE_ESTABLISHED', `Initial baseline established for monitor ${monitorId}`, {
        monitorId,
        snapshotId: currentSnapshot.id,
        textHash: currentSnapshot.text_hash
      });

      return {
        hasChanged: false,
        isBaseline: true,
        changeRecord: null,
        summary: 'Baseline snapshot established'
      };
    }

    // 2. Deterministic Comparison
    const diffResult = DiffEngine.compare(
      previousSnapshot.text_content || '',
      currentSnapshot.text_content || '',
      { noiseOptions }
    );


    // Also check visual diff if screenshots are present
    let visualDiffPercent = 0;
    let visualChanged = false;
    if (previousSnapshot.screenshot_hash && currentSnapshot.screenshot_hash) {
      if (previousSnapshot.screenshot_hash !== currentSnapshot.screenshot_hash) {
        visualChanged = true;
        // Simple heuristic diff percent based on node count and text diff lines
        const nodeDiff = Math.abs((currentSnapshot.dom_node_count || 0) - (previousSnapshot.dom_node_count || 0));
        visualDiffPercent = Math.min(100, Number((nodeDiff * 0.5 + diffResult.totalDiffLines * 1.5).toFixed(1)));
        if (visualDiffPercent === 0) visualDiffPercent = 5.0; // Minimal default visual diff percent
      }
    }

    // Determine if change meets the threshold
    const hasMeaningfulTextChange = diffResult.hasChanged && diffResult.totalDiffLines > 0;
    const hasMeaningfulVisualChange = visualChanged && visualDiffPercent >= noiseThresholdPercent;

    if (!hasMeaningfulTextChange && !hasMeaningfulVisualChange) {
      logger.noChangeDetected(monitorId, {
        currentSnapshotId: currentSnapshot.id,
        previousSnapshotId: previousSnapshot.id
      });

      return {
        hasChanged: false,
        isBaseline: false,
        changeRecord: null,
        summary: 'No meaningful changes detected'
      };
    }

    // 3. Create Genuine Change Record
    const title = diffResult.summary || 'Visual layout modified';
    const description = diffResult.addedCount > 0 && diffResult.removedCount > 0
      ? `Detected ${diffResult.addedCount} additions and ${diffResult.removedCount} deletions in monitored content.`
      : diffResult.addedCount > 0
        ? `Detected ${diffResult.addedCount} new lines added to content.`
        : `Detected ${diffResult.removedCount} lines removed from content.`;

    const changeType = hasMeaningfulTextChange && hasMeaningfulVisualChange 
      ? 'both' 
      : hasMeaningfulTextChange ? 'text' : 'visual';

    const changeRecord = await changeRepository.create({
      monitor_id: monitorId,
      baseline_snapshot_id: previousSnapshot.id,
      current_snapshot_id: currentSnapshot.id,
      change_type: changeType,
      title,
      description,
      dom_nodes_modified: diffResult.totalDiffLines,
      text_diff_json: diffResult.textDiffJson,
      visual_diff_percent: visualDiffPercent,
      diff_overlay_path: currentSnapshot.screenshot_path,
      is_reviewed: false
    });

    logger.changeDetected(changeRecord.id, monitorId, title, {
      changeType,
      visualDiffPercent,
      diffLines: diffResult.totalDiffLines
    });

    return {
      hasChanged: true,
      isBaseline: false,
      changeRecord,
      summary: title
    };
  }
};
