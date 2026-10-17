import { changesApi, monitorsApi } from './apiClient.js';

export function normalizeChangeRecord(c) {
  if (!c) return null;
  const rawUrl = c.monitor_url || c.url || '';
  const cleanUrl = rawUrl.replace(/^https?:\/\//i, '');
  const target = c.monitor_name || cleanUrl.split('/')[0] || 'Monitored Target';

  let formattedTime = 'Recently';
  if (c.detected_at) {
    const d = new Date(c.detected_at);
    if (!isNaN(d.getTime())) {
      formattedTime = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }

  let statusLabel = 'Text Alteration';
  if (c.change_type === 'visual') statusLabel = 'Visual Shift';
  else if (c.change_type === 'both') statusLabel = 'Visual + Text';

  return {
    id: c.id,
    changeId: c.id,
    monitorId: c.monitor_id,
    target,
    url: cleanUrl,
    fullUrl: rawUrl.startsWith('http') ? rawUrl : `https://${cleanUrl}`,
    title: c.title || 'Content alteration detected',
    details: c.description || (c.dom_nodes_modified ? `${c.dom_nodes_modified} DOM nodes altered` : 'Content modified'),
    timestamp: formattedTime,
    detectedAt: c.detected_at,
    isReviewed: Boolean(c.is_reviewed),
    reviewedAt: c.reviewed_at || (c.is_reviewed ? c.detected_at : null),
    status: statusLabel,
    changeType: c.change_type || 'text',
    domNodesModified: c.dom_nodes_modified || 0,
    visualDiffPercent: c.visual_diff_percent || 0,
    diffOverlayPath: c.diff_overlay_path,
    textDiffJson: c.text_diff_json,
    baselineSnapshotId: c.baseline_snapshot_id,
    currentSnapshotId: c.current_snapshot_id,
    compareId: c.monitor_id || c.id
  };
}

export const changeService = {
  async getAllHistory(params = { limit: 50 }) {
    const res = await changesApi.list(params);
    const history = (res?.data || []).map(normalizeChangeRecord);
    return {
      history,
      pagination: res?.pagination || { total: history.length, page: 1, limit: 50 }
    };
  },

  async getById(id) {
    const res = await changesApi.get(id);
    return normalizeChangeRecord(res?.data);
  },

  async getComparison(monitorIdOrChangeId, params) {
    // If given a monitor ID, request its comparison directly
    try {
      const res = await monitorsApi.compare(monitorIdOrChangeId, params);
      return res?.data;
    } catch (err) {
      // If it failed because the ID was a change ID, try getting the change first
      try {
        const changeRes = await changesApi.get(monitorIdOrChangeId);
        if (changeRes?.data?.monitor_id) {
          const compRes = await monitorsApi.compare(changeRes.data.monitor_id, {
            baseline: changeRes.data.baseline_snapshot_id,
            current: changeRes.data.current_snapshot_id,
            ...params
          });
          return compRes?.data;
        }
      } catch {}
      throw err;
    }
  },

  async markAsReviewed(changeId) {
    const res = await changesApi.updateReview(changeId, true);
    return normalizeChangeRecord(res?.data);
  },

  async markAsUnreviewed(changeId) {
    const res = await changesApi.updateReview(changeId, false);
    return normalizeChangeRecord(res?.data);
  },

  async toggleReview(changeId, desiredState = null) {
    let nextState = desiredState;
    if (nextState === null) {
      const current = await this.getById(changeId);
      nextState = !current?.isReviewed;
    }
    const res = await changesApi.updateReview(changeId, nextState);
    return normalizeChangeRecord(res?.data);
  },

  async getSummary(changeId) {
    const res = await changesApi.getSummary(changeId);
    return res?.data;
  }
};

