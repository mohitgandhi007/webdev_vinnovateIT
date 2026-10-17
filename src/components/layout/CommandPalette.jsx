import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useObservatory } from '../../context/ObservatoryContext';

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { monitors, history } = useObservatory();
  
  const inputRef = useRef(null);
  const prevActiveElement = useRef(null);

  // Save previous active element for focus restoration
  useEffect(() => {
    if (isOpen) {
      prevActiveElement.current = document.activeElement;
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    } else if (prevActiveElement.current && typeof prevActiveElement.current.focus === 'function') {
      prevActiveElement.current.focus();
    }
  }, [isOpen]);

  // Construct items
  const quickNav = [
    { id: 'nav-overview', label: 'Overview Observatory', path: '/overview', icon: 'dashboard', section: 'Navigation' },
    { id: 'nav-monitors', label: 'Monitors Catalog', path: '/monitors', icon: 'list_alt', section: 'Navigation' },
    { id: 'nav-history', label: 'Change History', path: '/history', icon: 'history', section: 'Navigation' },
    { id: 'nav-insights', label: 'AI Intelligence Journal', path: '/insights', icon: 'auto_stories', section: 'Navigation' },
    { id: 'nav-add', label: 'Add New Monitor Target', path: '/monitors?action=add', icon: 'add_circle', section: 'Actions' },
  ];

  const monitorsItems = monitors.map(m => ({
    id: `m-${m.id}`,
    label: `${m.name} (${m.url})`,
    path: `/compare/${m.compareId || 'atelier-nordic'}`,
    icon: 'travel_explore',
    section: 'Monitored Destinations'
  }));

  const changesItems = history.map(h => ({
    id: `h-${h.id}`,
    label: `${h.target}: ${h.title}`,
    path: `/compare/${h.compareId || 'atelier-nordic'}`,
    icon: 'price_change',
    section: 'Detected Deviations'
  }));

  const allItems = [...quickNav, ...monitorsItems, ...changesItems];

  const filtered = query.trim()
    ? allItems.filter(item => item.label.toLowerCase().includes(query.toLowerCase()))
    : allItems;

  // Reset index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation within palette
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleSelect = (item) => {
    navigate(item.path);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-inverse-surface/40 backdrop-blur-xs animate-in fade-in duration-150"
      onKeyDown={handleKeyDown}
    >
      <div 
        className="w-full max-w-xl bg-surface-container-lowest rounded-lg shadow-2xl overflow-hidden border border-sandstone flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 bg-surface-container flex items-center gap-2 border-b border-sandstone">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, monitors, diffs, or commands..."
            className="flex-1 bg-transparent text-on-surface font-body-sm text-body-sm focus:outline-none placeholder:text-on-surface-variant"
          />
          <kbd className="font-label-sm text-label-sm bg-surface-container-lowest px-1.5 py-0.5 rounded text-on-surface-variant border border-sandstone">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-surface-container">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-on-surface-variant font-body-sm text-body-sm italic">
              No results found for "{query}"
            </div>
          ) : (
            <div className="py-1">
              {filtered.map((item, idx) => {
                const isSelected = selectedIndex === idx;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-left px-3 py-2 rounded flex items-center justify-between text-on-surface transition-colors group ${
                      isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`material-symbols-outlined text-[18px] transition-colors ${
                        isSelected ? 'text-primary' : 'text-tertiary group-hover:text-primary'
                      }`}>
                        {item.icon}
                      </span>
                      <span className="font-body-sm text-body-sm truncate">{item.label}</span>
                    </div>
                    <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider text-[10px] ml-2 shrink-0">
                      {item.section}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-3 py-2 bg-surface-container border-t border-sandstone flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
          <div className="flex items-center gap-3">
            <span>Theme: <strong>{theme}</strong></span>
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
              className="text-primary hover:underline"
            >
              Cycle Theme
            </button>
          </div>
          <span className="text-tertiary">↑↓ Navigate · ↵ Select · ESC Close</span>
        </div>
      </div>
      <div className="fixed inset-0 -z-10" onClick={onClose}></div>
    </div>
  );
}
