import React, { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useObservatory } from '../../context/ObservatoryContext';
import CommandPalette from './CommandPalette';
import NotificationSettingsModal from '../notifications/NotificationSettingsModal';

export default function TopNavigation() {
  const { theme, effectiveTheme, setTheme } = useTheme();
  const { stats, history } = useObservatory();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Global ⌘K keyboard shortcut (do not intercept when typing in inputs/textareas)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) {
          return;
        }
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navLinks = [
    { label: 'Overview', to: '/overview' },
    { label: 'Monitors', to: '/monitors' },
    { label: 'History', to: '/history' },
    { label: 'Insights', to: '/insights' },
  ];

  const unreviewedCount = stats.unreviewedChanges;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface-container-high/90 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-sandstone/60">
        <div className="h-16 w-full px-margin-mobile md:px-margin-desktop flex items-center justify-between">
          {/* Brand Logo & Name */}
          <Link to="/overview" className="flex items-center gap-space-sm group">
            <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/35 flex items-center justify-center text-primary transition-transform group-hover:scale-105 shadow-xs">
              <svg className="w-5 h-5 fill-none stroke-current" strokeWidth="1.75" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" strokeOpacity="0.4" strokeDasharray="2 2" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-headline-sm text-headline-sm italic tracking-tight text-on-surface font-normal">
              pagepulse.
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-space-lg">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  isActive
                    ? 'transition-colors tracking-wide text-on-surface font-medium border-b-2 border-primary pb-0.5'
                    : 'text-on-surface-variant hover:text-on-surface transition-colors font-body-sm text-body-sm tracking-wide'
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Right Utility Controls */}
          <div className="flex items-center gap-space-md">
            {/* Search Trigger */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="hidden sm:flex items-center gap-space-xs px-space-sm py-1 rounded bg-surface-container-lowest text-on-surface-variant hover:text-on-surface shadow-[0_1px_4px_rgba(0,0,0,0.02)] transition-colors border border-sandstone"
              type="button"
              title="Search and Command Palette"
            >
              <span className="font-label-sm text-label-sm">Search</span>
              <kbd className="font-label-sm text-label-sm bg-surface-container px-1 rounded text-on-surface-variant">⌘K</kbd>
            </button>

            {/* Notifications Trigger */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-1.5 rounded-full text-on-surface-variant hover:text-on-surface transition-colors"
                type="button"
                title="Notifications"
                aria-label="Notifications"
              >
                <span className="material-symbols-outlined text-[20px]">notifications</span>
                {unreviewedCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-secondary"></span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-surface-container-lowest rounded-lg shadow-xl border border-sandstone p-3 z-50 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-sandstone font-label-sm text-label-sm text-on-surface">
                    <span>NOTIFICATIONS</span>
                    <span className="text-secondary font-semibold">
                      {unreviewedCount > 0 ? `${unreviewedCount} Unreviewed` : 'Clean'}
                    </span>
                  </div>
                  <div className="py-2 flex flex-col gap-2">
                    {unreviewedCount === 0 ? (
                      <span className="text-on-surface-variant font-body-sm text-xs py-2 text-center">
                        All deviations reviewed.
                      </span>
                    ) : (
                      history.filter(h => !h.isReviewed).map((h) => (
                        <Link
                          key={h.id}
                          to={`/compare/${h.compareId || 'atelier-nordic'}`}
                          onClick={() => setNotificationsOpen(false)}
                          className="p-2 rounded hover:bg-surface-container-low transition-colors block text-left"
                        >
                          <span className="font-label-sm text-label-sm text-secondary font-semibold block">
                            {h.target}
                          </span>
                          <p className="font-body-sm text-body-sm text-on-surface mt-0.5 leading-snug truncate">
                            {h.title}
                          </p>
                          <span className="font-label-sm text-label-sm text-tertiary mt-1 block">
                            {h.timestamp}
                          </span>
                        </Link>
                      ))
                    )}
                  </div>
                  <div className="pt-2 border-t border-sandstone">
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationsOpen(false);
                        setIsNotificationModalOpen(true);
                      }}
                      className="w-full py-1 text-center font-label-sm text-xs text-primary hover:text-primary-container font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[15px]">tune</span>
                      <span>Alert Channels &amp; Rules</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Theme Toggle (Light / Dark / System) */}
            <div className="relative">
              <button
                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                className="p-1.5 rounded-full text-on-surface-variant hover:text-on-surface transition-colors font-label-md text-label-md flex items-center justify-center w-8 h-8"
                type="button"
                title={`Theme: ${theme}`}
                aria-label="Theme selector"
              >
                {effectiveTheme === 'dark' ? (
                  <span className="material-symbols-outlined text-[19px]">dark_mode</span>
                ) : (
                  <span className="material-symbols-outlined text-[19px]">light_mode</span>
                )}
              </button>

              {isThemeMenuOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-surface-container-lowest rounded-lg shadow-xl border border-sandstone p-1.5 z-50 flex flex-col gap-0.5">
                  <button
                    onClick={() => { setTheme('light'); setIsThemeMenuOpen(false); }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left font-label-sm text-label-sm ${
                      theme === 'light' ? 'bg-surface-container text-primary font-semibold' : 'text-on-surface hover:bg-surface-container-low'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">light_mode</span>
                    <span>Light</span>
                  </button>
                  <button
                    onClick={() => { setTheme('dark'); setIsThemeMenuOpen(false); }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left font-label-sm text-label-sm ${
                      theme === 'dark' ? 'bg-surface-container text-primary font-semibold' : 'text-on-surface hover:bg-surface-container-low'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">dark_mode</span>
                    <span>Dark</span>
                  </button>
                  <button
                    onClick={() => { setTheme('system'); setIsThemeMenuOpen(false); }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left font-label-sm text-label-sm ${
                      theme === 'system' ? 'bg-surface-container text-primary font-semibold' : 'text-on-surface hover:bg-surface-container-low'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">settings_brightness</span>
                    <span>System</span>
                  </button>
                </div>
              )}
            </div>

            {/* Profile Avatar */}
            <div className="flex items-center gap-space-xs pl-space-xs">
              <div
                className="w-8 h-8 rounded-full bg-surface-container-high border border-sandstone flex items-center justify-center text-on-surface font-label-sm text-label-sm font-medium cursor-pointer hover:border-primary transition-all select-none shadow-xs"
                title="Curator Studio Profile"
              >
                PP
              </div>
            </div>

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-1.5 rounded text-on-surface-variant hover:text-on-surface"
              type="button"
              aria-label="Toggle Navigation Menu"
            >
              <span className="material-symbols-outlined text-[24px]">
                {isMobileMenuOpen ? 'close' : 'menu'}
              </span>
            </button>
          </div>
        </div>

        {/* Collapsible Mobile Navigation Sheet */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-sandstone bg-surface-container-high px-margin-mobile py-4 flex flex-col gap-3 animate-in slide-in-from-top-2">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    isActive
                      ? 'px-3 py-2 rounded bg-surface-container font-medium text-on-surface border-l-4 border-primary'
                      : 'px-3 py-2 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50 font-body-sm text-body-sm'
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
            <div className="pt-2 border-t border-sandstone/50 flex items-center justify-between">
              <button
                onClick={() => { setIsSearchOpen(true); setIsMobileMenuOpen(false); }}
                className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[18px]">search</span>
                <span>Search / Command Palette</span>
              </button>
              <span className="font-label-sm text-label-sm text-tertiary">⌘K</span>
            </div>
          </div>
        )}
      </header>

      {/* Global Command Palette */}
      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Global Notification Channels & Alert Rules Modal */}
      <NotificationSettingsModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
      />
    </>
  );
}
