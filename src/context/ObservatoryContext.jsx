import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { monitorService } from '../services/monitorService';
import { changeService } from '../services/changeService';
import { insightService } from '../services/insightService';
import { ApiError } from '../services/apiClient';
import { storage } from '../services/storage';
import { webPushService } from '../services/webPushService';
import { playAlertChime } from '../utils/audioAlert';

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

  // Real-time Live Watch mode state
  const [isLiveWatch, setIsLiveWatch] = useState(false);
  const [liveWatchInterval, setLiveWatchInterval] = useState(15); // seconds
  const liveWatchTimerRef = useRef(null);

  // Browser Push permission state ('default' | 'granted' | 'denied' | 'unsupported')
  const [pushPermission, setPushPermission] = useState(() => webPushService.getPermissionState());

  const showToast = useCallback((payload, type = 'success') => {
    if (typeof payload === 'string') {
      setToast({ message: payload, type, id: Date.now() });
    } else if (payload && typeof payload === 'object') {
      setToast({ ...payload, type: payload.type || type, id: Date.now() });
    }
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
    webPushService.autoSyncIfGranted();
  }, [refresh]);

  // High-frequency Live Watch monitoring loop
  useEffect(() => {
    if (!isLiveWatch) {
      if (liveWatchTimerRef.current) {
        clearInterval(liveWatchTimerRef.current);
        liveWatchTimerRef.current = null;
      }
      return;
    }

    liveWatchTimerRef.current = setInterval(async () => {
      const activeTargets = monitors.filter(m => m.isActive);
      if (activeTargets.length === 0) return;

      for (const m of activeTargets) {
        try {
          const res = await monitorService.triggerCheck(m.id, { wait: true });
          if (res?.hasChanged) {
            playAlertChime();
            webPushService.showLocalNotification({
              title: `⚡ Change Detected: ${m.name}`,
              body: `A change was detected on ${m.url}. Inspect diff telemetry.`,
              url: `/compare/${m.id}?changeId=${res.changeId || ''}`,
              tag: `pagepulse-${m.id}`
            });
            showToast({
              title: `⚡ Change Detected: ${m.name}`,
              message: res.summary || `Content alteration detected on ${m.url}.`,
              type: 'warning',
              actionUrl: `/compare/${m.id}?changeId=${res.changeId || ''}`,
              actionLabel: 'Inspect Diff'
            });
            await refresh(true);
          }
        } catch {}
      }
    }, liveWatchInterval * 1000);

    return () => {
      if (liveWatchTimerRef.current) {
        clearInterval(liveWatchTimerRef.current);
        liveWatchTimerRef.current = null;
      }
    };
  }, [isLiveWatch, liveWatchInterval, monitors, refresh, showToast]);

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
      showToast(`Monitor '${created.name}' registered. Capturing initial baseline...`, 'info');
      triggerCheckMonitor(created.id).catch(() => {});
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
    showToast('Check initiated. Inspecting target content...', 'info');

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
      // 1. Request on-demand check with wait: true so backend awaits execution
      const result = await monitorService.triggerCheck(id, { wait: true });
      let finalResult = result;

      // 2. If check was queued asynchronously, poll until complete
      if (finalResult?.status === 'checking' || finalResult?.status === 'running') {
        let attempts = 0;
        while (attempts < 25) {
          await new Promise(r => setTimeout(r, 1200));
          attempts++;
          const fresh = await monitorService.getById(id).catch(() => null);
          if (fresh && !fresh.isChecking && fresh.status !== 'checking') {
            finalResult = {
              status: fresh.status,
              hasChanged: fresh.status === 'degraded' || Boolean(fresh.lastChangeSummary),
              summary: fresh.lastChangeSummary
            };
            break;
          }
        }
      }

      await refresh(true);
      setCheckingMap(prev => ({ ...prev, [id]: false }));

      if (finalResult?.hasChanged) {
        playAlertChime();
        const targetMon = monitors.find(m => m.id === id);
        webPushService.showLocalNotification({
          title: `⚡ Change Detected: ${targetMon?.name || 'Monitored Target'}`,
          body: finalResult.summary || 'Content alteration detected.',
          url: `/compare/${id}`,
          tag: `pagepulse-${id}`
        });
        showToast({
          title: `⚡ Change Detected: ${targetMon?.name || 'Monitored Target'}`,
          message: finalResult.summary || 'Content alteration detected on monitored target.',
          type: 'warning',
          actionUrl: `/compare/${id}`,
          actionLabel: 'Inspect Diff'
        });
      } else if (finalResult?.status === 'healthy') {
        showToast('✓ Check completed: Content steady, zero deviation.', 'success');
      } else if (finalResult?.status === 'degraded' || finalResult?.status === 'failing') {
        showToast(`Check finished with status: ${finalResult.status}`, 'warning');
      } else {
        showToast('Check completed successfully.', 'info');
      }

      return finalResult;
    } catch (err) {
      setCheckingMap(prev => ({ ...prev, [id]: false }));
      const msg = err instanceof ApiError ? err.userMessage : (err.message || 'Failed to trigger check');
      showToast(msg, 'error');
      throw err;
    }
  }, [isDemoMode, monitors, refresh, showToast]);

  const triggerCheckAll = useCallback(async () => {
    const activeMonitors = monitors.filter(m => m.isActive);
    if (activeMonitors.length === 0) {
      showToast('No active monitors found to check.', 'info');
      return;
    }

    showToast(`Pulsing all ${activeMonitors.length} active monitors...`, 'info');
    activeMonitors.forEach(m => {
      setCheckingMap(prev => ({ ...prev, [m.id]: true }));
    });

    try {
      const results = await Promise.allSettled(
        activeMonitors.map(m => monitorService.triggerCheck(m.id, { wait: true }))
      );
      const hasAnyChanged = results.some(r => r.status === 'fulfilled' && r.value?.hasChanged);
      if (hasAnyChanged) {
        playAlertChime();
      }
      await refresh(true);
      showToast(`Pulse completed across ${activeMonitors.length} targets.`, 'success');
    } catch (err) {
      await refresh(true);
      showToast('Checks completed with some warnings.', 'warning');
    } finally {
      activeMonitors.forEach(m => {
        setCheckingMap(prev => ({ ...prev, [m.id]: false }));
      });
    }
  }, [monitors, refresh, showToast]);

  const toggleLiveWatch = useCallback((intervalSec = 15) => {
    setIsLiveWatch(prev => {
      const next = !prev;
      if (next) {
        setLiveWatchInterval(intervalSec);
        showToast(`⚡ Live Watch active: Inspecting targets every ${intervalSec}s.`, 'info');
      } else {
        showToast('Live Watch paused.', 'info');
      }
      return next;
    });
  }, [showToast]);

  const enablePushNotifications = useCallback(async () => {
    try {
      await webPushService.subscribe();
      setPushPermission(webPushService.getPermissionState());
      showToast('✓ Browser notifications enabled! Instant desktop alerts active.', 'success');
    } catch (err) {
      setPushPermission(webPushService.getPermissionState());
      showToast(err.message || 'Could not enable browser notifications', 'error');
    }
  }, [showToast]);

  const toggleChangeReview = useCallback(async (targetId) => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isMockTarget = isDemoMode || !targetId || !UUID_REGEX.test(targetId) || targetId === 'atelier-nordic';

    if (isMockTarget) {
      let isNowReviewed = false;
      let matched = false;

      const updatedHistory = history.map(h => {
        if (h.id === targetId || h.changeId === targetId || h.compareId === targetId || h.monitorId === targetId) {
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
          return {
            ...m,
            isReviewed: isNowReviewed,
            status: isNowReviewed ? 'healthy' : 'changed',
            backendStatus: isNowReviewed ? 'healthy' : 'degraded'
          };
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
      console.warn('[ObservatoryContext] API toggle fallback to local sync:', err?.message);
      let isNowReviewed = false;
      const updatedMonitors = monitors.map(m => {
        if (m.id === targetId || m.compareId === targetId) {
          isNowReviewed = !m.isReviewed;
          return {
            ...m,
            isReviewed: isNowReviewed,
            status: isNowReviewed ? 'healthy' : 'changed',
            backendStatus: isNowReviewed ? 'healthy' : 'degraded'
          };
        }
        return m;
      });
      const updatedHistory = history.map(h => {
        if (h.id === targetId || h.changeId === targetId || h.compareId === targetId || h.monitorId === targetId) {
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
  const unreviewedCount = history.filter(h => !h.isReviewed).length;
  const stats = {
    total: monitors.length,
    active: monitors.filter(m => m.isActive !== false).length,
    changed: unreviewedCount,
    attention: monitors.filter(m => m.status === 'attention' || m.backendStatus === 'failing' || m.backendStatus === 'blocked').length,
    paused: monitors.filter(m => m.isActive === false).length,
    healthy: monitors.filter(m => m.status === 'healthy' && m.isActive !== false).length,
    unreviewedChanges: unreviewedCount
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
        triggerCheckAll,
        isLiveWatch,
        liveWatchInterval,
        toggleLiveWatch,
        pushPermission,
        enablePushNotifications,
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
