import React, { useState, useEffect, useCallback } from 'react';
import { monitorService } from '../services/monitorService';

export default function RssFeedModal({ isOpen, onClose, monitorId, monitorName }) {
  const [loading, setLoading] = useState(false);
  const [feedMeta, setFeedMeta] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);

  const fetchMeta = useCallback(async () => {
    if (!monitorId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await monitorService.getFeedMeta(monitorId);
      setFeedMeta(res);
    } catch (err) {
      setError(err.userMessage || err.message || 'Failed to load RSS feed configuration');
    } finally {
      setLoading(false);
    }
  }, [monitorId]);

  useEffect(() => {
    if (isOpen) {
      fetchMeta();
      setCopied(false);
      setActionSuccess(null);
    }
  }, [isOpen, fetchMeta]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (feedMeta?.feedUrl) {
      navigator.clipboard?.writeText(feedMeta.feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleRotate = async () => {
    if (!window.confirm('Rotating the token will invalidate the previous RSS feed URL. All RSS readers using the old token will lose access until updated. Continue?')) {
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await monitorService.rotateFeedToken(monitorId);
      setFeedMeta(res);
      setActionSuccess('Feed token rotated successfully. Previous feed URLs have been invalidated.');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err.message || 'Failed to rotate token');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('Revoking the token disables public RSS feed access for this monitor until a new token is generated. Continue?')) {
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await monitorService.revokeFeedToken(monitorId);
      setFeedMeta(prev => ({ ...prev, feedToken: null, feedUrl: null, feedEnabled: false }));
      setActionSuccess('Feed token revoked. Public RSS access is now disabled.');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err.message || 'Failed to revoke token');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await monitorService.rotateFeedToken(monitorId);
      setFeedMeta(res);
      setActionSuccess('New RSS feed token generated and activated.');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err.message || 'Failed to generate token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-xl bg-surface-container-lowest border border-sandstone rounded shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 bg-surface-container flex items-center justify-between border-b border-sandstone">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[24px] text-primary">rss_feed</span>
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-medium">
                RSS 2.0 Change Feed
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant truncate max-w-md">
                Target: {monitorName || 'Monitored Target'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            title="Close dialog"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Status Banners */}
          {error && (
            <div className="p-3 bg-error-container/20 border border-error/40 rounded text-error text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {actionSuccess && (
            <div className="p-3 bg-primary/15 border border-primary/40 rounded text-primary text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* Architecture / Access Control Explainer */}
          <div className="p-4 bg-surface-container-low rounded border border-sandstone text-xs space-y-2 text-on-surface-variant">
            <div className="flex items-center gap-2 font-medium text-on-surface font-label-sm">
              <span className="material-symbols-outlined text-[16px] text-primary">shield</span>
              <span>Access Control &amp; Privacy Model</span>
            </div>
            <p className="leading-relaxed">
              This feed is <strong>scoped strictly to this monitor</strong> and protected by an unguessable 256-bit access token. Unchanged checks never produce duplicate items. No private emails, credentials, or other users&apos; monitors are ever exposed.
            </p>
          </div>

          {loading ? (
            <div className="py-8 text-center text-on-surface-variant text-sm">
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent mb-2"></div>
              <p>Loading RSS feed settings...</p>
            </div>
          ) : feedMeta?.feedToken ? (
            <div className="space-y-4">
              {/* Active Feed URL Box */}
              <div>
                <label className="font-label-sm text-label-sm font-medium text-on-surface uppercase tracking-wide block mb-1.5">
                  Subscribable Feed URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={feedMeta.feedUrl || ''}
                    className="w-full px-3 py-2 bg-surface-container-low text-on-surface rounded font-mono text-xs border border-sandstone focus:outline-none select-all"
                  />
                  <button
                    onClick={handleCopy}
                    type="button"
                    className="px-4 py-2 bg-primary hover:bg-primary-container text-on-primary font-body-sm text-body-sm rounded flex items-center gap-1.5 shrink-0 transition-colors shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {copied ? 'check' : 'content_copy'}
                    </span>
                    <span>{copied ? 'Copied!' : 'Copy URL'}</span>
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] text-tertiary">
                  <span>Standards-compliant RSS 2.0 with RFC 822 timestamps &amp; ETag caching</span>
                  <a
                    href={feedMeta.feedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-0.5"
                  >
                    <span>Inspect XML</span>
                    <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                  </a>
                </div>
              </div>

              {/* Token Management Card */}
              <div className="pt-4 border-t border-sandstone/60 space-y-3">
                <span className="font-label-sm text-label-sm font-medium text-on-surface uppercase tracking-wide block">
                  Token Security Actions
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleRotate}
                    disabled={loading}
                    type="button"
                    className="px-3.5 py-1.5 bg-surface-container hover:bg-surface-container-high text-on-surface border border-sandstone rounded font-label-sm text-label-sm transition-colors flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[15px]">autorenew</span>
                    <span>Rotate Token</span>
                  </button>
                  <button
                    onClick={handleRevoke}
                    disabled={loading}
                    type="button"
                    className="px-3.5 py-1.5 bg-surface-container hover:bg-error-container/20 text-error border border-error/30 rounded font-label-sm text-label-sm transition-colors flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[15px]">block</span>
                    <span>Revoke Feed</span>
                  </button>
                </div>
                <p className="text-[11px] text-tertiary">
                  Rotate your token if you suspect it has been shared unintentionally. Revoking disables external subscription immediately.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center space-y-3 bg-surface-container-low rounded border border-dashed border-sandstone">
              <span className="material-symbols-outlined text-[32px] text-tertiary">rss_feed</span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                RSS feed access for this monitor is currently revoked or inactive.
              </p>
              <button
                onClick={handleGenerate}
                disabled={loading}
                type="button"
                className="px-4 py-2 bg-primary hover:bg-primary-container text-on-primary font-body-sm text-body-sm rounded inline-flex items-center gap-1.5 shadow-xs"
              >
                <span className="material-symbols-outlined text-[16px]">key</span>
                <span>Generate Unguessable Feed Token</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-surface-container flex justify-end border-t border-sandstone">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 bg-surface-container-high hover:bg-surface-container text-on-surface rounded font-body-sm text-body-sm border border-sandstone transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
