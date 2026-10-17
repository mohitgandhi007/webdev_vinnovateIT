/**
 * Client UI preferences manager (non-sensitive preferences only: theme, layout toggle, filter presets).
 * Authoritative data for monitors, snapshots, and changes is managed exclusively by the backend API.
 */
const PREFERENCES_KEY = 'pagepulse_ui_prefs_v1';

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

  clearPreferences() {
    try {
      localStorage.removeItem(PREFERENCES_KEY);
      // Clean up legacy prototype key if present
      localStorage.removeItem('pagepulse_store_v2');
      localStorage.removeItem('pagepulse_store');
    } catch {}
  }
};
