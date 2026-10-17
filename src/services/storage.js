/**
 * Client UI storage and Standalone Demonstration Engine.
 * Manages preferences and provides an in-browser observatory fallback
 * when running statically (e.g. Vercel, Netlify, or offline).
 */
import { DEFAULT_STORE } from './mockData.js';

const PREFERENCES_KEY = 'pagepulse_ui_prefs_v1';
const DEMO_MONITORS_KEY = 'pagepulse_demo_monitors_v2';
const DEMO_HISTORY_KEY = 'pagepulse_demo_history_v2';
const DEMO_INSIGHTS_KEY = 'pagepulse_demo_insights_v2';

export const storage = {
  getPreferences(defaults = {}) {
    try {
      const raw = localStorage.getItem(PREFERENCES_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? { ...defaults, ...parsed } : defaults;
    } catch {
      return defaults;
    }
  },

  setPreferences(updates) {
    try {
      const current = this.getPreferences({});
      const updated = { ...current, ...updates };
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));
      return updated;
    } catch {
      return null;
    }
  },

  getDemoMonitors() {
    try {
      const raw = localStorage.getItem(DEMO_MONITORS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    const initial = DEFAULT_STORE.monitors.map(m => ({
      ...m,
      isActive: m.status !== 'paused',
      feedToken: m.feedToken || 'demo_feed_token_secure_64hex',
      feedEnabled: true
    }));
    this.saveDemoMonitors(initial);
    return initial;
  },

  saveDemoMonitors(monitors) {
    try {
      localStorage.setItem(DEMO_MONITORS_KEY, JSON.stringify(monitors));
    } catch {}
  },

  getDemoHistory() {
    try {
      const raw = localStorage.getItem(DEMO_HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    const initial = DEFAULT_STORE.history;
    this.saveDemoHistory(initial);
    return initial;
  },

  saveDemoHistory(history) {
    try {
      localStorage.setItem(DEMO_HISTORY_KEY, JSON.stringify(history));
    } catch {}
  },

  getDemoInsights() {
    try {
      const raw = localStorage.getItem(DEMO_INSIGHTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return DEFAULT_STORE.insights;
  },

  getDemoComparison(id) {
    if (DEFAULT_STORE.comparisons[id]) {
      return DEFAULT_STORE.comparisons[id];
    }
    // Return first comparison as fallback
    const firstKey = Object.keys(DEFAULT_STORE.comparisons)[0];
    return DEFAULT_STORE.comparisons[firstKey] || null;
  },

  clearPreferences() {
    try {
      localStorage.removeItem(PREFERENCES_KEY);
      localStorage.removeItem(DEMO_MONITORS_KEY);
      localStorage.removeItem(DEMO_HISTORY_KEY);
      localStorage.removeItem(DEMO_INSIGHTS_KEY);
    } catch {}
  }
};
