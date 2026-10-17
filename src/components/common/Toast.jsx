import React from 'react';
import { useObservatory } from '../../context/ObservatoryContext';

export default function Toast() {
  const { toast, dismissToast } = useObservatory();

  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-200">
      <div className="bg-surface-container-lowest text-on-surface px-4 py-3 rounded-lg shadow-xl border border-sandstone flex items-center gap-3 max-w-md">
        <span
          className={`material-symbols-outlined text-[20px] shrink-0 ${
            isSuccess ? 'text-primary' : isError ? 'text-error' : 'text-secondary'
          }`}
        >
          {isSuccess ? 'check_circle' : isError ? 'error' : 'info'}
        </span>
        <span className="font-body-sm text-body-sm flex-1 leading-snug">
          {toast.message}
        </span>
        <button
          onClick={dismissToast}
          className="text-on-surface-variant hover:text-on-surface p-1 rounded"
          title="Dismiss"
          type="button"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
  );
}
