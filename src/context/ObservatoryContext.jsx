import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { monitorService } from '../services/monitorService';
import { changeService } from '../services/changeService';
import { insightService } from '../services/insightService';
import { ApiError } from '../services/apiClient';

const ObservatoryContext = createContext();

export function ObservatoryProvider({ children }) {
  const [monitors, setMonitors] = useState([]);
  const [history, setHistory] = useState([]);
  const [insights, setInsights] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(null);
  const [toast, setToast] = useState(null);
  const [checkingMap, setCheckingMap] = useState({});

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Synchronize state from backend API
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const [monitorsRes, historyRes, insightsRes] = await Promise.allSettled([
        monitorService.getAll({ limit: 100 }),
        changeService.getAllHistory({ limit: 50 }),
        insightService.getInsights({ limit: 50 })
      ]);

      if (monitorsRes.status === 'fulfilled') {
        setMonitors(monitorsRes.value.monitors || []);
        setConnectionError(null);
      } else {
        const err = monitorsRes.reason;
        console.error('[ObservatoryContext] Failed to load monitors:', err);
        setConnectionError(err instanceof ApiError ? err.userMessage : (err.message || 'Unable to connect to backend'));
      }

      if (historyRes.status === 'fulfilled') {
        setHistory(historyRes.value.history || []);
      }

      if (insightsRes.status === 'fulfilled') {
        setInsights(insightsRes.value);
      }
    } catch (err) {
      console.error('[ObservatoryContext] Unexpected error during refresh:', err);
      setConnectionError('Connection failure with PagePulse API.');
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Actions
  const addMonitor = useCallback(async (payload) => {
    try {
      const created = await monitorService.create(payload);
      await refresh(true);
      showToast(`Monitor '${created.name}' registered successfully.`);
      return created;
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : (err.message || 'Failed to add monitor');
      showToast(msg, 'error');
      throw err;
    }
  }, [refresh, showToast]);

  const updateMonitor = useCallback(async (id, updates) => {
    try {
      const updated = await monitorService.update(id, updates);
      await refresh(true);
      showToast(`Monitor '${updated.name}' updated.`);
      return updated;
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : (err.message || 'Failed to update monitor');
      showToast(msg, 'error');
      throw err;
    }
  }, [refresh, showToast]);

  const togglePauseMonitor = useCallback(async (id, currentIsActive) => {
    try {
      const updated = await monitorService.togglePause(id, currentIsActive);
      await refresh(true);
      const action = updated.isActive ? 'resumed' : 'paused';
      showToast(`Pulse monitoring ${action} for '${updated.name}'.`);
      return updated;
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : (err.message || 'Failed to change monitor status');
      showToast(msg, 'error');
      throw err;
    }
  }, [refresh, showToast]);

  const deleteMonitor = useCallback(async (id) => {
    try {
      const existing = monitors.find(m => m.id === id);
      const name = existing ? existing.name : 'Target';
      await monitorService.delete(id);
      await refresh(true);
      showToast(`Monitor '${name}' removed.`, 'info');
      return true;
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : (err.message || 'Failed to delete monitor');
      showToast(msg, 'error');
      throw err;
    }
  }, [monitors, refresh, showToast]);

  const triggerCheckMonitor = useCallback(async (id) => {
    setCheckingMap(prev => ({ ...prev, [id]: true }));
    try {
      const result = await monitorService.triggerCheck(id);
      showToast('Check initiated. Analyzing page content...', 'info');
      
      // Poll briefly to refresh state once check completes
      setTimeout(async () => {
        await refresh(true);
        setCheckingMap(prev => ({ ...prev, [id]: false }));
      }, 2500);

      return result;
    } catch (err) {
      setCheckingMap(prev => ({ ...prev, [id]: false }));
      const msg = err instanceof ApiError ? err.userMessage : (err.message || 'Failed to trigger check');
      showToast(msg, 'error');
      throw err;
    }
  }, [refresh, showToast]);

  const markChangeReviewed = useCallback(async (changeId) => {
    try {
      const updated = await changeService.markAsReviewed(changeId);
      await refresh(true);
      showToast('Change marked as reviewed.');
      return updated;
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : 'Failed to update review status';
      showToast(msg, 'error');
      throw err;
    }
  }, [refresh, showToast]);

  const markChangeUnreviewed = useCallback(async (changeId) => {
    try {
      const updated = await changeService.markAsUnreviewed(changeId);
      await refresh(true);
      showToast('Change marked as unreviewed pending audit.', 'info');
      return updated;
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : 'Failed to update review status';
      showToast(msg, 'error');
      throw err;
    }
  }, [refresh, showToast]);

  const toggleChangeReview = useCallback(async (changeId) => {
    try {
      const updated = await changeService.toggleReview(changeId);
      await refresh(true);
      showToast(updated?.isReviewed ? 'Change marked as reviewed.' : 'Change marked as unreviewed.', 'info');
      return updated?.isReviewed;
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : 'Failed to toggle review status';
      showToast(msg, 'error');
      throw err;
    }
  }, [refresh, showToast]);

  // Derived dynamic statistics from actual records
  const stats = {
    total: monitors.length,
    active: monitors.filter(m => m.isActive !== false).length,
    changed: monitors.filter(m => m.status === 'changed' || m.backendStatus === 'degraded').length,
    attention: monitors.filter(m => m.status === 'attention' || m.backendStatus === 'failing' || m.backendStatus === 'blocked').length,
    paused: monitors.filter(m => m.isActive === false).length,
    healthy: monitors.filter(m => m.status === 'healthy' && m.isActive !== false).length,
    unreviewedChanges: history.filter(h => !h.isReviewed).length
  };

  return (
    <ObservatoryContext.Provider
      value={{
        monitors,
        history,
        insights,
        stats,
        isLoading,
        connectionError,
        checkingMap,
        toast,
        refresh,
        addMonitor,
        updateMonitor,
        togglePauseMonitor,
        deleteMonitor,
        triggerCheckMonitor,
        markChangeReviewed,
        markChangeUnreviewed,
        toggleChangeReview,
        showToast,
        dismissToast
      }}
    >
      {children}
    </ObservatoryContext.Provider>
  );
}

export function useObservatory() {
  const context = useContext(ObservatoryContext);
  if (!context) {
    throw new Error('useObservatory must be used within an ObservatoryProvider');
  }
  return context;
}
