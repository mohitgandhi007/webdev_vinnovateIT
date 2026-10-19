import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useObservatory } from '../../context/ObservatoryContext';

export default function Toast() {
  const { toast, dismissToast } = useObservatory();
  const navigate = useNavigate();

  if (!toast) return null;

  const isWarning = toast.type === 'warning';
  const isError = toast.type === 'error';
  const isSuccess = toast.type === 'success';

  const title = toast.title || (isWarning ? 'Detection Notice' : isError ? 'Observatory Error' : 'System Update');
  const message = toast.message || (typeof toast === 'string' ? toast : '');
  const actionUrl = toast.actionUrl;
  const actionLabel = toast.actionLabel || 'Inspect Diff';

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4 pointer-events-none animate-in slide-in-from-top-4 fade-in duration-300">
      <div
        className={`pointer-events-auto rounded-lg shadow-2xl border backdrop-blur-md px-4 py-3.5 flex items-start gap-3.5 transition-all ${
          isWarning
            ? 'bg-surface-container-lowest/95 border-secondary/60 text-on-surface ring-1 ring-secondary/20 shadow-secondary/5'
            : isError
            ? 'bg-surface-container-lowest/95 border-error/50 text-on-surface ring-1 ring-error/20'
            : 'bg-surface-container-lowest/95 border-sandstone text-on-surface ring-1 ring-sandstone/30'
        }`}
        role="alert"
      >
        {/* Pulsing indicator icon */}
        <div
          className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center mt-0.5 ${
            isWarning
              ? 'bg-secondary/15 text-secondary'
              : isError
              ? 'bg-error/15 text-error'
              : 'bg-primary/15 text-primary'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">
            {isWarning ? 'notifications_active' : isError ? 'error' : 'check_circle'}
          </span>
        </div>

        {/* Content body */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-label-sm text-label-sm font-semibold tracking-wide uppercase text-on-surface">
              {title}
            </span>
            {isWarning && (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono uppercase bg-secondary/15 text-secondary font-medium">
                Live Alert
              </span>
            )}
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug break-words">
            {message}
          </p>

          {/* Action button if diff link provided */}
          {actionUrl && (
            <div className="pt-2">
              <button
                onClick={() => {
                  dismissToast();
                  navigate(actionUrl);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-secondary text-surface-container-lowest hover:bg-secondary/90 font-label-sm text-label-sm font-medium transition-colors shadow-xs"
                type="button"
              >
                <span>{actionLabel}</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={dismissToast}
          className="text-on-surface-variant hover:text-on-surface p-1 rounded transition-colors -mr-1 -mt-1 shrink-0"
          title="Dismiss notification"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  );
}
