import React from 'react';

export function StatusIndicator({ status, label, showDot = true, className = '' }) {
  const norm = (status || '').toLowerCase();

  let dotColor = 'bg-primary';
  let badgeStyle = 'bg-primary/10 text-primary';
  let text = label || status;

  if (norm === 'changed') {
    dotColor = 'bg-secondary';
    badgeStyle = 'bg-secondary-container/40 text-secondary';
    text = label || 'Changed';
  } else if (norm === 'attention' || norm === 'error' || norm === 'flagged') {
    dotColor = 'bg-error';
    badgeStyle = 'bg-error-container/40 text-error';
    text = label || (norm === 'attention' ? 'Needs Attention' : 'Flagged');
  } else if (norm === 'healthy' || norm === 'clean') {
    dotColor = 'bg-primary';
    badgeStyle = 'bg-primary/15 text-primary';
    text = label || 'Healthy';
  } else if (norm === 'noticed') {
    dotColor = 'bg-outline';
    badgeStyle = 'bg-surface-container text-tertiary';
    text = label || 'Noticed';
  } else if (norm === 'added' || norm === '+ added') {
    dotColor = 'bg-primary';
    badgeStyle = 'bg-primary/15 text-primary';
    text = label || '+ Added';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-label-sm text-label-sm font-medium ${badgeStyle} ${className}`}>
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`}></span>}
      <span>{text}</span>
    </span>
  );
}

export default StatusIndicator;
