import { monitorsApi } from './apiClient.js';

export function normalizeMonitor(m) {
  if (!m) return null;
  const rawUrl = m.url || '';
  const cleanUrl = rawUrl.replace(/^https?:\/\//i, '');
  const cleanName = m.name || cleanUrl.split('/')[0] || 'Target';
  const initials = cleanName
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'TG';

  const isActive = m.is_active !== false;

  // Map backend status to UI status
  let displayStatus = 'healthy';
  if (!isActive) {
    displayStatus = 'paused';
  } else if (m.status === 'degraded') {
    displayStatus = 'changed';
  } else if (m.status === 'failing' || m.status === 'blocked') {
    displayStatus = 'attention';
  } else if (m.status === 'pending') {
    displayStatus = 'pending';
  }

  // Format last checked relative time or label
  let lastChecked = 'Awaiting initial check';
  if (m.last_checked_at) {
    const checkDate = new Date(m.last_checked_at);
    lastChecked = !isNaN(checkDate.getTime()) 
      ? checkDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      : 'Recently';
  }

  let lastChange = 'Target registered · Baseline pending';
  if (m.last_error) {
    lastChange = m.last_error;
  } else if (m.status === 'degraded') {
    lastChange = 'DOM deviation detected';
  } else if (m.status === 'healthy' && m.last_checked_at) {
    lastChange = 'Content steady · No drift';
  }

  return {
    id: m.id,
    name: m.name,
    initials,
    url: cleanUrl,
    fullUrl: rawUrl.startsWith('http') ? rawUrl : `https://${cleanUrl}`,
    status: displayStatus,
    backendStatus: m.status,
    isActive,
    isReviewed: Boolean(m.is_reviewed),
    isChecking: Boolean(m.is_checking),
    mode: m.mode || 'both',
    checkCadence: m.check_cadence || '15m',
    cssSelector: m.css_selector || '',
    ignoredSelectors: m.ignored_selectors || '',
    numericSelector: m.numeric_selector || '',
    numericUnit: m.numeric_unit || '',
    feedToken: m.feed_token || '',
    feedEnabled: m.feed_enabled !== false,
    noiseThresholdPercent: m.noise_threshold_percent || 0,
    lastChecked,
    lastCheckedAt: m.last_checked_at,
    lastAttemptAt: m.last_attempt_at,
    nextCheckAt: m.next_check_at,
    lastChange,
    lastError: m.last_error,
    consecutiveFailures: m.consecutive_failures || 0,
    compareId: m.id,
    createdAt: m.created_at,
    updatedAt: m.updated_at
  };
}

export const monitorService = {
  async getAll(params = { limit: 100 }) {
    const res = await monitorsApi.list(params);
    const monitors = (res?.data || []).map(normalizeMonitor);
    return {
      monitors,
      pagination: res?.pagination || { total: monitors.length, page: 1, limit: 100 }
    };
  },

  async getById(id) {
    const res = await monitorsApi.get(id);
    return normalizeMonitor(res?.data);
  },

  async create(payload) {
    const body = {
      name: payload.name?.trim(),
      url: payload.url?.trim(),
      mode: payload.mode || 'both',
      check_cadence: payload.checkCadence || payload.check_cadence || '15m',
      css_selector: payload.cssSelector?.trim() || payload.css_selector?.trim() || undefined,
      ignored_selectors: payload.ignoredSelectors?.trim() || payload.ignored_selectors?.trim() || undefined,
      numeric_selector: payload.numericSelector?.trim() || payload.numeric_selector?.trim() || undefined,
      numeric_unit: payload.numericUnit?.trim() || payload.numeric_unit?.trim() || undefined
    };
    const res = await monitorsApi.create(body);
    return normalizeMonitor(res?.data);
  },

  async update(id, updates) {
    const body = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.url !== undefined) body.url = updates.url;
    if (updates.mode !== undefined) body.mode = updates.mode;
    if (updates.checkCadence !== undefined) body.check_cadence = updates.checkCadence;
    if (updates.check_cadence !== undefined) body.check_cadence = updates.check_cadence;
    if (updates.cssSelector !== undefined) body.css_selector = updates.cssSelector;
    if (updates.css_selector !== undefined) body.css_selector = updates.css_selector;
    if (updates.ignoredSelectors !== undefined) body.ignored_selectors = updates.ignoredSelectors;
    if (updates.ignored_selectors !== undefined) body.ignored_selectors = updates.ignored_selectors;
    if (updates.numericSelector !== undefined) body.numeric_selector = updates.numericSelector;
    if (updates.numeric_selector !== undefined) body.numeric_selector = updates.numeric_selector;
    if (updates.numericUnit !== undefined) body.numeric_unit = updates.numericUnit;
    if (updates.numeric_unit !== undefined) body.numeric_unit = updates.numeric_unit;
    if (updates.isActive !== undefined) body.is_active = updates.isActive;
    if (updates.is_active !== undefined) body.is_active = updates.is_active;

    const res = await monitorsApi.update(id, body);
    return normalizeMonitor(res?.data);
  },

  async togglePause(id, currentIsActive) {
    const newIsActive = !currentIsActive;
    const res = await monitorsApi.update(id, { is_active: newIsActive });
    return normalizeMonitor(res?.data);
  },

  async delete(id) {
    await monitorsApi.delete(id);
    return true;
  },

  async triggerCheck(id, options = { wait: true }) {
    const res = await monitorsApi.triggerCheck(id, options);
    return res?.data;
  },

  async getSnapshots(id, params) {
    const res = await monitorsApi.getSnapshots(id, params);
    return res?.data || [];
  },

  async getChanges(id, params) {
    const res = await monitorsApi.getChanges(id, params);
    return res?.data || [];
  },

  async compare(id, params) {
    const res = await monitorsApi.compare(id, params);
    return res?.data;
  },

  async inspectSelectors(url) {
    const res = await monitorsApi.inspectSelectors(url);
    return res?.data;
  },

  async getMetrics(id) {
    const res = await monitorsApi.getMetrics(id);
    return res?.data;
  },

  async getFeedMeta(id) {
    const res = await monitorsApi.getFeedMeta(id);
    return res?.data;
  },

  async rotateFeedToken(id) {
    const res = await monitorsApi.rotateFeedToken(id);
    return res?.data;
  },

  async revokeFeedToken(id) {
    const res = await monitorsApi.revokeFeedToken(id);
    return res?.data;
  },

  getRssFeedUrl(id, token) {
    return monitorsApi.getRssFeedUrl(id, token);
  }
};
