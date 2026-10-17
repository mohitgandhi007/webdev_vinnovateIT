import { insightRepository } from '../repositories/insight.repository.js';
import { changeRepository } from '../repositories/change.repository.js';
import { snapshotRepository } from '../repositories/snapshot.repository.js';
import { workspaceRepository } from '../repositories/workspace.repository.js';
import { geminiService } from './gemini.service.js';

export class InsightServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'InsightServiceError';
    this.statusCode = statusCode;
  }
}

export const insightService = {
  /**
   * List insights for workspace
   */
  async listInsights({
    workspace_id = null,
    page = 1,
    limit = 20,
    category,
    importance,
    impact_level,
    monitor_id,
    status
  } = {}) {
    let resolvedWorkspaceId = workspace_id;
    if (!resolvedWorkspaceId) {
      const defaultWorkspace = await workspaceRepository.findOrCreateDefault();
      resolvedWorkspaceId = defaultWorkspace.id;
    }

    return await insightRepository.findByWorkspaceId(resolvedWorkspaceId, {
      page,
      limit,
      category,
      importance,
      impact_level,
      monitor_id,
      status
    });
  },

  /**
   * Get single insight by ID
   */
  async getInsightById(id) {
    const insight = await insightRepository.findById(id);
    if (!insight) {
      throw new InsightServiceError('Insight not found', 404);
    }
    return insight;
  },

  /**
   * Get insight by detected change ID
   */
  async getInsightByChangeId(changeId) {
    return await insightRepository.findByChangeId(changeId);
  },

  /**
   * Generate an AI change intelligence summary for a detected change record
   *
   * @param {string} changeId
   * @param {Object} [options]
   * @param {boolean} [options.force=false] Force regeneration even if an insight already exists
   */
  async generateInsightForChange(changeId, { force = false } = {}) {
    const change = await changeRepository.findById(changeId);
    if (!change) {
      throw new InsightServiceError('Detected change not found', 404);
    }

    // Cost and performance rule: Prevent duplicate summaries for the same change
    if (!force) {
      const existing = await insightRepository.findByChangeId(changeId);
      if (existing && existing.status === 'success') {
        return existing;
      }
    }

    // Fetch baseline and current snapshot contents
    const [baselineSnapshot, currentSnapshot] = await Promise.all([
      snapshotRepository.findById(change.baseline_snapshot_id),
      snapshotRepository.findById(change.current_snapshot_id)
    ]);

    let parsedDiff = change.text_diff_json;
    if (typeof parsedDiff === 'string') {
      try {
        parsedDiff = JSON.parse(parsedDiff);
      } catch {
        parsedDiff = [];
      }
    }

    const changeContext = {
      monitorId: change.monitor_id,
      websiteUrl: change.monitor_url,
      changeId: change.id,
      previousSnapshotTimestamp: change.baseline_captured_at,
      currentSnapshotTimestamp: change.current_captured_at,
      previousRelevantText: baselineSnapshot?.text_content || '',
      currentRelevantText: currentSnapshot?.text_content || '',
      textDiff: parsedDiff || [],
      metadata: {
        cssSelector: currentSnapshot?.css_selector || baselineSnapshot?.css_selector || null,
        domNodesModified: change.dom_nodes_modified,
        visualDiffPercent: change.visual_diff_percent
      }
    };

    // Invoke Gemini Service (handles structured JSON, timeout, quota, prompt injection, deterministic fallback)
    const summaryResult = await geminiService.generateSummary(changeContext);

    // Persist to database via upsert
    const saved = await insightRepository.upsert({
      detected_change_id: change.id,
      workspace_id: change.workspace_id,
      title: summaryResult.title,
      summary: summaryResult.summary,
      category: summaryResult.category,
      importance: summaryResult.importance,
      evidence: summaryResult.evidence,
      status: summaryResult.status,
      model_version: summaryResult.model_version,
      raw_response: summaryResult.raw_response,
      error_message: summaryResult.error_message,
      headline: summaryResult.title,
      executive_summary: summaryResult.summary,
      impact_level: summaryResult.importance,
      observed_facts: summaryResult.evidence
    });

    return saved;
  },

  /**
   * Retry generating an insight for a change (controlled retry on failure or fallback)
   */
  async retryInsight(changeId) {
    return await this.generateInsightForChange(changeId, { force: true });
  }
};
