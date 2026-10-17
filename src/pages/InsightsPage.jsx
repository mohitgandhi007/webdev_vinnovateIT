import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { insightsApi } from '../services/apiClient';

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState('All');
  const [liveInsights, setLiveInsights] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);
  const [errorNotice, setErrorNotice] = useState(null);

  const fetchInsights = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorNotice(null);
      const res = await insightsApi.list({ limit: 50 });
      if (res.success && Array.isArray(res.data)) {
        setLiveInsights(res.data);
      }
    } catch (err) {
      console.warn('[InsightsPage] Real insights fetch error:', err.message);
      setErrorNotice(err.message || 'Unable to load change intelligence dispatches from backend.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleRetry = async (changeId) => {
    if (!changeId) return;
    try {
      setRetryingId(changeId);
      await insightsApi.retry(changeId);
      await fetchInsights();
    } catch (err) {
      setErrorNotice(`Retry failed: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  // Normalized dispatches list strictly from real data
  const dispatches = liveInsights.map((item) => {
    const isFallback = item.status === 'fallback' || item.model_name?.includes('fallback');
    const isPending = item.status === 'pending';
    const isFailed = item.status === 'failed';

    let status = 'available';
    if (isPending) status = 'pending';
    else if (isFailed) status = 'failed';
    else if (isFallback) status = 'fallback';

    return {
      id: item.id,
      changeId: item.detected_change_id || item.change_id,
      monitorId: item.monitor_id,
      title: item.title || item.headline || 'Observed Change Summary',
      summary: item.summary || item.summary_text || item.executive_summary || '',
      importance: (item.importance || item.impact_level || 'medium').toLowerCase(),
      category: (item.category || 'content').toLowerCase(),
      status,
      modelName: item.model_name || 'gemini-2.5-flash',
      evidence: Array.isArray(item.evidence) ? item.evidence : (Array.isArray(item.observed_facts) ? item.observed_facts : []),
      errorMessage: item.error_message,
      source: item.monitor_name || item.monitor_url || 'Monitored Target',
      time: item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent',
      compareId: item.monitor_id || item.detected_change_id
    };
  });

  const featured = dispatches.length > 0 ? dispatches[0] : null;
  const secondaryDispatches = dispatches.length > 1 ? dispatches.slice(1) : [];

  // Tabs calculation
  const categoriesPresent = Array.from(new Set(dispatches.map((d) => d.category)));
  const tabs = [
    { label: 'All', count: dispatches.length },
    ...categoriesPresent.map((cat) => ({
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
      count: dispatches.filter((d) => d.category === cat).length
    }))
  ];

  const filteredDispatches = secondaryDispatches.filter((d) => {
    if (activeTab === 'All') return true;
    return d.category === activeTab.toLowerCase();
  });

  return (
    <div className="w-full px-margin-mobile md:px-margin-desktop pt-8 pb-16 animate-in fade-in duration-200">
      <div className="flex flex-col gap-6 max-w-7xl mx-auto">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-sandstone">
          <div className="flex flex-col gap-3 max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <span className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">
                GEMINI CHANGE INTELLIGENCE
              </span>
              <span className="text-outline-variant font-label-sm text-label-sm">/</span>
              <span className="font-label-sm text-label-sm text-tertiary">
                LIVE DISPATCHES ({dispatches.length})
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg md:text-headline-xl text-on-surface tracking-tight leading-tight">
              What <span className="italic font-normal">deserves your attention</span>?
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl font-light">
              Concise, evidence-grounded intelligence explanations generated strictly from deterministically detected changes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchInsights}
              disabled={isLoading}
              className="px-4 py-2 bg-surface-container hover:bg-surface-container-high border border-sandstone rounded text-body-sm font-label-md text-on-surface flex items-center gap-2 transition-colors disabled:opacity-50"
              type="button"
            >
              <span className={`material-symbols-outlined text-[16px] ${isLoading ? 'animate-spin' : ''}`}>
                refresh
              </span>
              <span>{isLoading ? 'Updating...' : 'Refresh Dispatches'}</span>
            </button>
          </div>
        </div>

        {/* EMPTY STATE */}
        {!isLoading && dispatches.length === 0 && (
          <div className="bg-surface-container-lowest border border-sandstone rounded-lg p-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[32px]">psychology</span>
            </div>
            <h3 className="font-headline-md text-headline-md text-on-surface font-normal">
              No change intelligence dispatches recorded yet.
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
              Gemini summaries are generated automatically by the backend workflow when content differences are detected on your monitored pages.
            </p>
            <div className="pt-2">
              <Link
                to="/monitors"
                className="px-5 py-2.5 rounded bg-primary text-on-primary font-body-sm text-body-sm hover:bg-primary-container transition-colors inline-flex items-center gap-2"
              >
                <span>View Monitors</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            </div>
          </div>
        )}

        {errorNotice && (
          <div className="bg-error/10 border border-error/30 rounded-lg p-4 text-body-sm text-error flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{errorNotice}</span>
          </div>
        )}

        {/* FILTER TABS */}
        <div className="flex items-center justify-between overflow-x-auto py-2">
          <div className="flex items-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => setActiveTab(tab.label)}
                className={`px-4 py-2 rounded font-label-md text-label-md transition-all whitespace-nowrap ${
                  activeTab === tab.label
                    ? 'bg-surface-container-highest text-on-surface font-semibold shadow-xs'
                    : 'bg-transparent hover:bg-surface-container text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab.label} <span className="text-tertiary font-label-sm text-label-sm ml-1">({tab.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* LOADING SKELETON */}
        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="font-body-md text-body-md">Synthesizing change intelligence dispatches...</p>
          </div>
        )}

        {/* PRIMARY FEATURED JOURNAL ARTICLE */}
        {!isLoading && featured && (activeTab === 'All' || activeTab.toLowerCase() === featured.category) && (
          <article className="bg-surface-container-lowest rounded-xl shadow-sm border border-sandstone p-6 lg:p-8 mt-2 transition-all">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-8 flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`font-label-sm text-label-sm uppercase px-2.5 py-1 rounded font-medium ${
                    featured.importance === 'high'
                      ? 'bg-secondary-container text-on-secondary-container'
                      : featured.importance === 'low'
                      ? 'bg-surface-container text-on-surface-variant'
                      : 'bg-primary/10 text-primary'
                  }`}>
                    {featured.importance.toUpperCase()} PRIORITY
                  </span>
                  <span className="font-label-sm text-label-sm uppercase bg-surface-container px-2 py-0.5 rounded text-tertiary">
                    {featured.category}
                  </span>
                  <span className="text-outline-variant font-label-sm text-label-sm">·</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant truncate max-w-xs">
                    {featured.source}
                  </span>
                  <span className="text-outline-variant font-label-sm text-label-sm">·</span>
                  <span className="font-label-sm text-label-sm text-tertiary">
                    {featured.time}
                  </span>
                  {featured.status === 'pending' && (
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container text-on-surface-variant flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
                      Summary Pending
                    </span>
                  )}
                  {featured.status === 'failed' && (
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-error-container/40 text-error border border-error/30 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">error</span>
                      Summary Failed
                    </span>
                  )}
                  {featured.status === 'fallback' && (
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-tertiary/15 text-tertiary border border-tertiary/30">
                      Deterministic Fallback
                    </span>
                  )}
                  {featured.status === 'available' && (
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-primary/10 text-primary">
                      Gemini Verified ✓
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-2.5">
                  <h2 className="font-headline-md text-headline-md text-on-surface leading-tight font-medium">
                    {featured.title}
                  </h2>
                  <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                    {featured.summary || (featured.status === 'pending' ? 'Analyzing visual and DOM telemetry with Gemini model...' : 'No narrative summary available.')}
                  </p>
                </div>

                {/* EVIDENCE GROUNDING */}
                {featured.evidence && featured.evidence.length > 0 && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-sandstone/60">
                    <span className="font-label-sm text-label-sm uppercase text-tertiary tracking-wider font-semibold">
                      Supporting Evidence
                    </span>
                    <div className="space-y-1.5">
                      {featured.evidence.map((ev, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-body-sm text-on-surface bg-surface-container-low px-3 py-2 rounded border border-sandstone/40">
                          <span className="material-symbols-outlined text-[16px] text-primary mt-0.5 shrink-0">
                            verified
                          </span>
                          <div className="flex flex-col">
                            <span>{ev.description || (typeof ev === 'string' ? ev : JSON.stringify(ev))}</span>
                            {ev.source && (
                              <span className="text-[11px] text-tertiary font-telemetry-data mt-0.5">
                                Source: {ev.source}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex items-center gap-4">
                  <Link
                    to={`/compare/${featured.compareId}`}
                    className="inline-flex items-center gap-2 font-body-sm text-body-sm text-primary hover:text-primary-container font-medium transition-colors"
                  >
                    <span>Inspect in Visual Compare</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </Link>

                  {(featured.status === 'fallback' || featured.status === 'failed') && (
                    <button
                      onClick={() => handleRetry(featured.changeId)}
                      disabled={retryingId === featured.changeId}
                      className="inline-flex items-center gap-1.5 font-body-sm text-body-sm text-tertiary hover:text-on-surface transition-colors disabled:opacity-50"
                      type="button"
                    >
                      <span className={`material-symbols-outlined text-[15px] ${retryingId === featured.changeId ? 'animate-spin' : ''}`}>
                        sync
                      </span>
                      <span>{retryingId === featured.changeId ? 'Retrying...' : 'Retry Gemini Analysis'}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="lg:col-span-4 bg-surface-container-low p-5 rounded-lg border border-sandstone flex flex-col gap-3">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-tertiary font-semibold">
                  Change Telemetry
                </span>
                <div className="space-y-2 text-body-sm">
                  <div className="flex justify-between py-1 border-b border-sandstone/50">
                    <span className="text-on-surface-variant">Change ID</span>
                    <span className="font-telemetry-data text-on-surface text-[12px] truncate max-w-[130px]">
                      {featured.changeId || '#849'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-sandstone/50">
                    <span className="text-on-surface-variant">Category</span>
                    <span className="text-on-surface font-medium capitalize">{featured.category}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-sandstone/50">
                    <span className="text-on-surface-variant">Importance</span>
                    <span className="text-on-surface font-medium capitalize">{featured.importance}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-on-surface-variant">AI Pipeline</span>
                    <span className="text-on-surface font-medium">
                      {featured.status === 'fallback' ? 'Deterministic Engine' : 'Gemini 2.5 Flash'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        )}

        {/* SECONDARY INTELLIGENCE DISPATCHES */}
        {!isLoading && secondaryDispatches.length > 0 && (
          <>
            <div className="pt-6 pb-2 flex items-center justify-between">
              <h3 className="font-label-sm text-label-sm uppercase tracking-wider text-tertiary font-semibold">
                INTELLIGENCE DISPATCHES ARCHIVE
              </h3>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Showing {filteredDispatches.length} dispatch{filteredDispatches.length === 1 ? '' : 'es'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDispatches.map((item) => (
                <article
                  key={item.id}
                  className="bg-surface-container-lowest rounded-lg border border-sandstone p-6 flex flex-col justify-between gap-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between font-label-sm text-label-sm">
                      <span className="text-on-surface font-medium truncate max-w-[180px]">{item.source}</span>
                      <span className="text-tertiary shrink-0">{item.time}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-label-sm uppercase px-2 py-0.5 rounded font-medium ${
                        item.importance === 'high'
                          ? 'bg-secondary-container text-on-secondary-container'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}>
                        {item.importance}
                      </span>
                      <span className="text-[10px] font-label-sm uppercase tracking-wide text-tertiary bg-surface-container px-2 py-0.5 rounded">
                        {item.category}
                      </span>
                      {item.status === 'fallback' && (
                        <span className="text-[10px] text-tertiary bg-tertiary/10 px-1.5 py-0.5 rounded">
                          Fallback
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <h4 className="font-headline-sm text-headline-sm text-on-surface leading-snug">
                        {item.title}
                      </h4>
                    </div>

                    <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed line-clamp-3">
                      {item.summary}
                    </p>

                    {/* Evidence display */}
                    {item.evidence && item.evidence.length > 0 && (
                      <div className="pt-2 border-t border-sandstone/60">
                        <span className="font-label-sm text-[11px] uppercase text-tertiary tracking-wider font-semibold block mb-1">
                          Evidence
                        </span>
                        <div className="text-body-sm text-on-surface-variant text-[12px] bg-surface-container-low p-2 rounded border border-sandstone/40 line-clamp-2">
                          {item.evidence[0]?.description || String(item.evidence[0])}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-sandstone flex items-center justify-between">
                    <Link
                      to={`/compare/${item.compareId}`}
                      className="inline-flex items-center gap-1.5 font-label-md text-label-md text-primary hover:text-primary-container font-semibold transition-colors"
                    >
                      <span>Visual Compare</span>
                      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </Link>

                    {(item.status === 'fallback' || item.status === 'failed') && (
                      <button
                        onClick={() => handleRetry(item.changeId)}
                        disabled={retryingId === item.changeId}
                        className="text-tertiary hover:text-on-surface font-label-sm text-[12px] flex items-center gap-1 disabled:opacity-50"
                        type="button"
                      >
                        <span className={`material-symbols-outlined text-[14px] ${retryingId === item.changeId ? 'animate-spin' : ''}`}>
                          sync
                        </span>
                        <span>{retryingId === item.changeId ? 'Retrying' : 'Retry'}</span>
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
