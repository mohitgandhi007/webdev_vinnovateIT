import React, { useState, useEffect } from 'react';
import { monitorService } from '../services/monitorService';

export default function NumericMetricTracker({ monitorId, monitorName, onOpenSnapshot }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await monitorService.getMetrics(monitorId);
      setData(res);
    } catch (err) {
      setError(err.userMessage || err.message || 'Failed to load metric history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (monitorId) {
      fetchMetrics();
    }
  }, [monitorId]);

  if (loading) {
    return (
      <div className="bg-surface-container-lowest border border-sandstone rounded shadow-sm p-6 text-center text-on-surface-variant">
        <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent mb-2"></div>
        <p className="font-body-sm text-body-sm">Loading numerical tracking history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface-container-lowest border border-error/30 rounded shadow-sm p-6 text-center text-error">
        <p className="font-body-sm text-body-sm font-medium">Failed to load numerical series: {error}</p>
        <button 
          onClick={fetchMetrics}
          className="mt-3 px-3 py-1.5 bg-surface-container hover:bg-surface-container-high text-xs rounded border border-sandstone text-on-surface"
        >
          Retry
        </button>
      </div>
    );
  }

  const hasTracking = data?.hasNumericTracking;
  const points = data?.points || [];
  const validPoints = points.filter(p => p.isValid && p.parsedValue !== null);
  const summary = data?.summary;

  if (!hasTracking) {
    return null; // When tracking is not configured for this monitor, don't clutter the view
  }

  // SVG Chart Dimensions
  const chartWidth = 640;
  const chartHeight = 180;
  const padding = { top: 20, right: 30, bottom: 30, left: 50 };

  const values = validPoints.map(p => p.parsedValue);
  const minVal = values.length > 0 ? Math.min(...values) : 0;
  const maxVal = values.length > 0 ? Math.max(...values) : 100;
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;

  const getX = (index) => {
    if (validPoints.length <= 1) return padding.left + (chartWidth - padding.left - padding.right) / 2;
    return padding.left + (index / (validPoints.length - 1)) * (chartWidth - padding.left - padding.right);
  };

  const getY = (val) => {
    const usableHeight = chartHeight - padding.top - padding.bottom;
    return chartHeight - padding.bottom - ((val - minVal) / range) * usableHeight;
  };

  const linePoints = validPoints
    .map((p, idx) => `${getX(idx)},${getY(p.parsedValue)}`)
    .join(' ');

  const areaPoints = validPoints.length > 0
    ? `${getX(0)},${chartHeight - padding.bottom} ${linePoints} ${getX(validPoints.length - 1)},${chartHeight - padding.bottom}`
    : '';

  return (
    <div className="bg-surface-container-lowest border border-sandstone rounded shadow-sm p-6 space-y-6">
      {/* Header & Metrics Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sandstone pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">monitoring</span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-medium">Numerical Value Observatory</h3>
            <span className="text-xs px-2.5 py-0.5 rounded bg-surface-container text-primary border border-sandstone font-mono font-medium">
              {data?.numericSelector}
            </span>
            {data?.numericUnit && (
              <span className="text-xs px-2 py-0.5 rounded bg-surface-container text-on-surface-variant border border-sandstone font-mono">
                Unit: {data.numericUnit}
              </span>
            )}
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Conservative deterministic value tracking over time · Preserves original string · Zero AI arithmetic
          </p>
        </div>

        {summary && (
          <div className="flex items-center gap-3">
            {/* Latest Value Badge */}
            <div className="bg-surface-container-low border border-sandstone rounded px-3 py-1.5 text-right">
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant block">Latest Value</span>
              <span className="font-telemetry-data text-base font-semibold text-on-surface">
                {validPoints[validPoints.length - 1]?.rawText || summary.latestValue}
              </span>
            </div>

            {/* Delta Indicator */}
            {summary.totalDelta !== 0 && (
              <div className={`px-2.5 py-1.5 rounded border text-right ${
                summary.totalDelta > 0 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400' 
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
              }`}>
                <span className="font-label-sm text-[10px] uppercase tracking-wider block opacity-75">Trend</span>
                <span className="font-telemetry-data text-xs font-semibold flex items-center gap-1 justify-end">
                  {summary.totalDelta > 0 ? '▲ +' : '▼ '}
                  {summary.totalDelta} ({summary.totalPercent > 0 ? `+${summary.totalPercent}%` : `${summary.totalPercent}%`})
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chart Section */}
      {validPoints.length > 0 ? (
        <div className="space-y-3">
          <div className="relative overflow-x-auto bg-surface-bright/50 p-3 rounded border border-sandstone/60">
            <svg 
              viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
              className="w-full h-48 select-none"
              style={{ overflow: 'visible' }}
            >
              <defs>
                <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9a6042" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#9a6042" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines */}
              <line 
                x1={padding.left} 
                y1={padding.top} 
                x2={chartWidth - padding.right} 
                y2={padding.top} 
                stroke="currentColor" 
                className="text-sandstone/60"
                strokeDasharray="3 3" 
              />
              <line 
                x1={padding.left} 
                y1={(padding.top + chartHeight - padding.bottom) / 2} 
                x2={chartWidth - padding.right} 
                y2={(padding.top + chartHeight - padding.bottom) / 2} 
                stroke="currentColor" 
                className="text-sandstone/60"
                strokeDasharray="3 3" 
              />
              <line 
                x1={padding.left} 
                y1={chartHeight - padding.bottom} 
                x2={chartWidth - padding.right} 
                y2={chartHeight - padding.bottom} 
                stroke="currentColor" 
                className="text-sandstone"
              />

              {/* Y Axis Labels */}
              <text x={padding.left - 8} y={padding.top + 4} textAnchor="end" className="fill-on-surface-variant text-[10px] font-mono">
                {maxVal}
              </text>
              <text x={padding.left - 8} y={chartHeight - padding.bottom + 4} textAnchor="end" className="fill-on-surface-variant text-[10px] font-mono">
                {minVal}
              </text>

              {/* Area fill */}
              {areaPoints && (
                <polygon points={areaPoints} fill="url(#metricGradient)" />
              )}

              {/* Line path */}
              {linePoints && (
                <polyline 
                  fill="none" 
                  stroke="#9a6042" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  points={linePoints} 
                />
              )}

              {/* Data Points */}
              {validPoints.map((point, idx) => {
                const cx = getX(idx);
                const cy = getY(point.parsedValue);
                const isInc = point.changeType === 'increase';
                const isDec = point.changeType === 'decrease';
                const dotColor = isInc ? '#d97706' : isDec ? '#059669' : '#9a6042';

                return (
                  <g key={point.id} className="cursor-pointer">
                    <circle
                      cx={cx}
                      cy={cy}
                      r={hoveredPoint?.id === point.id ? 6 : 4}
                      fill={dotColor}
                      stroke="var(--color-surface, #ffffff)"
                      strokeWidth="2"
                      onMouseEnter={() => setHoveredPoint(point)}
                      onMouseLeave={() => setHoveredPoint(null)}
                      onClick={() => onOpenSnapshot && point.snapshotId && onOpenSnapshot(point.snapshotId)}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Floating Tooltip / Point Inspector */}
          {hoveredPoint && (
            <div className="bg-surface-container-high border border-sandstone rounded p-3 text-xs flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  hoveredPoint.changeType === 'increase' ? 'bg-amber-500' :
                  hoveredPoint.changeType === 'decrease' ? 'bg-emerald-500' : 'bg-primary'
                }`} />
                <div>
                  <div className="font-semibold text-on-surface font-mono">
                    {hoveredPoint.rawText}
                    {hoveredPoint.delta !== null && (
                      <span className={`ml-2 text-[11px] ${hoveredPoint.delta > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}`}>
                        ({hoveredPoint.delta > 0 ? `+${hoveredPoint.delta}` : hoveredPoint.delta})
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-on-surface-variant">
                    {new Date(hoveredPoint.capturedAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {hoveredPoint.snapshotId && (
                <button
                  type="button"
                  onClick={() => onOpenSnapshot && onOpenSnapshot(hoveredPoint.snapshotId)}
                  className="text-[11px] text-primary bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded border border-primary/20 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">visibility</span>
                  <span>View Snapshot #{hoveredPoint.snapshotId.slice(0, 8)}</span>
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 text-center text-on-surface-variant text-body-sm bg-surface-container-low rounded border border-dashed border-sandstone">
          No numerical data points recorded yet. Trigger a check to capture the first value.
        </div>
      )}

      {/* Historical Data Table */}
      {points.length > 0 && (
        <div className="mt-4">
          <div className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-medium mb-2">
            Time-Series Data Points ({points.length})
          </div>
          <div className="overflow-x-auto rounded border border-sandstone max-h-56 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container text-on-surface-variant border-b border-sandstone sticky top-0 font-label-sm">
                <tr>
                  <th className="py-2 px-3">Captured At</th>
                  <th className="py-2 px-3">Displayed String</th>
                  <th className="py-2 px-3">Parsed Value</th>
                  <th className="py-2 px-3">Delta</th>
                  <th className="py-2 px-3 text-right">Snapshot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sandstone/40">
                {points.slice().reverse().map((p) => {
                  return (
                    <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="py-2 px-3 text-on-surface-variant font-mono">
                        {new Date(p.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-2 px-3 text-on-surface font-medium">
                        {p.rawText || <span className="text-tertiary italic">Empty</span>}
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {p.isValid ? (
                          <span className="text-primary font-semibold">{p.parsedValue} {p.unit || ''}</span>
                        ) : (
                          <span className="text-error text-[11px] font-medium" title={p.errorReason}>
                            ⚠️ {p.errorReason || 'Ambiguous format'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {p.changeType === 'increase' && (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">+{p.delta}</span>
                        )}
                        {p.changeType === 'decrease' && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{p.delta}</span>
                        )}
                        {p.changeType === 'neutral' && (
                          <span className="text-tertiary">0</span>
                        )}
                        {p.changeType === 'none' && (
                          <span className="text-tertiary">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {p.snapshotId ? (
                          <button
                            type="button"
                            onClick={() => onOpenSnapshot && onOpenSnapshot(p.snapshotId)}
                            className="text-[11px] text-primary hover:underline font-mono"
                          >
                            #{p.snapshotId.slice(0, 8)}
                          </button>
                        ) : (
                          <span className="text-tertiary">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
