import React from 'react';

export default function Footer() {
  return (
    <footer className="w-full bg-surface-container py-space-xl border-t border-sandstone">
      <div className="w-full px-margin-mobile md:px-margin-desktop flex flex-col md:flex-row items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-sm">
          <span className="font-headline-sm text-headline-sm italic text-on-surface">pagepulse.</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">Atelier Edition v2.4</span>
        </div>
        <div className="flex items-center gap-space-lg">
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            © 2025 Digital Atelier Labs. All rights reserved.
          </span>
        </div>
      </div>
    </footer>
  );
}
