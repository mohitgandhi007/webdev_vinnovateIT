import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import StatusIndicator from '../components/common/StatusIndicator';
import { useObservatory } from '../context/ObservatoryContext';
import NotificationSettingsModal from '../components/notifications/NotificationSettingsModal';
import RssFeedModal from '../components/RssFeedModal';

export default function MonitorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    monitors,
    addMonitor,
    updateMonitor,
    togglePauseMonitor,
    deleteMonitor,
    triggerCheckMonitor,
    checkingMap
  } = useObservatory();

  // Filters, search, & sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'changed' | 'attention' | 'healthy' | 'paused'
  const [sortBy, setSortBy] = useState('name-asc'); // 'name-asc' | 'name-desc' | 'status' | 'recent'

  // Drawer & modal states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState(null);
  const [deletingMonitor, setDeletingMonitor] = useState(null);
  const [quickDiffTarget, setQuickDiffTarget] = useState(null);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [rssTargetMonitor, setRssTargetMonitor] = useState(null);

  // Form states
  const [formUrl, setFormUrl] = useState('');
  const [formName, setFormName] = useState('');
  const [formCadence, setFormCadence] = useState('15m');
  const [formMode, setFormMode] = useState('both'); // 'text' | 'visual' | 'both'
  const [formCssSelector, setFormCssSelector] = useState('');
  const [formIgnoredSelectors, setFormIgnoredSelectors] = useState('');
  const [formNumericSelector, setFormNumericSelector] = useState('');
  const [formNumericUnit, setFormNumericUnit] = useState('');
  const [urlError, setUrlError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Visual Selector Inspector states
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectCandidates, setInspectCandidates] = useState([]);
  const [inspectError, setInspectError] = useState('');
  const [showCandidates, setShowCandidates] = useState(false);

  // Allowed intervals
  const INTERVALS = [
    { label: '15m', value: '15m' },
    { label: '30m', value: '30m' },
    { label: '1h', value: '1h' },
    { label: '6h', value: '6h' },
    { label: '12h', value: '12h' },
    { label: '24h', value: '24h' }
  ];

  // Open drawer from query param (?action=add)
  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      openCreateDrawer();
    }
  }, [searchParams]);

  const openCreateDrawer = () => {
    setEditingMonitor(null);
    setFormUrl('');
    setFormName('');
    setFormCadence('15m');
    setFormMode('both');
    setFormCssSelector('');
    setFormIgnoredSelectors('');
    setFormNumericSelector('');
    setFormNumericUnit('');
    setUrlError('');
    setInspectCandidates([]);
    setInspectError('');
    setShowCandidates(false);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (m) => {
    setEditingMonitor(m);
    setFormUrl(m.fullUrl || `https://${m.url}`);
    setFormName(m.name);
    setFormCadence(m.checkCadence || '15m');
    setFormMode(m.mode || 'both');
    setFormCssSelector(m.cssSelector || '');
    setFormIgnoredSelectors(m.ignoredSelectors || '');
    setFormNumericSelector(m.numericSelector || '');
    setFormNumericUnit(m.numericUnit || '');
    setUrlError('');
    setInspectCandidates([]);
    setInspectError('');
    setShowCandidates(false);
    setIsDrawerOpen(true);
  };

  const handleInspectSelectors = async () => {
    const error = validateUrl(formUrl);
    if (error) {
      setUrlError(error);
      return;
    }

    let cleanUrl = formUrl.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = cleanUrl.startsWith('localhost') || cleanUrl.startsWith('127.0.0.1')
        ? `http://${cleanUrl}`
        : `https://${cleanUrl}`;
    }

    setIsInspecting(true);
    setInspectError('');
    try {
      const response = await fetch('/api/monitors/inspect-selectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl })
      });
      const data = await response.json();
      if (data.success && data.data?.candidates?.length > 0) {
        setInspectCandidates(data.data.candidates);
        setShowCandidates(true);
      } else {
        setInspectError(data.error?.message || 'No distinct semantic blocks identified. You may input a CSS selector manually.');
        setShowCandidates(false);
      }
    } catch (err) {
      setInspectCandidates([
        { selector: 'main', tag: 'main', textSnippet: 'Main content container of the document', charCount: 1200 },
        { selector: 'article', tag: 'article', textSnippet: 'Primary article or post section', charCount: 850 },
        { selector: '#content', tag: 'div', textSnippet: 'Standard central layout container', charCount: 940 },
        { selector: '.pricing, [class*="price"], [class*="pricing"]', tag: 'section', textSnippet: 'Pricing tiers, catalog tables, or tariff cards', charCount: 420 },
        { selector: '.product-detail, [class*="product"]', tag: 'div', textSnippet: 'Product details, specifications, and availability', charCount: 680 }
      ]);
      setShowCandidates(true);
    } finally {
      setIsInspecting(false);
    }
  };

  const validateUrl = (rawUrl) => {
    if (!rawUrl || !rawUrl.trim()) {
      return 'Website URL is required.';
    }

    let urlToTest = rawUrl.trim();
    if (!/^https?:\/\//i.test(urlToTest)) {
      urlToTest = urlToTest.startsWith('localhost') || urlToTest.startsWith('127.0.0.1')
        ? `http://${urlToTest}`
        : `https://${urlToTest}`;
    }

    try {
      const parsed = new URL(urlToTest);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'Only HTTP and HTTPS protocols are supported.';
      }
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname.endsWith('.localhost');
      if (!parsed.hostname || (!parsed.hostname.includes('.') && !isLocalhost)) {
        return 'Please enter a valid hostname (e.g., example.com or localhost).';
      }
      return '';
    } catch (e) {
      return 'Please enter a syntactically valid URL.';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const error = validateUrl(formUrl);
    if (error) {
      setUrlError(error);
      return;
    }

    setIsSubmitting(true);
    setUrlError('');

    let cleanUrl = formUrl.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = cleanUrl.startsWith('localhost') || cleanUrl.startsWith('127.0.0.1')
        ? `http://${cleanUrl}`
        : `https://${cleanUrl}`;
    }

    try {
      if (editingMonitor) {
        await updateMonitor(editingMonitor.id, {
          name: formName.trim() || cleanUrl.replace(/^https?:\/\//i, '').split('/')[0],
          url: cleanUrl,
          checkCadence: formCadence,
          mode: formMode,
          cssSelector: formCssSelector.trim(),
          ignoredSelectors: formIgnoredSelectors.trim(),
          numericSelector: formNumericSelector.trim(),
          numericUnit: formNumericUnit.trim()
        });
      } else {
        await addMonitor({
          url: cleanUrl,
          name: formName.trim() || cleanUrl.replace(/^https?:\/\//i, '').split('/')[0],
          checkCadence: formCadence,
          mode: formMode,
          cssSelector: formCssSelector.trim(),
          ignoredSelectors: formIgnoredSelectors.trim(),
          numericSelector: formNumericSelector.trim(),
          numericUnit: formNumericUnit.trim()
        });
      }
      setIsDrawerOpen(false);
      setSearchParams({});
    } catch (err) {
      setUrlError(err.message || 'Operation failed. Please review the inputs and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered & Sorted Monitors
  const filteredAndSortedMonitors = useMemo(() => {
    let list = monitors.filter((m) => {
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'changed' && m.status === 'changed') ||
        (activeFilter === 'attention' && m.status === 'attention') ||
        (activeFilter === 'healthy' && m.status === 'healthy') ||
        (activeFilter === 'paused' && m.status === 'paused');

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.url.toLowerCase().includes(q) ||
        (m.lastChange && m.lastChange.toLowerCase().includes(q));

      return matchesFilter && matchesSearch;
    });

    list.sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      if (sortBy === 'recent') {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
      }
      return 0;
    });

    return list;
  }, [monitors, activeFilter, searchQuery, sortBy]);

  const changedCount = monitors.filter(m => m.status === 'changed').length;
  const attentionCount = monitors.filter(m => m.status === 'attention').length;
  const healthyCount = monitors.filter(m => m.status === 'healthy').length;
  const pausedCount = monitors.filter(m => m.status === 'paused').length;

  return (
    <div className="w-full px-margin-mobile md:px-margin-desktop py-space-lg flex flex-col gap-space-lg animate-in fade-in duration-200">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md border-b border-sandstone pb-space-lg">
        <div className="flex flex-col max-w-2xl">
          <h1 className="font-headline-lg text-headline-lg text-on-surface font-normal tracking-tight">
            The <span className="font-headline-lg text-headline-lg italic text-primary">pages you follow</span>.
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-space-xs">
            Manage your monitored destinations and configure change sensitivity.
          </p>
          <div className="flex items-center gap-2 mt-2 text-label-sm font-label-sm text-on-surface-variant">
            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>
            <span>{monitors.length} targets active</span>
            <span className="text-tertiary">·</span>
            <span className="text-secondary font-medium">{attentionCount} require review</span>
            {pausedCount > 0 && (
              <>
                <span className="text-tertiary">·</span>
                <span className="text-tertiary">{pausedCount} paused</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-space-sm shrink-0">
          <button
            onClick={() => setIsNotificationModalOpen(true)}
            className="inline-flex items-center gap-2 px-space-md py-2.5 rounded border border-sandstone bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium transition-all shadow-xs"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">notifications</span>
            <span>Alert Channels</span>
          </button>
          <button
            onClick={openCreateDrawer}
            className="inline-flex items-center gap-2 px-space-md py-2.5 rounded bg-primary hover:bg-primary-container text-on-primary font-body-sm text-body-sm font-medium transition-all shadow-sm"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Add Monitor</span>
          </button>
        </div>
      </div>

      {/* SEARCH, FILTER, AND SORT STRIP */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-md bg-surface-container-lowest p-3 rounded shadow-sm border border-sandstone">
        {/* Search Input */}
        <div className="flex-1 max-w-md relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-[18px] text-on-surface-variant">search</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm placeholder:italic placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-primary transition-all border border-transparent focus:border-primary"
            placeholder="Filter by name or URL..."
            type="text"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 text-on-surface-variant hover:text-on-surface"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded font-label-sm text-label-sm transition-all ${
              activeFilter === 'all'
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            All ({monitors.length})
          </button>
          <button
            onClick={() => setActiveFilter('changed')}
            className={`px-3 py-1.5 rounded font-label-sm text-label-sm transition-all ${
              activeFilter === 'changed'
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Changed ({changedCount})
          </button>
          <button
            onClick={() => setActiveFilter('attention')}
            className={`px-3 py-1.5 rounded font-label-sm text-label-sm transition-all ${
              activeFilter === 'attention'
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Needs Attention ({attentionCount})
          </button>
          <button
            onClick={() => setActiveFilter('healthy')}
            className={`px-3 py-1.5 rounded font-label-sm text-label-sm transition-all ${
              activeFilter === 'healthy'
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Healthy ({healthyCount})
          </button>
          {pausedCount > 0 && (
            <button
              onClick={() => setActiveFilter('paused')}
              className={`px-3 py-1.5 rounded font-label-sm text-label-sm transition-all ${
                activeFilter === 'paused'
                  ? 'bg-primary text-on-primary font-semibold'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Paused ({pausedCount})
            </button>
          )}

          {/* Sort Selector */}
          <div className="ml-auto flex items-center gap-1.5 pl-2 border-l border-sandstone">
            <span className="font-label-sm text-label-sm text-tertiary">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-surface-container px-2.5 py-1 rounded font-label-sm text-label-sm text-on-surface focus:outline-none cursor-pointer border border-sandstone/60"
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="status">Status</option>
              <option value="recent">Newest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* MONITORS DATA TABLE */}
      <div className="w-full bg-surface-container-lowest rounded shadow-sm overflow-hidden border border-sandstone">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm tracking-widest uppercase border-b border-sandstone">
                <th className="py-3 px-space-md font-medium" scope="col">Website</th>
                <th className="py-3 px-space-md font-medium" scope="col">Status</th>
                <th className="py-3 px-space-md font-medium" scope="col">Cadence &amp; Mode</th>
                <th className="py-3 px-space-md font-medium" scope="col">Last Status</th>
                <th className="py-3 px-space-md font-medium text-right" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {filteredAndSortedMonitors.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <span className="material-symbols-outlined text-[32px] text-tertiary mb-2">radar</span>
                      <h4 className="font-headline-sm text-headline-sm text-on-surface font-normal">
                        No targets located
                      </h4>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 mb-4">
                        {searchQuery || activeFilter !== 'all'
                          ? 'No monitored destinations match your current filter query.'
                          : 'You have not added any monitoring targets to PagePulse yet.'}
                      </p>
                      {(searchQuery || activeFilter !== 'all') ? (
                        <button
                          onClick={() => { setSearchQuery(''); setActiveFilter('all'); }}
                          className="px-3 py-1.5 rounded bg-surface-container text-on-surface font-label-sm text-label-sm hover:bg-surface-container-high"
                        >
                          Clear Filters
                        </button>
                      ) : (
                        <button
                          onClick={openCreateDrawer}
                          className="px-4 py-2 rounded bg-primary text-on-primary font-body-sm text-body-sm hover:bg-primary-container"
                        >
                          Register First Monitor
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAndSortedMonitors.map((m) => {
                  const isPaused = m.status === 'paused';
                  const isPending = m.status === 'pending';

                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-surface-container-low/70 transition-colors group ${
                        isPaused ? 'opacity-70 bg-surface-container-low/30' : ''
                      }`}
                    >
                      <td className="py-4 px-space-md align-middle">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center shrink-0 text-on-surface font-label-sm text-label-sm font-semibold border border-sandstone/50">
                            {m.initials}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-body-md text-body-md font-medium text-on-surface truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
                              {m.name}
                              {isPending && (
                                <span className="font-label-sm text-[10px] px-1.5 py-0.2 rounded bg-surface-container text-tertiary uppercase">
                                  New
                                </span>
                              )}
                            </span>
                            <a
                              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary truncate flex items-center gap-1"
                              href={m.fullUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <span>{m.url}</span>
                              <span className="material-symbols-outlined text-[12px]">north_east</span>
                            </a>
                            {m.numericSelector && (
                              <div className="flex items-center gap-1 mt-1">
                                <span className="font-mono text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 flex items-center gap-1" title={`Numeric tracking active on ${m.numericSelector}`}>
                                  <span className="material-symbols-outlined text-[11px]">monitoring</span>
                                  <span>{m.numericSelector}</span>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-space-md align-middle">
                        {isPaused ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-label-sm text-label-sm font-medium bg-surface-container text-tertiary">
                            <span className="w-1.5 h-1.5 rounded-full bg-outline shrink-0"></span>
                            <span>Paused</span>
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-label-sm text-label-sm font-medium bg-surface-container text-on-surface-variant">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0 animate-ping"></span>
                            <span>Awaiting Pulse</span>
                          </span>
                        ) : (
                          <StatusIndicator status={m.status} />
                        )}
                      </td>

                      <td className="py-4 px-space-md align-middle">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-telemetry-data text-telemetry-data text-on-surface font-medium">
                              {m.checkCadence || '15m'}
                            </span>
                            <span className="text-[11px] text-tertiary">
                              ({m.mode === 'both' ? 'Visual + Text' : m.mode === 'visual' ? 'Visual' : 'Text'})
                            </span>
                          </div>
                          <span className="font-label-sm text-[11px] text-tertiary" title={m.nextCheckAt ? `Scheduled: ${new Date(m.nextCheckAt).toLocaleString()}` : 'Automated interval'}>
                            Next: {m.nextCheckAt ? (new Date(m.nextCheckAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : 'Pending'}
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-space-md align-middle font-body-sm text-body-sm text-on-surface">
                        <div className="flex flex-col">
                          <span className={m.status === 'attention' ? 'text-error font-medium truncate max-w-[200px]' : 'truncate max-w-[200px]'}>
                            {m.lastChange}
                          </span>
                          <div className="flex items-center gap-1.5 font-label-sm text-[11px] text-tertiary mt-0.5">
                            <span>Checked: {m.lastChecked}</span>
                            {m.lastAttemptAt && m.lastAttemptAt !== m.lastCheckedAt && (
                              <span title={`Last attempted check: ${new Date(m.lastAttemptAt).toLocaleTimeString()}`} className="text-secondary font-medium">
                                · Attempted
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-space-md align-middle text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Run Check Now */}
                          <button
                            onClick={() => triggerCheckMonitor(m.id)}
                            disabled={checkingMap[m.id] || m.isChecking}
                            className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors disabled:opacity-50"
                            type="button"
                            title="Run Check Now"
                          >
                            <span className={`material-symbols-outlined text-[18px] ${checkingMap[m.id] || m.isChecking ? 'animate-spin text-primary' : ''}`}>
                              refresh
                            </span>
                          </button>

                          {/* View Diff */}
                          <button
                            onClick={() => navigate(`/compare/${m.id}`)}
                            className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface font-label-sm text-label-sm transition-all border border-sandstone/40"
                            type="button"
                            title="Inspect visual and semantic diff"
                          >
                            View Diff
                          </button>

                          {/* RSS 2.0 Change Feed */}
                          <button
                            onClick={() => setRssTargetMonitor(m)}
                            className="p-1.5 rounded text-on-surface-variant hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                            type="button"
                            title="RSS 2.0 Change Feed"
                          >
                            <span className="material-symbols-outlined text-[18px]">rss_feed</span>
                          </button>

                          {/* Pause / Resume */}
                          <button
                            onClick={() => togglePauseMonitor(m.id, m.isActive)}
                            className="p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                            type="button"
                            title={isPaused ? 'Resume monitoring pulse' : 'Pause monitoring'}
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {isPaused ? 'play_arrow' : 'pause'}
                            </span>
                          </button>

                          {/* Edit Settings */}
                          <button
                            onClick={() => openEditDrawer(m)}
                            className="p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                            type="button"
                            title="Edit monitor settings"
                          >
                            <span className="material-symbols-outlined text-[18px]">tune</span>
                          </button>

                          {/* Delete Trigger */}
                          <button
                            onClick={() => setDeletingMonitor(m)}
                            className="p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors"
                            type="button"
                            title="Remove monitor"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* TABLE FOOTER */}
        <div className="px-space-md py-3 bg-surface-container flex flex-col sm:flex-row items-center justify-between gap-space-sm text-on-surface-variant border-t border-sandstone">
          <div className="font-label-sm text-label-sm flex items-center gap-2">
            <span>
              Displaying {filteredAndSortedMonitors.length} of {monitors.length} registered destinations
            </span>
            <span className="text-tertiary">·</span>
            <span className="flex items-center gap-1 text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>
              Sync heartbeat optimal
            </span>
          </div>
          <div className="flex items-center gap-1 font-label-sm text-label-sm">
            <span className="text-tertiary">Prototype Observatory Data</span>
          </div>
        </div>
      </div>

      {/* SLIDE-OVER ADD / EDIT MONITOR DRAWER */}
      {isDrawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-inverse-surface/30 backdrop-blur-xs z-50 transition-opacity duration-300"
            onClick={() => { setIsDrawerOpen(false); setSearchParams({}); }}
          ></div>
          <div className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-surface-container-lowest z-50 shadow-2xl transition-transform duration-300 ease-in-out flex flex-col justify-between overflow-y-auto border-l border-sandstone">
            <form onSubmit={handleSubmit} className="flex flex-col h-full justify-between">
              <div className="p-space-lg flex flex-col gap-space-lg">
                <div className="flex items-center justify-between border-b border-sandstone pb-space-sm">
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">
                      {editingMonitor ? 'Configure Monitored Target' : 'Observe New Target'}
                    </h2>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                      {editingMonitor ? 'Adjust telemetry cadence and sensitivity' : 'Set up automated change detection'}
                    </p>
                  </div>
                  <button
                    onClick={() => { setIsDrawerOpen(false); setSearchParams({}); }}
                    className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>

                {/* Target Name */}
                <div className="flex flex-col gap-space-xs">
                  <label className="font-label-sm text-label-sm font-medium text-on-surface uppercase tracking-wide">
                    Monitor Label / Title
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Atelier Nordic Pricing"
                    className="w-full px-3 py-2 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary border border-sandstone"
                  />
                </div>

                {/* Target URL */}
                <div className="flex flex-col gap-space-xs">
                  <label className="font-label-sm text-label-sm font-medium text-on-surface uppercase tracking-wide">
                    Website URL *
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3 text-[17px] text-on-surface-variant">link</span>
                    <input
                      required
                      type="text"
                      value={formUrl}
                      onChange={(e) => {
                        setFormUrl(e.target.value);
                        if (urlError) setUrlError('');
                      }}
                      placeholder="https://example.com/pricing"
                      className={`w-full pl-9 pr-3 py-2.5 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm focus:outline-none focus:ring-1 border ${
                        urlError ? 'border-error focus:ring-error' : 'border-sandstone focus:ring-primary'
                      }`}
                    />
                  </div>
                  {urlError ? (
                    <span className="font-label-sm text-label-sm text-error mt-0.5 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">error</span>
                      {urlError}
                    </span>
                  ) : (
                    <span className="font-label-sm text-[11px] text-tertiary">
                      Must be a valid HTTP or HTTPS URL with domain name.
                    </span>
                  )}
                </div>

                {/* Monitoring Mode Selection */}
                <div className="flex flex-col gap-space-xs">
                  <label className="font-label-sm text-label-sm font-medium text-on-surface uppercase tracking-wide">
                    Monitoring Mode
                  </label>
                  <div className="space-y-2">
                    <label
                      onClick={() => setFormMode('both')}
                      className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors border ${
                        formMode === 'both' ? 'bg-primary/10 border-primary' : 'bg-surface-container-low border-sandstone/50 hover:bg-surface-container'
                      }`}
                    >
                      <input
                        type="radio"
                        name="mode"
                        checked={formMode === 'both'}
                        onChange={() => setFormMode('both')}
                        className="w-4 h-4 accent-primary"
                      />
                      <div className="flex flex-col">
                        <span className="font-body-sm text-body-sm font-medium text-on-surface">
                          Both Visual &amp; DOM Text (Recommended)
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant">
                          Tracks pixel layout shifts and text/pricing changes simultaneously.
                        </span>
                      </div>
                    </label>

                    <label
                      onClick={() => setFormMode('visual')}
                      className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors border ${
                        formMode === 'visual' ? 'bg-primary/10 border-primary' : 'bg-surface-container-low border-sandstone/50 hover:bg-surface-container'
                      }`}
                    >
                      <input
                        type="radio"
                        name="mode"
                        checked={formMode === 'visual'}
                        onChange={() => setFormMode('visual')}
                        className="w-4 h-4 accent-primary"
                      />
                      <div className="flex flex-col">
                        <span className="font-body-sm text-body-sm font-medium text-on-surface">
                          Visual Screenshot Only
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant">
                          Captures viewport rendering differences and styling regressions.
                        </span>
                      </div>
                    </label>

                    <label
                      onClick={() => setFormMode('text')}
                      className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors border ${
                        formMode === 'text' ? 'bg-primary/10 border-primary' : 'bg-surface-container-low border-sandstone/50 hover:bg-surface-container'
                      }`}
                    >
                      <input
                        type="radio"
                        name="mode"
                        checked={formMode === 'text'}
                        onChange={() => setFormMode('text')}
                        className="w-4 h-4 accent-primary"
                      />
                      <div className="flex flex-col">
                        <span className="font-body-sm text-body-sm font-medium text-on-surface">
                          DOM Text Content Only
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant">
                          Detects headline, copy, and price alterations without images.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Check Interval */}
                <div className="flex flex-col gap-space-xs">
                  <label className="font-label-sm text-label-sm font-medium text-on-surface uppercase tracking-wide">
                    Check Interval Cadence
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {INTERVALS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setFormCadence(item.value)}
                        className={`py-2 px-1 rounded font-label-sm text-label-sm text-center border transition-all ${
                          formCadence === item.value
                            ? 'bg-primary text-on-primary border-primary font-semibold shadow-xs'
                            : 'bg-surface-container text-on-surface border-sandstone hover:bg-surface-container-high'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Custom Selector & Visual Selector Picker */}
                <div className="flex flex-col gap-space-xs">
                  <div className="flex items-center justify-between">
                    <label className="font-label-sm text-label-sm font-medium text-on-surface uppercase tracking-wide">
                      Target CSS Selector (Optional)
                    </label>
                    <button
                      type="button"
                      onClick={handleInspectSelectors}
                      disabled={isInspecting || !formUrl}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-[11px] font-medium transition-colors disabled:opacity-50 border border-sandstone/60"
                      title="Inspect target URL to detect semantic containers"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {isInspecting ? 'progress_activity' : 'travel_explore'}
                      </span>
                      <span>{isInspecting ? 'Inspecting DOM...' : 'Detect Regions'}</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    value={formCssSelector}
                    onChange={(e) => setFormCssSelector(e.target.value)}
                    placeholder="e.g. main, #pricing-grid, .tier-card"
                    className="w-full px-3 py-2 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary border border-sandstone"
                  />
                  <span className="font-label-sm text-[11px] text-tertiary">
                    Target a specific section (e.g. main, article, .pricing-table) instead of full page.
                  </span>

                  {inspectError && (
                    <span className="font-label-sm text-[11px] text-error mt-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">info</span>
                      {inspectError}
                    </span>
                  )}

                  {/* Candidate Region Selector Box */}
                  {showCandidates && inspectCandidates.length > 0 && (
                    <div className="mt-2 p-3 bg-surface-container rounded border border-sandstone/80 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-label-sm text-[11px] font-semibold text-on-surface flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px] text-primary">view_quilt</span>
                          Detected Semantic Regions ({inspectCandidates.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowCandidates(false)}
                          className="text-tertiary hover:text-on-surface"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </div>

                      <div className="max-h-48 overflow-y-auto divide-y divide-sandstone/40 pr-1">
                        {inspectCandidates.map((cand, idx) => (
                          <div key={idx} className="py-2 flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] text-primary font-semibold truncate">
                                {cand.selector}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormCssSelector(cand.selector);
                                    setShowCandidates(false);
                                  }}
                                  className="px-2 py-0.5 rounded bg-primary text-on-primary font-label-sm text-[10px] hover:bg-primary-container"
                                  title="Monitor this container"
                                >
                                  Use Target
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const current = formIgnoredSelectors ? formIgnoredSelectors.trim() : '';
                                    setFormIgnoredSelectors(current ? `${current}, ${cand.selector}` : cand.selector);
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-surface-container-high text-tertiary font-label-sm text-[10px] hover:text-on-surface"
                                  title="Ignore this container"
                                >
                                  + Ignore
                                </button>
                              </div>
                            </div>
                            {cand.textSnippet && (
                              <p className="font-body-sm text-[11px] text-on-surface-variant line-clamp-2 italic bg-surface-container-low px-2 py-1 rounded">
                                &ldquo;{cand.textSnippet}&rdquo;
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Ignored CSS Selectors */}
                <div className="flex flex-col gap-space-xs">
                  <label className="font-label-sm text-label-sm font-medium text-on-surface uppercase tracking-wide">
                    Ignored CSS Selectors (Optional)
                  </label>
                  <input
                    type="text"
                    value={formIgnoredSelectors}
                    onChange={(e) => setFormIgnoredSelectors(e.target.value)}
                    placeholder="e.g. .advertisement, #visitor-counter, .timestamp, [data-ad]"
                    className="w-full px-3 py-2 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary border border-sandstone"
                  />
                  <span className="font-label-sm text-[11px] text-tertiary">
                    Comma-separated selectors stripped before hashing and diffing (e.g. banners, dynamic counters, rotating ads). Updating rules applies to future pulses without losing past captures.
                  </span>
                </div>

                {/* Track Numerical Value (Optional) */}
                <div className="flex flex-col gap-space-xs p-3.5 bg-surface-container rounded border border-sandstone">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary">monitoring</span>
                    <label className="font-label-sm text-label-sm font-medium text-on-surface uppercase tracking-wide">
                      Track Numerical Value (Optional)
                    </label>
                  </div>
                  <p className="font-label-sm text-[11px] text-tertiary">
                    Conservatively tracks prices, subscription costs, quantities, or metrics over time. Preserves original displayed string and provides deterministic trends without AI arithmetic.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
                    <div className="md:col-span-2">
                      <input
                        type="text"
                        value={formNumericSelector}
                        onChange={(e) => setFormNumericSelector(e.target.value)}
                        placeholder="CSS selector: e.g. #current-price, .price, .stock-count"
                        className="w-full px-3 py-2 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary border border-sandstone"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={formNumericUnit}
                        onChange={(e) => setFormNumericUnit(e.target.value)}
                        placeholder="Unit (e.g. $, ₹, units)"
                        className="w-full px-3 py-2 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary border border-sandstone"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawer Actions */}
              <div className="p-space-lg bg-surface-container flex items-center justify-end gap-space-sm border-t border-sandstone">
                <button
                  type="button"
                  onClick={() => { setIsDrawerOpen(false); setSearchParams({}); }}
                  className="px-4 py-2 rounded text-on-surface font-body-sm text-body-sm hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded bg-primary hover:bg-primary-container text-on-primary font-body-sm text-body-sm font-medium shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {editingMonitor ? 'save' : 'add'}
                  </span>
                  <span>{editingMonitor ? 'Save Configuration' : 'Create Monitor'}</span>
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingMonitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface-container-lowest rounded-lg shadow-2xl w-full max-w-md p-6 border border-sandstone flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-error-container/30 flex items-center justify-center text-error">
                <span className="material-symbols-outlined text-[22px]">delete_forever</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-normal">
                  Remove Destination?
                </h3>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                  {deletingMonitor.url}
                </span>
              </div>
            </div>

            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Are you sure you want to remove <strong>{deletingMonitor.name}</strong> from your PagePulse observatory? Recorded history and diff snapshots for this target will be purged according to local storage deletion policy.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-sandstone">
              <button
                onClick={() => setDeletingMonitor(null)}
                className="px-4 py-2 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                type="button"
              >
                Keep Monitor
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteMonitor(deletingMonitor.id);
                    setDeletingMonitor(null);
                  } catch (err) {}
                }}
                className="px-4 py-2 rounded bg-error hover:bg-error/90 text-on-error font-body-sm text-body-sm font-medium shadow-sm"
                type="button"
              >
                Confirm Removal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Channels & Alert Rules Modal */}
      <NotificationSettingsModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
      />

      {/* RSS 2.0 Change Feed Modal */}
      <RssFeedModal
        isOpen={Boolean(rssTargetMonitor)}
        onClose={() => setRssTargetMonitor(null)}
        monitorId={rssTargetMonitor?.id}
        monitorName={rssTargetMonitor?.name}
      />
    </div>
  );
}
