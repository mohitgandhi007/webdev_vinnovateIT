import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useObservatory } from '../context/ObservatoryContext';
import { changeService } from '../services/changeService';
import { snapshotsApi, changesApi } from '../services/apiClient';
import NumericMetricTracker from '../components/NumericMetricTracker';
import RssFeedModal from '../components/RssFeedModal';
import { storage } from '../services/storage';

export default function VisualComparePage() {
  const { id = 'atelier-nordic' } = useParams();
  const [searchParams] = useSearchParams();
  const changeIdParam = searchParams.get('changeId');
  const navigate = useNavigate();
  const { monitors, history, toggleChangeReview } = useObservatory();

  const [comparison, setComparison] = useState(null);
  const [aiInsight, setAiInsight] = useState(null);
  const [activeSnapshotId, setActiveSnapshotId] = useState('current');
  const [viewMode, setViewMode] = useState('side-by-side'); // 'side-by-side' | 'overlay' | 'text-diff'
  const [overlayPos, setOverlayPos] = useState(50);
  const [showExportToast, setShowExportToast] = useState(false);
  const [isRssModalOpen, setIsRssModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [localReviewed, setLocalReviewed] = useState(null);

  // Load comparison data whenever id or changeId changes
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    async function loadData() {
      try {
        let monitorId = id;
        let baselineId = searchParams.get('baseline');
        let currentId = searchParams.get('current');
        let activeChangeId = changeIdParam;

        // If id looks like a change ID or was passed via history
        const matchedChange = history.find(h => h.id === id || h.changeId === id || h.monitorId === id);
        if (matchedChange) {
          monitorId = matchedChange.monitorId;
          baselineId = matchedChange.baselineSnapshotId;
          currentId = matchedChange.currentSnapshotId;
          activeChangeId = matchedChange.id;
        }

        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        // Fetch comparison data from backend if valid UUID
        let compareData = null;
        if (monitorId && UUID_REGEX.test(monitorId)) {
          try {
            const params = {};
            if (baselineId) params.baseline = baselineId;
            if (currentId) params.current = currentId;
            compareData = await changeService.getComparison(monitorId, params);
          } catch (compErr) {
            // If monitorId lookup failed, perhaps id is a direct change UUID
            if (id && UUID_REGEX.test(id)) {
              try {
                const chg = await changesApi.get(id);
                if (chg?.data) {
                  monitorId = chg.data.monitor_id;
                  activeChangeId = chg.data.id;
                  compareData = await changeService.getComparison(monitorId, {
                    baseline: chg.data.baseline_snapshot_id,
                    current: chg.data.current_snapshot_id
                  });
                }
              } catch {}
            }
          }
        }

        if (!isMounted) return;

        if (compareData) {
          const { monitor, baseline, current, diff, timeline, hasComparison } = compareData;

          if (hasComparison === false || (!baseline && !current)) {
            setComparison({
              hasComparison: false,
              title: monitor?.name || 'Monitored Target',
              url: monitor?.url || '',
              message: 'No snapshots captured yet for this target. Trigger a check to record the first baseline.'
            });
            setIsLoading(false);
            return;
          }

          const hasScreenshots = Boolean(current?.screenshot_path && baseline?.screenshot_path);
          const currentScreenshotUrl = current?.id ? snapshotsApi.getScreenshotUrl(current.id) : null;
          const baselineScreenshotUrl = baseline?.id ? snapshotsApi.getScreenshotUrl(baseline.id) : null;

          // Attempt to load AI insight for active change
          if (activeChangeId) {
            try {
              const summaryRes = await changesApi.getSummary(activeChangeId);
              if (isMounted && summaryRes?.data) {
                setAiInsight(summaryRes.data);
              }
            } catch {}
          }

          setComparison({
            hasComparison: true,
            title: monitor?.name || 'Monitored Target',
            url: monitor?.url || '',
            monitorId: monitor?.id,
            changeId: activeChangeId || compareData.changeId,
            isReviewed: compareData.isReviewed,
            baseline,
            current,
            diff,
            snapshots: {
              current: {
                id: current?.id || 'current',
                timestamp: current?.captured_at 
                  ? new Date(current.captured_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + new Date(current.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · Current'
                  : 'Recent Capture',
                baselineTimestamp: baseline?.captured_at 
                  ? new Date(baseline.captured_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + new Date(baseline.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · Baseline'
                  : 'Baseline Capture',
                hasScreenshots,
                currentScreenshotUrl,
                baselineScreenshotUrl,
                currentText: current?.text_content || '',
                baselineText: baseline?.text_content || '',
                diffBlocks: diff?.blocks || [],
                diffSummary: diff?.summary || { addedLines: 0, removedLines: 0 },
                diffText: diff?.diffText || '',
                hasChanged: diff?.hasChanged || false,
                changeSummary: {
                  heading: diff?.hasChanged 
                    ? `${(diff.summary?.addedLines || 0) + (diff.summary?.removedLines || 0)} text alterations detected` 
                    : 'Content identical to baseline',
                  details: diff?.hasChanged 
                    ? `Identified ${diff.summary?.addedLines || 0} added line(s) and ${diff.summary?.removedLines || 0} removed line(s) under active normalization.` 
                    : 'No semantic alterations detected between the selected captures.',
                  domNodesModified: ((diff?.summary?.addedLines || 0) + (diff?.summary?.removedLines || 0)) * 2
                },
                textDiff: {
                  added: (diff?.blocks || []).filter(b => b.type === 'added').flatMap(b => b.lines),
                  removed: (diff?.blocks || []).filter(b => b.type === 'removed').flatMap(b => b.lines)
                }
              }
            },
            activeSnapshotId: 'current',
            chronology: (timeline || []).map(t => ({
              id: t.id,
              time: new Date(t.capturedAt).toLocaleString(),
              label: `Capture #${t.scanNumber} (HTTP ${t.httpStatusCode || 200})`,
              status: t.hasScreenshot ? 'Visual+DOM' : 'DOM Only',
              statusType: 'healthy'
            }))
          });
          setActiveSnapshotId('current');
        } else {
          const demoComp = storage.getDemoComparison(id);
          if (demoComp) {
            setComparison(demoComp);
            setActiveSnapshotId('current');
          } else {
            setComparison(null);
          }
        }
      } catch (err) {
        console.error('[VisualComparePage] Failed to load comparison:', err);
        if (isMounted) {
          const demoComp = storage.getDemoComparison(id);
          if (demoComp) {
            setComparison(demoComp);
            setActiveSnapshotId('current');
          } else {
            setComparison(null);
          }
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [id, changeIdParam, history, searchParams]);

  if (!comparison) {
    return (
      <div className="w-full flex-1 flex flex-col items-center justify-center py-20 px-4">
        <h2 className="font-headline-md text-headline-md text-on-surface">Target comparison not found</h2>
        <Link to="/monitors" className="mt-4 px-4 py-2 bg-primary text-on-primary rounded text-body-sm">
          Return to Monitors
        </Link>
      </div>
    );
  }

  // Active snapshot data
  const snapshot = comparison.snapshots?.[activeSnapshotId] || comparison.snapshots?.['#849'] || Object.values(comparison.snapshots || {})[0];
  const hasScreenshots = snapshot?.hasScreenshots ?? true;

  // Check if this target or change is reviewed in state
  const targetMonitor = monitors.find(m => m.id === id || m.compareId === id);
  const matchedChange = history.find(h => 
    h.id === id || 
    h.changeId === id || 
    (changeIdParam && h.id === changeIdParam) ||
    h.monitorId === id
  );
  const isReviewed = localReviewed !== null
    ? localReviewed
    : (comparison?.isReviewed ?? (matchedChange?.isReviewed || targetMonitor?.isReviewed || false));

  const handleSelectSnapshot = (snapId) => {
    setActiveSnapshotId(snapId);
    if (snapId && snapId !== 'current' && snapId !== '#849') {
      navigate(`/compare/${id}?current=${snapId}`);
    } else {
      changeService.selectSnapshot(id, snapId);
    }
  };

  const handleToggleReviewed = async () => {
    const nextReviewed = !isReviewed;
    setLocalReviewed(nextReviewed);
    if (comparison) {
      setComparison(prev => prev ? { ...prev, isReviewed: nextReviewed } : null);
    }
    const targetId = changeIdParam || matchedChange?.id || comparison?.changeId || id;
    try {
      await toggleChangeReview(targetId);
    } catch (err) {
      console.warn('[VisualComparePage] toggleChangeReview notice:', err?.message);
    }
  };

  const handleExport = () => {
    const markdown = `# PagePulse Inspection Report\n\nTarget: ${comparison.title}\nBaseline: ${snapshot?.baselineTimestamp}\nCurrent: ${snapshot?.timestamp}\n\n## Change Summary\n${snapshot?.changeSummary?.details}\n\n## DOM Alterations\nModified: ${snapshot?.changeSummary?.domNodesModified} nodes\n`;
    navigator.clipboard?.writeText(markdown);
    setShowExportToast(true);
    setTimeout(() => setShowExportToast(false), 3000);
  };

  return (
    <div className="w-full flex flex-col pb-16 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {showExportToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-on-surface text-surface px-4 py-2.5 rounded shadow-xl font-label-sm text-label-sm flex items-center gap-2 border border-sandstone">
          <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
          <span>Summary copied to clipboard in Markdown format</span>
        </div>
      )}

      {/* TOP BAR / BREADCRUMB */}
      <section className="w-full px-margin-mobile md:px-margin-desktop pt-8 pb-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-sandstone">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link
                to="/monitors"
                className="inline-flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                <span>Back to Monitors</span>
              </Link>
            </div>
            <h1 className="font-headline-lg text-headline-lg md:font-headline-xl md:text-headline-xl text-on-surface tracking-tight leading-tight">
              The difference,{' '}
              <span className="italic font-headline-lg md:font-headline-xl text-primary font-normal">
                made visible.
              </span>
            </h1>
            <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
              Compare two captures and inspect semantic pixel and text changes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Target Selector Dropdown */}
            <div className="bg-surface-container-lowest px-3.5 py-2 rounded shadow-sm flex items-center gap-2 border border-sandstone">
              <span className="material-symbols-outlined text-[18px] text-primary">public</span>
              <select
                value={id}
                onChange={(e) => navigate(`/compare/${e.target.value}`)}
                className="bg-transparent font-body-sm text-body-sm text-on-surface font-medium focus:outline-none cursor-pointer"
              >
                {monitors.map((m) => (
                  <option key={m.id} value={m.compareId || m.id}>
                    {m.name} ({m.url})
                  </option>
                ))}
              </select>
            </div>

            {/* View Mode Switcher */}
            <div className="inline-flex p-1 bg-surface-container rounded gap-1 shadow-inner border border-sandstone/60">
              <button
                type="button"
                onClick={() => setViewMode('side-by-side')}
                className={`px-3 py-1 text-label-sm font-label-sm rounded transition-all ${
                  viewMode === 'side-by-side'
                    ? 'bg-surface-container-lowest rounded shadow-sm text-on-surface font-medium'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Side-by-Side
              </button>
              <button
                type="button"
                onClick={() => setViewMode('overlay')}
                className={`px-3 py-1 text-label-sm font-label-sm rounded transition-all ${
                  viewMode === 'overlay'
                    ? 'bg-surface-container-lowest rounded shadow-sm text-on-surface font-medium'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Overlay
              </button>
              <button
                type="button"
                onClick={() => setViewMode('text-diff')}
                className={`px-3 py-1 text-label-sm font-label-sm rounded transition-all ${
                  viewMode === 'text-diff'
                    ? 'bg-surface-container-lowest rounded shadow-sm text-on-surface font-medium'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Text Diff
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON VIEWPORT */}
      <section className="w-full px-margin-mobile md:px-margin-desktop py-4">
        {/* If no screenshots available, show honest placeholder message */}
        {!hasScreenshots && viewMode !== 'text-diff' ? (
          <div className="bg-surface-container-lowest rounded p-12 text-center border border-sandstone flex flex-col items-center">
            <span className="material-symbols-outlined text-[36px] text-tertiary mb-3">broken_image</span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-normal">
              Visual Screenshot Not Captured
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-md">
              This destination was monitored in <strong>DOM Text Content Only</strong> mode or is awaiting its first headless visual rendering cycle.
            </p>
            <button
              onClick={() => setViewMode('text-diff')}
              className="mt-4 px-4 py-2 rounded bg-surface-container text-on-surface font-body-sm text-body-sm hover:bg-surface-container-high border border-sandstone"
            >
              Switch to Text Diff View
            </button>
          </div>
        ) : viewMode === 'side-by-side' ? (
          snapshot?.currentScreenshotUrl && snapshot?.baselineScreenshotUrl ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Baseline Screenshot */}
              <div className="flex flex-col bg-surface-container-lowest rounded shadow-sm overflow-hidden border border-sandstone">
                <div className="bg-surface-container px-4 py-3 flex items-center justify-between border-b border-sandstone">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-outline-variant"></span>
                    <span className="font-label-sm text-label-sm font-semibold tracking-wide text-on-surface">
                      Baseline: {snapshot.baselineTimestamp}
                    </span>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Baseline Frame</span>
                </div>
                <div className="p-4 bg-surface-bright flex items-center justify-center min-h-[350px]">
                  <img
                    src={snapshot.baselineScreenshotUrl}
                    alt="Baseline capture screenshot"
                    className="max-w-full h-auto max-h-[550px] object-contain rounded border border-sandstone/60 shadow-xs"
                  />
                </div>
              </div>

              {/* Current Screenshot */}
              <div className="flex flex-col bg-surface-container-lowest rounded shadow-sm overflow-hidden border border-secondary/50 ring-1 ring-secondary/30">
                <div className="bg-surface-container-high px-4 py-3 flex items-center justify-between border-b border-sandstone">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-secondary"></span>
                    <span className="font-label-sm text-label-sm font-semibold tracking-wide text-on-surface">
                      Current: {snapshot.timestamp}
                    </span>
                  </div>
                  <span className="font-label-sm text-label-sm text-secondary bg-secondary-container/40 px-2 py-0.5 rounded font-semibold">
                    Current Frame
                  </span>
                </div>
                <div className="p-4 bg-surface-bright flex items-center justify-center min-h-[350px]">
                  <img
                    src={snapshot.currentScreenshotUrl}
                    alt="Current capture screenshot"
                    className="max-w-full h-auto max-h-[550px] object-contain rounded border border-sandstone/60 shadow-xs"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* LEFT: BASELINE CAPTURE TEXT CONTENT */}
              <div className="flex flex-col bg-surface-container-lowest rounded shadow-sm overflow-hidden border border-sandstone">
                <div className="bg-surface-container px-4 py-3 flex items-center justify-between border-b border-sandstone">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-outline-variant"></span>
                    <span className="font-label-sm text-label-sm font-semibold tracking-wide text-on-surface">
                      Baseline: {snapshot?.baselineTimestamp}
                    </span>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                    Baseline Text
                  </span>
                </div>
                <div className="p-4 bg-surface-container-low/50 min-h-[350px] max-h-[550px] overflow-y-auto">
                  {snapshot?.baselineText ? (
                    <pre className="font-mono text-xs text-on-surface whitespace-pre-wrap leading-relaxed select-text">
                      {snapshot.baselineText}
                    </pre>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-tertiary font-body-sm text-body-sm">
                      <span className="material-symbols-outlined text-[28px] mb-1">text_snippet</span>
                      <span>No text content in baseline snapshot</span>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: CURRENT LIVE CAPTURE TEXT CONTENT */}
              <div className="flex flex-col bg-surface-container-lowest rounded shadow-sm overflow-hidden border border-secondary/50 ring-1 ring-secondary/30">
                <div className="bg-surface-container-high px-4 py-3 flex items-center justify-between border-b border-sandstone">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-secondary"></span>
                    <span className="font-label-sm text-label-sm font-semibold tracking-wide text-on-surface">
                      Current: {snapshot?.timestamp}
                    </span>
                  </div>
                  <span className="font-label-sm text-label-sm text-secondary bg-secondary-container/40 px-2 py-0.5 rounded font-semibold">
                    Current Text
                  </span>
                </div>
                <div className="p-4 bg-surface-container-low/50 min-h-[350px] max-h-[550px] overflow-y-auto">
                  {snapshot?.currentText ? (
                    <pre className="font-mono text-xs text-on-surface whitespace-pre-wrap leading-relaxed select-text">
                      {snapshot.currentText}
                    </pre>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-tertiary font-body-sm text-body-sm">
                      <span className="material-symbols-outlined text-[28px] mb-1">text_snippet</span>
                      <span>No text content in current capture</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        ) : viewMode === 'overlay' ? (
          <div className="bg-surface-container-lowest rounded shadow-sm overflow-hidden border border-sandstone p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-sandstone">
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Swipe Slider: {overlayPos}% Baseline / {100 - overlayPos}% Current
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={overlayPos}
                onChange={(e) => setOverlayPos(Number(e.target.value))}
                aria-label="Screenshot comparison slider"
                className="w-64 accent-primary cursor-pointer"
              />
            </div>
            {snapshot?.currentScreenshotUrl && snapshot?.baselineScreenshotUrl ? (
              <div className="relative min-h-[400px] bg-surface-bright rounded flex items-center justify-center p-4 overflow-hidden border border-sandstone/60">
                <div className="relative max-w-full max-h-[600px] overflow-hidden rounded">
                  <img
                    src={snapshot.baselineScreenshotUrl}
                    alt="Baseline capture"
                    className="block max-w-full h-auto max-h-[600px] object-contain"
                  />
                  <img
                    src={snapshot.currentScreenshotUrl}
                    alt="Current capture overlay"
                    className="absolute inset-0 block max-w-full h-auto max-h-[600px] object-contain transition-opacity duration-75"
                    style={{ opacity: (100 - overlayPos) / 100 }}
                  />
                </div>
              </div>
            ) : (
              <div className="relative min-h-[380px] bg-surface-bright rounded flex items-center justify-center p-8 overflow-hidden">
                <div className="w-full max-w-md bg-surface-container-lowest p-6 rounded border border-sandstone relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-headline-sm text-headline-sm text-on-surface">
                      {snapshot?.currentTier?.name}
                    </span>
                    <span className="font-label-sm text-label-sm text-secondary font-medium">Overlay Blend</span>
                  </div>
                  <div className="py-4 my-2 flex items-baseline gap-3">
                    <span className="font-headline-lg text-headline-lg font-bold" style={{ opacity: overlayPos / 100 }}>
                      {snapshot?.baselineTier?.price}
                    </span>
                    <span className="font-headline-lg text-headline-lg text-secondary font-bold" style={{ opacity: (100 - overlayPos) / 100 }}>
                      {snapshot?.currentTier?.price}
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      {snapshot?.currentTier?.period}
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {overlayPos > 50 ? snapshot?.baselineTier?.billed : snapshot?.currentTier?.billed}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-surface-container-lowest rounded shadow-sm overflow-hidden border border-sandstone p-6">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-sandstone font-label-sm text-label-sm">
              <span className="text-on-surface font-semibold uppercase tracking-wider">
                Syntactic Content Diff &amp; Line Variations
              </span>
              <span className="text-on-surface-variant">
                {snapshot?.diffBlocks ? `${snapshot.diffSummary?.addedLines || 0} added · ${snapshot.diffSummary?.removedLines || 0} removed` : `${snapshot?.changeSummary?.domNodesModified || 0} DOM nodes altered`}
              </span>
            </div>

            {snapshot?.diffBlocks && snapshot.diffBlocks.length > 0 ? (
              <div className="bg-surface-container-low rounded border border-sandstone/80 overflow-hidden font-mono text-[12px] divide-y divide-sandstone/30">
                {snapshot.diffBlocks.map((block, bIdx) => (
                  <div key={bIdx} className={`p-3 ${
                    block.type === 'added' ? 'bg-primary/10' : block.type === 'removed' ? 'bg-error-container/20' : 'bg-surface-container-lowest/50'
                  }`}>
                    <div className="flex items-center justify-between text-[10px] text-tertiary mb-1 uppercase font-semibold">
                      <span>{block.type === 'added' ? '+ Injected Section' : block.type === 'removed' ? '- Removed Section' : 'Context'}</span>
                      <span>Lines {block.startLine}–{block.endLine}</span>
                    </div>
                    <div className="space-y-0.5">
                      {block.lines.map((ln, lIdx) => (
                        <div key={lIdx} className={`flex items-start gap-2 ${
                          block.type === 'added' ? 'text-primary font-medium' : block.type === 'removed' ? 'text-error line-through' : 'text-on-surface-variant'
                        }`}>
                          <span className="select-none w-5 text-right text-tertiary/70 shrink-0">
                            {block.startLine + lIdx}
                          </span>
                          <span className="select-none font-bold shrink-0">
                            {block.type === 'added' ? '+' : block.type === 'removed' ? '-' : ' '}
                          </span>
                          <span className="break-all">{ln}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded bg-error-container/15 border-l-4 border-error">
                  <span className="font-label-sm text-label-sm text-error font-semibold block mb-2">- REMOVED</span>
                  <div className="space-y-1 font-telemetry-data text-telemetry-data text-on-surface">
                    {(snapshot?.textDiff?.removed || []).length === 0 ? (
                      <span className="text-tertiary italic text-xs">No removed lines</span>
                    ) : (
                      snapshot.textDiff.removed.map((line, idx) => (
                        <div key={idx} className="line-through text-error/90">{line}</div>
                      ))
                    )}
                  </div>
                </div>
                <div className="p-4 rounded bg-primary/10 border-l-4 border-primary">
                  <span className="font-label-sm text-label-sm text-primary font-semibold block mb-2">+ INJECTED</span>
                  <div className="space-y-1 font-telemetry-data text-telemetry-data text-on-surface">
                    {(snapshot?.textDiff?.added || []).length === 0 ? (
                      <span className="text-tertiary italic text-xs">No added lines</span>
                    ) : (
                      snapshot.textDiff.added.map((line, idx) => (
                        <div key={idx} className="text-primary font-medium">{line}</div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
 
      {/* NUMERICAL VALUE TRACKING OBSERVATORY */}
      {comparison?.monitorId && (
        <section className="w-full px-margin-mobile md:px-margin-desktop py-4">
          <NumericMetricTracker
            monitorId={comparison.monitorId}
            monitorName={comparison.title}
            onOpenSnapshot={(snapId) => handleSelectSnapshot(snapId)}
          />
        </section>
      )}

      {/* CHANGE SUMMARY REVIEW CARD */}
      <section className="w-full px-margin-mobile md:px-margin-desktop py-6">
        <div className="bg-surface-container-lowest p-6 md:p-8 rounded shadow-sm border border-sandstone">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[20px] text-secondary">
                  {aiInsight ? 'psychology' : 'price_change'}
                </span>
                <span className="font-label-sm text-label-sm text-secondary font-semibold uppercase tracking-wider">
                  {aiInsight ? 'Gemini Change Intelligence' : 'Change Summary'}
                </span>
                {aiInsight?.model_name && (
                  <span className="px-2 py-0.5 rounded font-label-sm text-xs bg-surface-container font-mono text-tertiary">
                    {aiInsight.model_name}
                  </span>
                )}
                {isReviewed && (
                  <span className="px-2 py-0.5 rounded font-label-sm text-label-sm bg-primary/15 text-primary">
                    Reviewed ✓
                  </span>
                )}
              </div>
              <h2 className="font-headline-md text-headline-md text-on-surface font-medium">
                {aiInsight?.title || snapshot?.changeSummary?.heading || 'Deviation Detected'}
              </h2>
              <p className="mt-3 font-body-md text-body-md text-on-surface-variant leading-relaxed">
                {aiInsight?.summary_text || snapshot?.changeSummary?.details}
              </p>
              {aiInsight?.evidence && Array.isArray(aiInsight.evidence) && aiInsight.evidence.length > 0 && (
                <div className="mt-3 pt-3 border-t border-sandstone/40">
                  <span className="font-label-sm text-xs text-tertiary uppercase tracking-wider block mb-1">
                    Observed Evidence:
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-body-sm text-on-surface-variant font-mono text-xs">
                    {aiInsight.evidence.map((ev, i) => (
                      <li key={i}>{typeof ev === 'string' ? ev : (ev.fact || ev.description || JSON.stringify(ev))}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <button
                onClick={() => setIsRssModalOpen(true)}
                className="px-4 py-2 border border-sandstone hover:bg-surface-container text-on-surface font-body-sm text-body-sm rounded transition-colors flex items-center justify-center gap-2"
                type="button"
                title="Subscribe to changes via RSS 2.0"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">rss_feed</span>
                <span>RSS Feed</span>
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-2 border border-sandstone hover:bg-surface-container text-on-surface font-body-sm text-body-sm rounded transition-colors flex items-center justify-center gap-2"
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">file_download</span>
                <span>Export Summary</span>
              </button>
              <button
                onClick={handleToggleReviewed}
                className={`px-5 py-2 rounded font-body-sm text-body-sm font-medium shadow-sm transition-colors flex items-center justify-center gap-2 ${
                  isReviewed
                    ? 'bg-surface-container text-primary border border-primary/60 hover:bg-surface-container-high'
                    : 'bg-primary hover:bg-primary-container text-on-primary'
                }`}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isReviewed ? 'check_circle' : 'visibility'}
                </span>
                <span>{isReviewed ? 'Mark as Unreviewed' : 'Mark as Reviewed'}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CAPTURE CHRONOLOGY LEDGER (CLICKABLE SNAPSHOT SELECTION) */}
      <section className="w-full px-margin-mobile md:px-margin-desktop py-4">
        <div className="bg-surface-container-lowest p-6 rounded shadow-sm border border-sandstone">
          <div className="flex items-center justify-between mb-3">
            <span className="font-label-md text-label-md text-on-surface font-semibold uppercase tracking-wider">
              Capture Chronology
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              Click any capture to inspect historical state
            </span>
          </div>
          <div className="divide-y divide-sandstone">
            {(comparison.chronology || []).map((c) => {
              const isSelected = activeSnapshotId === c.id;

              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectSnapshot(c.id)}
                  className={`py-3 px-2 rounded cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                    isSelected ? 'bg-primary/10 border-l-4 border-primary pl-3' : 'hover:bg-surface-container-low'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        c.statusType === 'changed'
                          ? 'bg-secondary'
                          : c.statusType === 'attention'
                          ? 'bg-error'
                          : 'bg-outline-variant'
                      }`}
                    ></span>
                    <span className="font-telemetry-data text-telemetry-data text-on-surface font-medium">
                      {c.id}
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface">{c.label}</span>
                  </div>
                  <div className="flex items-center gap-4 text-on-surface-variant font-label-sm text-label-sm">
                    <span>{c.time}</span>
                    <span
                      className={`px-2 py-0.5 rounded font-medium ${
                        c.statusType === 'changed'
                          ? 'bg-secondary-container/40 text-on-secondary-container'
                          : c.statusType === 'attention'
                          ? 'bg-error-container/40 text-error'
                          : 'bg-surface-container'
                      }`}
                    >
                      {c.status}
                    </span>
                    {isSelected && (
                      <span className="font-label-sm text-[11px] text-primary font-semibold">Active</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* RSS FEED MODAL */}
      <RssFeedModal
        isOpen={isRssModalOpen}
        onClose={() => setIsRssModalOpen(false)}
        monitorId={comparison?.monitorId}
        monitorName={comparison?.title}
      />
    </div>
  );
}
