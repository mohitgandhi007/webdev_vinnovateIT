import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center py-24 px-6 text-center animate-in fade-in duration-200">
      <div className="max-w-md bg-surface-container-lowest p-8 rounded-lg shadow-sm border border-sandstone flex flex-col items-center">
        <span className="font-telemetry-data text-telemetry-data text-primary px-3 py-1 rounded bg-primary/10 mb-4">
          404 · TELEMETRY VOID
        </span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2 font-normal">
          Page <span className="italic font-normal text-secondary">Uncharted</span>.
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mb-6 leading-relaxed">
          The requested coordinate has drifted outside our monitored constellation or has not yet been registered.
        </p>
        <Link
          to="/overview"
          className="inline-flex items-center gap-2 px-space-md py-2.5 rounded bg-primary hover:bg-primary-container text-on-primary font-body-sm text-body-sm transition-all shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">explore</span>
          <span>Return to Observatory</span>
        </Link>
      </div>
    </div>
  );
}
