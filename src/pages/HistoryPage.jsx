import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import StatusIndicator from '../components/common/StatusIndicator';
import { useObservatory } from '../context/ObservatoryContext';

export default function HistoryPage() {
  const { history, monitors, toggleChangeReview } = useObservatory();

  // Filters
  const [selectedMonitor, setSelectedMonitor] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all'); // 'all' | 'unreviewed' | 'reviewed'
  const [dateRange, setDateRange] = useState('all'); // 'all' | '24h' | '7d' | '30d'
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Filtered & Chronologically Sorted History
  const filteredHistory = useMemo(() => {
    let list = history.filter((item) => {
      // Monitor filter
      if (selectedMonitor !== 'all') {
        const matchesMonitor = item.monitorId === selectedMonitor || item.compareId === selectedMonitor || item.target?.toLowerCase() === selectedMonitor.toLowerCase();
        if (!matchesMonitor) return false;
      }

      // Review status filter
      if (reviewFilter === 'unreviewed' && item.isReviewed) return false;
      if (reviewFilter === 'reviewed' && !item.isReviewed) return false;

      // Date range filter
      if (dateRange !== 'all') {
        const itemDate = new Date(item.timestamp || item.createdAt || 0);
        const now = new Date();
        if (!isNaN(itemDate.getTime())) {
          const diffHours = (now - itemDate) / (1000 * 60 * 60);
          if (dateRange === '24h' && diffHours > 24) return false;
          if (dateRange === '7d' && diffHours > 24 * 7) return false;
          if (dateRange === '30d' && diffHours > 24 * 30) return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.details && item.details.toLowerCase().includes(q)) ||
          (item.target && item.target.toLowerCase().includes(q)) ||
          (item.url && item.url.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });

    // Chronological ordering (newest first)
    list.sort((a, b) => {
      const dateA = new Date(a.timestamp || a.createdAt || 0);
      const dateB = new Date(b.timestamp || b.createdAt || 0);
      return dateB - dateA;
    });

    return list;
  }, [history, selectedMonitor, reviewFilter, dateRange, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const unreviewedCount = history.filter(h => !h.isReviewed).length;
  const reviewedCount = history.filter(h => h.isReviewed).length;

  return (
    <div className="w-full px-margin-mobile md:px-margin-desktop py-space-lg flex flex-col gap-space-lg animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md border-b border-sandstone pb-space-lg">
        <div className="flex flex-col max-w-2xl">
          <div className="flex items-center gap-space-sm mb-1">
            <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
            <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider">
              HISTORICAL TELEMETRY LOGS
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface font-normal tracking-tight">
            Capture <span className="italic font-normal text-primary">Chronology</span>.
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-space-xs">
            A comprehensive, time-indexed archive of every recorded DOM and visual deviation.
          </p>
        </div>

        {/* Review Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => { setReviewFilter('all'); setCurrentPage(1); }}
            className={`px-3.5 py-1.5 rounded font-label-sm text-label-sm transition-all ${
              reviewFilter === 'all'
                ? 'bg-primary text-on-primary font-semibold shadow-xs'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            All Changes ({history.length})
          </button>
          <button
            onClick={() => { setReviewFilter('unreviewed'); setCurrentPage(1); }}
            className={`px-3.5 py-1.5 rounded font-label-sm text-label-sm transition-all ${
              reviewFilter === 'unreviewed'
                ? 'bg-primary text-on-primary font-semibold shadow-xs'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Unreviewed ({unreviewedCount})
          </button>
          <button
            onClick={() => { setReviewFilter('reviewed'); setCurrentPage(1); }}
            className={`px-3.5 py-1.5 rounded font-label-sm text-label-sm transition-all ${
              reviewFilter === 'reviewed'
                ? 'bg-primary text-on-primary font-semibold shadow-xs'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Reviewed ({reviewedCount})
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-sm bg-surface-container-lowest p-3 rounded shadow-sm border border-sandstone">
        {/* Search */}
        <div className="flex-1 max-w-sm relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-[18px] text-on-surface-variant">search</span>
          <input
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-4 py-2 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm placeholder:italic placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary"
            placeholder="Search changes or target..."
            type="text"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Monitor Filter */}
          <div className="flex items-center gap-1.5 bg-surface-container px-3 py-1.5 rounded border border-sandstone/60">
            <span className="font-label-sm text-label-sm text-tertiary">Monitor:</span>
            <select
              value={selectedMonitor}
              onChange={(e) => { setSelectedMonitor(e.target.value); setCurrentPage(1); }}
              className="bg-transparent font-label-sm text-label-sm text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Monitors</option>
              {monitors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-1.5 bg-surface-container px-3 py-1.5 rounded border border-sandstone/60">
            <span className="font-label-sm text-label-sm text-tertiary">Time:</span>
            <select
              value={dateRange}
              onChange={(e) => { setDateRange(e.target.value); setCurrentPage(1); }}
              className="bg-transparent font-label-sm text-label-sm text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="24h">Past 24 Hours</option>
              <option value="7d">Past 7 Days</option>
              <option value="30d">Past 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* CHRONOLOGY LEDGER LIST */}
      <div className="w-full bg-surface-container-lowest rounded-lg shadow-sm overflow-hidden border border-sandstone">
        {filteredHistory.length === 0 ? (
          <div className="py-16 text-center text-on-surface-variant font-body-sm text-body-sm flex flex-col items-center">
            <span className="material-symbols-outlined text-[32px] text-tertiary mb-2">history_toggle_off</span>
            <p>No capture chronology records matching your active filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-sandstone">
            {paginatedHistory.map((entry) => (
              <div
                key={entry.id}
                className="p-space-lg hover:bg-surface-container-low transition-colors flex flex-col md:flex-row md:items-center justify-between gap-space-md"
              >
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-telemetry-data text-telemetry-data text-on-surface font-semibold">
                      {entry.scanId}
                    </span>
                    <span className="text-sandstone">·</span>
                    <span className="font-label-md text-label-md text-on-surface font-medium">
                      {entry.target}
                    </span>
                    <span className="font-label-sm text-label-sm text-tertiary">({entry.url})</span>
                    <span className="text-sandstone">·</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {entry.timestamp}
                    </span>
                    {entry.isReviewed ? (
                      <span className="font-label-sm text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">check</span>
                        Reviewed
                      </span>
                    ) : (
                      <span className="font-label-sm text-[10px] px-2 py-0.5 rounded bg-secondary-container/40 text-on-secondary-container font-medium">
                        Unreviewed
                      </span>
                    )}
                  </div>

                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-normal">
                    {entry.title}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {entry.details}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0 self-start md:self-center">
                  <StatusIndicator status={entry.status} />
                  
                  {/* Review Toggle Action */}
                  <button
                    onClick={() => toggleChangeReview(entry.id)}
                    className={`px-3 py-1.5 rounded font-label-sm text-label-sm transition-colors border ${
                      entry.isReviewed
                        ? 'bg-surface-container text-tertiary border-sandstone hover:text-on-surface'
                        : 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                    }`}
                    title={entry.isReviewed ? 'Mark as Unreviewed' : 'Mark as Reviewed'}
                  >
                    {entry.isReviewed ? 'Mark Unreviewed' : 'Mark Reviewed'}
                  </button>

                  <Link
                    to={`/compare/${entry.compareId || entry.id}?changeId=${entry.id}`}
                    className="px-4 py-1.5 rounded bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface font-body-sm text-body-sm transition-all border border-sandstone inline-flex items-center gap-1.5"
                  >
                    <span>Compare Diff</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PAGINATION FOOTER */}
        {filteredHistory.length > 0 && (
          <div className="px-space-md py-3 bg-surface-container flex items-center justify-between border-t border-sandstone text-on-surface-variant font-label-sm text-label-sm">
            <span>
              Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredHistory.length)}–{Math.min(currentPage * PAGE_SIZE, filteredHistory.length)} of {filteredHistory.length} recorded events
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded bg-surface-container-lowest hover:bg-surface-container-high border border-sandstone disabled:opacity-40"
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded bg-surface-container-lowest hover:bg-surface-container-high border border-sandstone disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
