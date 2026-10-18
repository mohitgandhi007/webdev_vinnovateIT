/**
 * PagePulse HTTP API Client Layer
 * Prepared for frontend integration with configurable base URL,
 * abort timeouts, typed error handling, and robust network failure detection.
 */

export function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('pagepulse_api_base_url');
    if (custom) return custom.replace(/\/+$/, '');
    if (window.PAGEPULSE_API_URL) return window.PAGEPULSE_API_URL.replace(/\/+$/, '');
  }
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) 
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '') 
    : '/api';
}

export const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')
  : '/api';

export function setCustomApiBaseUrl(url) {
  if (typeof window === 'undefined') return;
  if (!url || !url.trim()) {
    localStorage.removeItem('pagepulse_api_base_url');
  } else {
    localStorage.setItem('pagepulse_api_base_url', url.trim().replace(/\/+$/, ''));
  }
}

const DEFAULT_TIMEOUT_MS = 12000;

export class ApiError extends Error {
  constructor(message, status = 0, code = 'NETWORK_ERROR', details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get userMessage() {
    if (this.code === 'BACKEND_NOT_FOUND') {
      return 'PagePulse API backend is not detected at /api.';
    }
    if (this.code === 'CONNECTION_REFUSED' || this.status === 0) {
      return 'Cannot reach PagePulse API backend. Ensure the backend server is running.';
    }
    if (this.code === 'TIMEOUT') {
      return 'The operation timed out. The website or backend may be experiencing high load.';
    }
    if (this.code === 'NOT_FOUND') {
      return this.message || 'The requested resource was not found.';
    }
    if (this.code === 'RATE_LIMIT_EXCEEDED' || this.status === 429) {
      return 'Rate limit reached. Please wait a moment before trying again.';
    }
    if (this.details && Array.isArray(this.details)) {
      return this.details.map(d => d.message || d).join(', ');
    }
    return this.message || 'An unexpected error occurred.';
  }
}

/**
 * Low-level HTTP fetch wrapper with timeout and error extraction
 */
async function request(endpoint, { method = 'GET', body = null, headers = {}, timeout = DEFAULT_TIMEOUT_MS, params = null } = {}) {
  const baseUrl = getApiBaseUrl();
  let url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  if (params) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, String(value));
      }
    });
    const queryString = query.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const requestOptions = {
    method,
    headers: {
      'Accept': 'application/json',
      ...headers
    },
    signal: controller.signal
  };

  if (body) {
    requestOptions.headers['Content-Type'] = 'application/json';
    requestOptions.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, requestOptions);
    clearTimeout(timeoutId);

    let data = null;
    const contentType = res.headers.get('content-type') || '';
    
    if (res.status === 204) {
      data = null;
    } else if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new ApiError('Invalid JSON response returned by server', res.status, 'INVALID_JSON');
      }
    } else {
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { text };
      }
    }

    if (!res.ok) {
      if (res.status === 404 && (typeof data?.text === 'string' && (data.text.includes('could not be found') || data.text.includes('NOT_FOUND') || data.text.includes('<!DOCTYPE')))) {
        throw new ApiError('PagePulse API backend is not detected on this host at /api.', 404, 'BACKEND_NOT_FOUND');
      }
      const message = data?.error?.message 
        || data?.message 
        || (data?.error && typeof data.error === 'string' ? data.error : null)
        || (typeof data?.text === 'string' && data.text.length < 100 && !data.text.includes('<') ? data.text : null)
        || `HTTP ${res.status}: ${res.statusText}`;
      const code = data?.error?.code 
        || (res.status === 400 ? 'VALIDATION_ERROR' : res.status === 404 ? 'NOT_FOUND' : res.status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'HTTP_ERROR');
      const details = data?.error?.details || data?.details || null;
      throw new ApiError(message, res.status, code, details);
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof ApiError) {
      throw err;
    }
    if (err.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${timeout}ms.`, 408, 'TIMEOUT');
    }
    if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
      throw new ApiError('PagePulse API backend is offline or unreachable.', 0, 'CONNECTION_REFUSED');
    }
    throw new ApiError(err.message || 'Network request failed', 0, 'NETWORK_FAILURE');
  }
}

export const apiClient = {
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'POST', body }),
  patch: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),
  getBaseUrl: () => getApiBaseUrl()
};

// Resource Clients
export const healthApi = {
  check: () => apiClient.get('/health')
};

export const monitorsApi = {
  list: (params) => apiClient.get('/monitors', { params }),
  get: (id) => apiClient.get(`/monitors/${id}`),
  create: (data) => apiClient.post('/monitors', data),
  update: (id, data) => apiClient.patch(`/monitors/${id}`, data),
  delete: (id) => apiClient.delete(`/monitors/${id}`),
  triggerCheck: (id) => apiClient.post(`/monitors/${id}/check`),
  getSnapshots: (id, params) => apiClient.get(`/monitors/${id}/snapshots`, { params }),
  getChanges: (id, params) => apiClient.get(`/monitors/${id}/changes`, { params }),
  compare: (id, params) => apiClient.get(`/monitors/${id}/compare`, { params }),
  inspectSelectors: (url) => apiClient.post('/monitors/inspect-selectors', { url }),
  getMetrics: (id) => apiClient.get(`/monitors/${id}/metrics`),
  getFeedMeta: (id) => apiClient.get(`/monitors/${id}/feed-token`),
  rotateFeedToken: (id) => apiClient.post(`/monitors/${id}/feed-token/rotate`),
  revokeFeedToken: (id) => apiClient.delete(`/monitors/${id}/feed-token`),
  getRssFeedUrl: (id, token) => `${getApiBaseUrl()}/monitors/${id}/rss.xml?token=${token}`
};

export const snapshotsApi = {
  get: (id) => apiClient.get(`/snapshots/${id}`),
  getScreenshotUrl: (id) => `${getApiBaseUrl()}/snapshots/${id}/screenshot`
};

export const changesApi = {
  list: (params) => apiClient.get('/changes', { params }),
  get: (id) => apiClient.get(`/changes/${id}`),
  updateReview: (id, isReviewed) => apiClient.patch(`/changes/${id}`, { is_reviewed: isReviewed }),
  getSummary: (id) => apiClient.get(`/changes/${id}/summary`)
};

export const insightsApi = {
  list: (params) => apiClient.get('/insights', { params }),
  get: (id) => apiClient.get(`/insights/${id}`),
  generate: (changeId) => apiClient.post(`/insights/generate/${changeId}`),
  retry: (changeId) => apiClient.post(`/insights/retry/${changeId}`)
};

export const notificationsApi = {
  listDestinations: (params) => apiClient.get('/notifications/destinations', { params }),
  createDestination: (data) => apiClient.post('/notifications/destinations', data),
  getDestination: (id) => apiClient.get(`/notifications/destinations/${id}`),
  updateDestination: (id, data) => apiClient.patch(`/notifications/destinations/${id}`, data),
  deleteDestination: (id) => apiClient.delete(`/notifications/destinations/${id}`),
  testDestination: (id) => apiClient.post(`/notifications/destinations/${id}/test`),
  listDeliveries: (params) => apiClient.get('/notifications/deliveries', { params }),
  retryDelivery: (id) => apiClient.post(`/notifications/deliveries/${id}/retry`)
};

