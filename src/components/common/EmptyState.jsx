import React from 'react';
import Button from './Button';

export function EmptyState({
  title = 'No destinations found',
  description = 'There are no monitored pages matching your current filter criteria.',
  actionLabel,
  onAction,
  icon = 'radar'
}) {
  return (
    <div className="py-16 px-6 text-center flex flex-col items-center justify-center max-w-md mx-auto">
      <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary mb-4">
        <span className="material-symbols-outlined text-[24px]">{icon}</span>
      </div>
      <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2 font-normal italic">
        {title}
      </h3>
      <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction} icon="add">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function LoadingState({ message = 'Synchronizing observatory telemetry...' }) {
  return (
    <div className="py-20 flex flex-col items-center justify-center text-center">
      <div className="relative w-10 h-10 mb-4 flex items-center justify-center">
        <span className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin"></span>
        <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
      </div>
      <p className="font-label-sm text-label-sm text-on-surface-variant tracking-wider uppercase">
        {message}
      </p>
    </div>
  );
}

export function ErrorState({ title = 'Telemetry Disruption', message = 'Unable to fetch monitor status.', onRetry }) {
  return (
    <div className="p-space-lg rounded bg-error-container/20 border border-error/30 text-on-surface my-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-error text-[20px] mt-0.5">warning</span>
        <div className="flex-1">
          <h4 className="font-headline-sm text-headline-sm text-error font-normal">{title}</h4>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 px-3 py-1 rounded bg-error text-on-error font-label-sm text-label-sm hover:opacity-90"
            >
              Retry Connection
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmptyState;
