import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopNavigation from './TopNavigation';
import Footer from './Footer';
import Toast from '../common/Toast';
import { useObservatory } from '../../context/ObservatoryContext';
import { getApiBaseUrl, setCustomApiBaseUrl } from '../../services/apiClient';

export default function AppShell() {
  const { isDemoMode, connectionError, refresh, showToast } = useObservatory();
  const [isNoticeDismissed, setIsNoticeDismissed] = useState(false);
  const [isBackendModalOpen, setIsBackendModalOpen] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState(getApiBaseUrl());

  const handleSaveBackendUrl = (e) => {
    e.preventDefault();
    setCustomApiBaseUrl(customUrlInput);
    setIsBackendModalOpen(false);
    showToast('Updated backend endpoint. Reconnecting...');
    refresh();
  };

  const handleResetBackendUrl = () => {
    setCustomApiBaseUrl('/api');
    setCustomUrlInput('/api');
    setIsBackendModalOpen(false);
    showToast('Reset backend endpoint to default (/api).');
    refresh();
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface-container-low text-on-surface">
      <TopNavigation />
      <main className="w-full pt-16 bg-surface-container-low flex-1 flex flex-col min-h-[calc(100vh-4rem)]">
        {/* Connection Notice / Standalone Mode Indicator */}
        {!isNoticeDismissed && (isDemoMode || connectionError) && (
          <div className="w-full bg-surface-container-high/80 border-b border-sandstone px-margin-mobile md:px-margin-desktop py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-body-sm animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
              <span className="font-medium text-on-surface">Standalone Showcase Mode:</span>
              <span className="text-on-surface-variant text-xs sm:text-sm">
                Running with in-browser storage. All monitors, visual diffs, and actions are interactive.
              </span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => {
                  setCustomUrlInput(getApiBaseUrl());
                  setIsBackendModalOpen(true);
                }}
                className="px-2.5 py-1 bg-surface-container-lowest hover:bg-surface-container border border-sandstone rounded text-label-sm font-medium transition-colors text-primary"
                type="button"
              >
                Connect Backend
              </button>
              <button
                onClick={() => setIsNoticeDismissed(true)}
                className="p-1 text-on-surface-variant hover:text-on-surface rounded transition-colors"
                title="Dismiss banner"
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </div>
        )}

        <Outlet />
      </main>
      <Footer />
      <Toast />

      {/* Backend API Configuration Modal */}
      {isBackendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-sandstone rounded-lg max-w-md w-full p-6 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-sandstone pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary">dns</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-normal">
                  Backend API Endpoint
                </h3>
              </div>
              <button
                onClick={() => setIsBackendModalOpen(false)}
                className="p-1 rounded text-on-surface-variant hover:text-on-surface"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              If your Node.js backend is deployed on a separate host (e.g., Render, Railway, or VPS), enter the base URL below. Leave as <code className="font-mono bg-surface-container px-1 py-0.5 rounded text-xs">/api</code> for local development or Docker deployments.
            </p>

            <form onSubmit={handleSaveBackendUrl} className="flex flex-col gap-3">
              <div>
                <label className="font-label-sm text-label-sm text-tertiary block mb-1">
                  API Base URL
                </label>
                <input
                  type="text"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  placeholder="https://your-api.onrender.com/api"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-sandstone focus:border-primary focus:outline-none font-mono text-body-sm text-on-surface"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-sandstone">
                <button
                  type="button"
                  onClick={handleResetBackendUrl}
                  className="text-label-sm text-tertiary hover:text-on-surface underline font-medium"
                >
                  Reset to Default
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBackendModalOpen(false)}
                    className="px-3 py-1.5 rounded bg-surface-container text-on-surface text-label-sm hover:bg-surface-container-high"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-primary text-on-primary text-label-sm font-medium hover:bg-primary-container"
                  >
                    Save &amp; Connect
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
