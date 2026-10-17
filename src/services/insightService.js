import { insightsApi } from './apiClient.js';

export function normalizeInsight(i) {
  if (!i) return null;
  const isFallback = i.status === 'fallback' || i.model_name?.includes('fallback');
  const isPending = i.status === 'pending';
  const isFailed = i.status === 'failed';

  let summaryStatus = 'available';
  if (isPending) summaryStatus = 'pending';
  else if (isFailed) summaryStatus = 'failed';
  else if (isFallback) summaryStatus = 'fallback';

  let importance = 'medium';
  if (typeof i.importance_score === 'number') {
    if (i.importance_score >= 4) importance = 'high';
    else if (i.importance_score >= 2) importance = 'medium';
    else importance = 'low';
  } else if (typeof i.importance_score === 'string') {
    importance = i.importance_score.toLowerCase();
  }

  const category = (i.category || 'content').toLowerCase();
  const rawUrl = i.monitor_url || '';
  const cleanUrl = rawUrl.replace(/^https?:\/\//i, '');

  return {
    id: i.id,
    changeId: i.change_id,
    monitorId: i.monitor_id,
    monitorName: i.monitor_name || cleanUrl.split('/')[0] || 'Target',
    monitorUrl: cleanUrl,
    fullUrl: rawUrl,
    modelName: i.model_name || 'gemini-2.5-flash',
    title: i.title || `${category.charAt(0).toUpperCase() + category.slice(1)} Modification Analysis`,
    summary: i.summary_text || '',
    importance,
    category,
    status: summaryStatus,
    rawStatus: i.status,
    errorMessage: i.error_message || null,
    evidence: Array.isArray(i.evidence) ? i.evidence : [],
    generatedAt: i.generated_at,
    time: i.generated_at ? new Date(i.generated_at).toLocaleString() : 'Recently',
    compareId: i.monitor_id || i.change_id
  };
}

export const insightService = {
  async getInsights(params = { limit: 50 }) {
    const res = await insightsApi.list(params);
    const dispatches = (res?.data || []).map(normalizeInsight);
    return {
      dispatches,
      pagination: res?.pagination || { total: dispatches.length, page: 1, limit: 50 }
    };
  },

  async getById(id) {
    const res = await insightsApi.get(id);
    return normalizeInsight(res?.data);
  },

  async retry(changeId) {
    const res = await insightsApi.retry(changeId);
    return normalizeInsight(res?.data);
  },

  async generate(changeId) {
    const res = await insightsApi.generate(changeId);
    return normalizeInsight(res?.data);
  }
};
