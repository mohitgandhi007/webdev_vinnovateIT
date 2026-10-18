import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { monitorService } from '../services/monitorService';
import { changeService } from '../services/changeService';
import { insightService } from '../services/insightService';
import { ApiError } from '../services/apiClient';
import { storage } from '../services/storage';

const ObservatoryContext = createContext();

export function ObservatoryProvider({ children }) {
  const [monitors, setMonitors] = useState([]);
  const [history, setHistory] = useState([]);
  const [insights, setInsights] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
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

  // Synchronize state from backend API or activate browser showcase mode
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const [monitorsRes, historyRes, insightsRes] = await Promise.allSettled([
        monitorService.getAll({ limit: 100 }),
        changeService.getAllHistory({ limit: 50 }),
        insightService.getInsights({ limit: 50 })
      ]);

      if (monitorsRes.status === 'fulfilled' && Array.isArray(monitorsRes.value?.monitors)) {
        setMonitors(monitorsRes.value.monitors);
        setIsDemoMode(false);
        setConnectionError(null);

        if (historyRes.status === 'fulfilled') {
          setHistory(historyRes.value?.history || []);
        }
        if (insightsRes.status === 'fulfilled') {
          setInsights(insightsRes.value);
        }
      } else {
        // Backend not reachable or static hosting 404
        const err = monitorsRes.reason;
        console.warn('[ObservatoryContext] Live backend API not detected. Activating Standalone Demo Observatory.', err?.message);
        
        const demoMonitors = storage.getDemoMonitors();
        const demoHistory = storage.getDemoHistory();
        const demoInsights = storage.getDemoInsights();

        setMonitors(demoMonitors);
        setHistory(demoHistory);
        setInsights(demoInsights);
        setIsDemoMode(true);
        setConnectionError(err instanceof ApiError ? err.userMessage : (err?.message || 'Standalone Showcase Mode'));
      }
    } catch (err) {
      console.warn('[ObservatoryContext] Error syncing with backend. Using local observatory storage.', err);
      const demoMonitors = storage.getDemoMonitors();
      setMonitors(demoMonitors);
      setIsDemoMode(true);
      setConnectionError('Standalone Showcase Mode');
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Actions
  const addMonitor = useCallback(async (payload) => {
    if (isDemoMode) {
      const cleanUrl = payload.url?.trim() || '';
      const cleanName = payload.name?.trim() || cleanUrl.replace(/^https?:\/\//i, '').split('/')[0] || 'Target';
      const initials = cleanName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'TG';
      const newMon = {
        id: 'mon-' + Date.now(),
        name: cleanName,
        initials,
        url: cleanUrl.replace(/^https?:\/\//i, ''),
        fullUrl: cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`,
        status: 'healthy',
        previousStatus: 'healthy',
        isActive: true,
        isReviewed: true,
        checkCadence: payload.checkCadence || '15m',
        mode: payload.mode || 'both',
        cssSelector: payload.cssSelector || '',
        ignoredSelectors: payload.ignoredSelectors || '',
        numericSelector: payload.numericSelector || '',
        numericUnit: payload.numericUnit || '',
        feedToken: 'demo_token_' + Date.now(),
        feedEnabled: true,
        lastChecked: 'Just registered',
        lastCheckedAt: new Date().toISOString(),
        lastChange: 'Target registered · Baseline established',
        compareId: 'atelier-nordic',
        createdAt: new Date().toISOString()
      };
      const updatedList = [newMon, ...monitors];
      storage.saveDemoMonitors(updatedList);
      setMonitors(updatedList);
      showToast(`Monitor '${cleanName}' registered in local observatory.`);
      return newMon;
    }

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
  }, [isDemoMode, monitors, refresh, showToast]);

  const updateMonitor = useCallback(async (id, updates) => {
    if (isDemoMode) {
      const updatedList = monitors.map(m => m.id === id ? { ...m, ...updates } : m);
      storage.saveDemoMonitors(updatedList);
      setMonitors(updatedList);
      showToast('Monitor settings saved.');
      return updatedList.find(m => m.id === id);
    }

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
  }, [isDemoMode, monitors, refresh, showToast]);

  const togglePauseMonitor = useCallback(async (id, currentIsActive) => {
    if (isDemoMode) {
      const newActive = !currentIsActive;
      const updatedList = monitors.map(m => {
        if (m.id === id) {
          return {
            ...m,
            isActive: newActive,
            status: newActive ? (m.previousStatus || 'healthy') : 'paused'
          };
        }
        return m;
      });
      storage.saveDemoMonitors(updatedList);
      setMonitors(updatedList);
      const target = updatedList.find(m => m.id === id);
      showToast(`Pulse monitoring ${newActive ? 'resumed' : 'paused'} for '${target?.name || 'target'}'.`);
      return target;
    }

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
  }, [isDemoMode, monitors, refresh, showToast]);

  const deleteMonitor = useCallback(async (id) => {
    if (isDemoMode) {
      const existing = monitors.find(m => m.id === id);
      const name = existing ? existing.name : 'Target';
      const updatedList = monitors.filter(m => m.id !== id);
      storage.saveDemoMonitors(updatedList);
      setMonitors(updatedList);
      showToast(`Monitor '${name}' removed.`, 'info');
      return true;
    }

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
  }, [isDemoMode, monitors, refresh, showToast]);

  const triggerCheckMonitor = useCallback(async (id) => {
    setCheckingMap(prev => ({ ...prev, [id]: true }));
    showToast('Check initiated. Analyzing page content...', 'info');

    if (isDemoMode) {
      setTimeout(() => {
        const updatedList = monitors.map(m => {
          if (m.id === id) {
            return {
              ...m,
              status: 'healthy',
              lastChecked: 'Just now',
              lastCheckedAt: new Date().toISOString(),
              lastChange: 'Content verified · No drift detected'
            };
          }
          return m;
        });
        storage.saveDemoMonitors(updatedList);
        setMonitors(updatedList);
        setCheckingMap(prev => ({ ...prev, [id]: false }));
        showToast('Check completed: Content steady, zero deviation.', 'success');
      }, 1500);
      return { success: true };
    }

    try {
      const result = await monitorService.triggerCheck(id);
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
  }, [isDemoMode, monitors, refresh, showToast]);

  const toggleChangeReview = useCallback(async (targetId) => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isMockTarget = isDemoMode || !targetId || !UUID_REGEX.test(targetId) || targetId === 'atelier-nordic';

    if (isMockTarget) {
      let isNowReviewed = false;
      let matched = false;

      const updatedHistory = history.map(h => {
        if (h.id === targetId || h.changeId === targetId || h.compareId === targetId) {
          isNowReviewed = !h.isReviewed;
          matched = true;
          return { ...h, isReviewed: isNowReviewed };
        }
        return h;
      });

      const updatedMonitors = monitors.map(m => {
        if (m.id === targetId || m.compareId === targetId) {
          isNowReviewed = !m.isReviewed;
          matched = true;
          return { ...m, isReviewed: isNowReviewed };
        }
        return m;
      });

      if (!matched) {
        isNowReviewed = true;
      }

      storage.saveDemoHistory(updatedHistory);
      storage.saveDemoMonitors(updatedMonitors);
      setHistory(updatedHistory);
      setMonitors(updatedMonitors);
      showToast(isNowReviewed ? 'Change marked as reviewed.' : 'Change marked as unreviewed.', 'info');
      return isNowReviewed;
    }

    try {
      const updated = await changeService.toggleReview(targetId);
      await refresh(true);
      showToast(updated?.isReviewed ? 'Change marked as reviewed.' : 'Change marked as unreviewed.', 'info');
      return updated?.isReviewed;
    } catch (err) {
      // If server does not have this change ID (or returns 404), toggle locally
      let isNowReviewed = false;
      const updatedMonitors = monitors.map(m => {
        if (m.id === targetId || m.compareId === targetId) {
          isNowReviewed = !m.isReviewed;
          return { ...m, isReviewed: isNowReviewed };
        }
        return m;
      });
      const updatedHistory = history.map(h => {
        if (h.id === targetId || h.changeId === targetId || h.compareId === targetId) {
          isNowReviewed = !h.isReviewed;
          return { ...h, isReviewed: isNowReviewed };
        }
        return h;
      });
      setMonitors(updatedMonitors);
      setHistory(updatedHistory);
      storage.saveDemoMonitors(updatedMonitors);
      storage.saveDemoHistory(updatedHistory);
      showToast(isNowReviewed ? 'Change marked as reviewed.' : 'Change marked as unreviewed.', 'info');
      return isNowReviewed;
    }
  }, [isDemoMode, history, monitors, refresh, showToast]);

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
        isDemoMode,
        connectionError,
        checkingMap,
        toast,
        refresh,
        addMonitor,
        updateMonitor,
        togglePauseMonitor,
        deleteMonitor,
        triggerCheckMonitor,
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
