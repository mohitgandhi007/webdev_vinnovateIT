import React from 'react';
import { Outlet } from 'react-router-dom';
import TopNavigation from './TopNavigation';
import Footer from './Footer';
import Toast from '../common/Toast';
import { useObservatory } from '../../context/ObservatoryContext';

export default function AppShell() {
  const { connectionError, refresh } = useObservatory();

  return (
    <div className="min-h-screen flex flex-col bg-surface-container-low text-on-surface">
      <TopNavigation />
      <main className="w-full pt-16 bg-surface-container-low flex-1 flex flex-col min-h-[calc(100vh-4rem)]">
        {connectionError && (
          <div className="w-full bg-error-container/20 border-b border-error/30 px-margin-mobile md:px-margin-desktop py-2.5 flex items-center justify-between text-on-error-container text-body-sm animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-error">cloud_off</span>
              <span className="font-medium text-error">Backend Connection Notice:</span>
              <span>{connectionError}</span>
            </div>
            <button
              onClick={() => refresh()}
              className="px-3 py-1 bg-surface-container-lowest text-on-surface hover:bg-surface-container border border-sandstone rounded text-label-sm font-medium transition-colors"
            >
              Retry Connection
            </button>
          </div>
        )}
        <Outlet />
      </main>
      <Footer />
      <Toast />
    </div>
  );
}
