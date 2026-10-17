import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StatusIndicator from '../components/common/StatusIndicator';
import { useObservatory } from '../context/ObservatoryContext';

export default function OverviewPage() {
  const navigate = useNavigate();
  const { stats, history, monitors } = useObservatory();

  return (
    <div className="w-full px-margin-mobile md:px-margin-desktop py-space-lg flex flex-col gap-space-xl animate-in fade-in duration-200">
      {/* SECTION 1: THE WELCOME HEADER */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
        <div className="flex flex-col gap-space-xs max-w-3xl">
          <div className="flex items-center gap-space-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span className="font-label-sm text-label-sm text-tertiary tracking-widest uppercase">
              YOUR DIGITAL OBSERVATORY
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface leading-tight tracking-tight">
            Your <span className="italic font-normal">corner of the internet.</span>
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant pt-1">
            An overview of the pages you follow and the{' '}
            <span className="text-secondary select-none font-italianno text-[1.85em] leading-[0.9]">
              changes worth noticing.
            </span>
          </p>
        </div>
        <div className="self-start md:self-end">
          <button
            onClick={() => navigate('/monitors?action=add')}
            className="flex items-center gap-space-xs px-space-md py-2.5 rounded bg-primary hover:bg-primary-container text-on-primary font-body-sm text-body-sm transition-colors shadow-sm"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Add Monitor</span>
          </button>
        </div>
      </header>

      {/* SECTION 2: THE MONITORING OVERVIEW (Continuous metric strip derived from real state) */}
      <section className="w-full bg-surface-container-lowest rounded-lg shadow-sm overflow-hidden border border-sandstone">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-sandstone">
          <div className="px-space-lg py-space-md flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary"></span>
              <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider">
                Active Monitors
              </span>
            </div>
            <div className="flex items-baseline gap-space-sm">
              <span className="font-headline-lg text-headline-lg text-on-surface">
                {String(stats.active).padStart(2, '0')}
              </span>
              <span className="font-body-sm text-body-sm text-tertiary">
                {stats.paused > 0 ? `${stats.paused} paused` : (stats.total === 0 ? 'No monitors added yet' : 'All systems pulsing')}
              </span>
            </div>
          </div>

          <div className="px-space-lg py-space-md flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary"></span>
              <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider">
                Changes Detected
              </span>
            </div>
            <div className="flex items-baseline gap-space-sm">
              <span className="font-headline-lg text-headline-lg text-on-surface">
                {String(stats.changed).padStart(2, '0')}
              </span>
              <span className="font-body-sm text-body-sm text-tertiary">
                {stats.unreviewedChanges > 0 ? `${stats.unreviewedChanges} unreviewed` : 'All changes reviewed'}
              </span>
            </div>
          </div>

          <div className="px-space-lg py-space-md flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${stats.attention > 0 ? 'bg-error' : 'bg-primary'}`}></span>
              <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider">
                Needs Attention
              </span>
            </div>
            <div className="flex items-baseline gap-space-sm">
              <span className={`font-headline-lg text-headline-lg ${stats.attention > 0 ? 'text-error' : 'text-on-surface'}`}>
                {String(stats.attention).padStart(2, '0')}
              </span>
              <span className="font-body-sm text-body-sm text-tertiary">
                {stats.attention > 0 ? 'Failing or blocked targets' : 'Nominal alignment'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* EMPTY STATE: WHEN NO MONITORS EXIST */}
      {monitors.length === 0 ? (
        <section className="w-full p-space-xl rounded-lg bg-surface-container-lowest border border-sandstone shadow-sm flex flex-col items-center justify-center text-center py-16 gap-space-md">
          <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-primary mb-2">
            <span className="material-symbols-outlined text-[32px]">track_changes</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface font-normal">
            Your observatory is awaiting its first target.
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-lg">
            Register any public webpage URL to begin tracking content alterations, visual shifts, and AI-powered intelligence summaries automatically.
          </p>
          <div className="pt-2">
            <button
              onClick={() => navigate('/monitors?action=add')}
              className="flex items-center gap-2 px-space-lg py-2.5 rounded bg-primary hover:bg-primary-container text-on-primary font-body-sm text-body-sm transition-colors shadow-sm"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Add Your First Monitor</span>
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* SECTION 3: THE LATEST DISCOVERY (Derived from real latest change or newest monitor) */}
          {history.length > 0 ? (
            (() => {
              const latestChange = history[0];
              const isReviewed = latestChange.isReviewed;
              return (
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-stretch">
                  <div className="lg:col-span-7 flex flex-col rounded-lg bg-surface-container-lowest overflow-hidden shadow-sm border border-sandstone">
                    {/* Real Target Browser Header */}
                    <div className="px-space-md py-2.5 bg-surface-container flex items-center justify-between text-on-surface-variant border-b border-sandstone">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-outline-variant/70"></span>
                        <span className="w-2.5 h-2.5 rounded-full bg-outline-variant/70"></span>
                        <span className="w-2.5 h-2.5 rounded-full bg-outline-variant/70"></span>
                      </div>
                      <div className="flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-1 rounded text-center font-label-sm text-label-sm text-on-surface-variant min-w-[240px] justify-center shadow-inner border border-sandstone">
                        <span className="material-symbols-outlined text-[13px] text-tertiary">lock</span>
                        <span className="truncate">{latestChange.url}</span>
                      </div>
                      <span className="font-label-sm text-label-sm text-tertiary">{latestChange.timestamp}</span>
                    </div>

                    {/* Diff Overview Box */}
                    <div className="p-space-lg bg-surface-container-low flex flex-col justify-center flex-1 min-h-[260px]">
                      <div className="p-space-md rounded bg-surface-container-lowest border border-sandstone shadow-sm flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider font-semibold">
                            {latestChange.target}
                          </span>
                          <span className="px-2 py-0.5 rounded font-label-sm text-label-sm bg-secondary text-surface-container-lowest uppercase tracking-wider font-semibold">
                            {latestChange.status}
                          </span>
                        </div>
                        <div className="font-body-md text-body-md text-on-surface font-medium">
                          {latestChange.title}
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-3">
                          {latestChange.details}
                        </p>
                        <div className="flex items-center gap-4 text-label-sm text-tertiary pt-2 border-t border-sandstone/60">
                          {latestChange.domNodesModified > 0 && (
                            <span>{latestChange.domNodesModified} DOM nodes altered</span>
                          )}
                          {latestChange.visualDiffPercent > 0 && (
                            <span>{latestChange.visualDiffPercent}% visual shift</span>
                          )}
                        </div>
                        <div className="pt-2">
                          <button
                            onClick={() => navigate(`/compare/${latestChange.compareId || latestChange.id}`)}
                            className="w-full py-2 text-center font-label-sm text-label-sm text-on-primary rounded bg-primary hover:bg-primary-container transition-colors shadow-xs"
                          >
                            Inspect Full Telemetry Diff
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Narrative Callout */}
                  <div className="lg:col-span-5 flex flex-col justify-between p-space-xl rounded-lg bg-surface-container-lowest shadow-sm border border-sandstone">
                    <div className="flex flex-col gap-space-md">
                      <div className="flex items-center justify-between">
                        <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-widest">
                          LATEST DISCOVERY · {latestChange.timestamp}
                        </span>
                        <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm ${
                          isReviewed ? 'bg-primary/15 text-primary' : 'text-secondary bg-secondary-container/40'
                        }`}>
                          {isReviewed ? 'Reviewed ✓' : 'Unreviewed Shift'}
                        </span>
                      </div>
                      <h2 className="font-headline-md text-headline-md text-on-surface font-normal italic leading-snug">
                        {latestChange.title}
                      </h2>
                      <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                        {latestChange.details}
                      </p>
                    </div>
                    <div className="pt-space-lg">
                      <button
                        onClick={() => navigate(`/compare/${latestChange.compareId || latestChange.id}`)}
                        className="w-full flex items-center justify-center gap-space-sm px-space-md py-2.5 rounded bg-primary hover:bg-primary-container text-on-primary font-body-sm text-body-sm transition-colors shadow-sm"
                        type="button"
                      >
                        <span>{isReviewed ? 'Inspect comparison' : 'View change'}</span>
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                </section>
              );
            })()
          ) : (
            (() => {
              const latestMonitor = monitors[0];
              return (
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-stretch">
                  <div className="lg:col-span-7 flex flex-col justify-center p-space-xl rounded-lg bg-surface-container-lowest shadow-sm border border-sandstone">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-primary"></span>
                      <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider">
                        Active Monitoring Steady
                      </span>
                    </div>
                    <h3 className="font-headline-md text-headline-md text-on-surface">
                      {latestMonitor.name}
                    </h3>
                    <p className="font-body-md text-body-md text-on-surface-variant mt-2">
                      Target <span className="font-mono text-on-surface">{latestMonitor.url}</span> is actively pulsing on a {latestMonitor.checkCadence} cadence. No drift or semantic changes have been detected yet.
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <span className="text-label-sm text-tertiary">Status: {latestMonitor.status}</span>
                      <span className="text-tertiary">·</span>
                      <span className="text-label-sm text-tertiary">Last Check: {latestMonitor.lastChecked}</span>
                    </div>
                  </div>
                  <div className="lg:col-span-5 flex flex-col justify-between p-space-xl rounded-lg bg-surface-container-lowest shadow-sm border border-sandstone">
                    <div>
                      <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-widest">
                        NOMINAL HEALTH
                      </span>
                      <h4 className="font-headline-sm text-headline-sm text-on-surface mt-2 font-normal italic">
                        Baselines captured and locked.
                      </h4>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 leading-relaxed">
                        PagePulse will continuously snapshot this destination. If pricing, DOM nodes, or layout alter, instant alerts and structured comparisons will trigger.
                      </p>
                    </div>
                    <div className="pt-4">
                      <button
                        onClick={() => navigate('/monitors')}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-primary text-on-primary font-body-sm text-body-sm hover:bg-primary-container transition-colors"
                      >
                        <span>Manage Monitors</span>
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                </section>
              );
            })()
          )}

          {/* SECTION 4: THE ACTIVITY JOURNAL */}
          <section className="flex flex-col gap-space-md">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-space-xs pb-space-xs">
              <h3 className="font-headline-md text-headline-md text-on-surface">
                A{' '}
                <span className="text-secondary font-italianno text-[1.6em] leading-[0.8]">
                  little
                </span>{' '}
                has changed.
              </h3>
              <Link
                to="/history"
                className="font-label-sm text-label-sm text-tertiary hover:text-on-surface inline-flex items-center gap-1 transition-colors"
              >
                <span>View all</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>

            {/* Ledger Container */}
            <div className="w-full rounded-lg bg-surface-container-lowest overflow-hidden shadow-sm border border-sandstone">
              {history.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant font-body-sm text-body-sm">
                  No changes detected across your monitored destinations yet. All targets are currently steady.
                </div>
              ) : (
                history.slice(0, 4).map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-space-md md:px-space-lg md:py-space-md flex flex-col md:flex-row md:items-center justify-between gap-space-sm hover:bg-surface-container-low transition-colors ${
                      idx < Math.min(history.length, 4) - 1 ? 'border-b border-sandstone' : ''
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-space-sm sm:gap-space-md flex-1 min-w-0">
                      <span className="font-label-sm text-label-sm text-tertiary w-32 shrink-0">
                        {item.timestamp}
                      </span>
                      <span className="font-label-md text-label-md text-on-surface font-medium w-44 truncate shrink-0">
                        {item.url}
                      </span>
                      <p className="font-body-sm text-body-sm text-on-surface-variant truncate flex-1 min-w-0">
                        {item.title || item.details}
                      </p>
                    </div>
                    <div className="flex items-center gap-space-md shrink-0 self-end sm:self-center">
                      <StatusIndicator status={item.isReviewed ? 'healthy' : 'attention'} showDot={false} label={item.status} />
                      <Link
                        to={`/compare/${item.compareId || item.id}`}
                        className="font-body-sm text-body-sm text-primary hover:text-primary-container inline-flex items-center gap-0.5"
                      >
                        <span>Inspect diff</span>
                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}

      {/* SECTION 5: MONITORING CADENCE CHART */}
      <section className="p-space-lg rounded-lg bg-surface-container-lowest shadow-sm flex flex-col gap-space-md border border-sandstone">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
          <div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-normal">
              Observatory Monitoring Cadence
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Telemetry frequency and change detection distribution over the last 24 hours.
            </p>
          </div>
          <span className="font-label-sm text-label-sm text-tertiary">Cycle: 15m Automated Pulse</span>
        </div>

        {/* Compact Frequency Curve SVG Chart */}
        <div className="w-full relative pt-2">
          <svg
            aria-label="Monitoring Cadence 24 Hour Curve"
            className="w-full h-44 overflow-visible"
            preserveAspectRatio="none"
            viewBox="0 0 1000 220"
          >
            <defs>
              <linearGradient id="cadenceGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#747D52" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#747D52" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <line stroke="currentColor" className="text-sandstone" strokeDasharray="3 4" strokeWidth="1" x1="0" x2="1000" y1="40" y2="40" />
            <line stroke="currentColor" className="text-sandstone" strokeDasharray="3 4" strokeWidth="1" x1="0" x2="1000" y1="100" y2="100" />
            <line stroke="currentColor" className="text-sandstone" strokeDasharray="3 4" strokeWidth="1" x1="0" x2="1000" y1="160" y2="160" />
            <line stroke="currentColor" className="text-sandstone" strokeWidth="1" x1="0" x2="1000" y1="210" y2="210" />

            <path
              d="M 0 210 C 100 200, 180 180, 250 170 C 320 160, 380 120, 450 70 C 500 35, 540 25, 590 50 C 650 80, 720 140, 800 130 C 880 120, 940 90, 1000 115 L 1000 210 Z"
              fill="url(#cadenceGradient)"
            />
            <path
              d="M 0 210 C 100 200, 180 180, 250 170 C 320 160, 380 120, 450 70 C 500 35, 540 25, 590 50 C 650 80, 720 140, 800 130 C 880 120, 940 90, 1000 115"
              fill="none"
              stroke="#747D52"
              strokeLinecap="round"
              strokeWidth="2.5"
            />
            <circle cx="525" cy="30" fill="#747D52" r="4.5" stroke="#FFFEFA" strokeWidth="2" />
            <g transform="translate(485, 0)">
              <rect fill="#302A24" height="20" rx="3" width="80" x="0" y="0" />
              <text fill="#F6F3EC" fontFamily="IBM Plex Mono" fontSize="10" textAnchor="middle" x="40" y="14">
                10:00 · 8 diffs
              </text>
            </g>
          </svg>

          <div className="flex justify-between items-center pt-2 font-label-sm text-label-sm text-tertiary">
            <span>00:00</span>
            <span>04:00</span>
            <span>08:00</span>
            <span className="font-medium text-on-surface">12:00 UTC</span>
            <span>16:00</span>
            <span>20:00</span>
            <span>Now</span>
          </div>
        </div>

        <div className="pt-space-xs flex items-center justify-between border-t border-sandstone/40 text-on-surface-variant font-body-sm text-body-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[18px]">insights</span>
            <span>
              <strong className="font-medium text-on-surface">Pacing:</strong> 14 changes detected today, peaking around 10:00 UTC.
            </span>
          </div>
          <span className="font-label-sm text-label-sm text-tertiary hidden md:inline-block">
            Frequency normal ±1.2σ
          </span>
        </div>
      </section>
    </div>
  );
}
