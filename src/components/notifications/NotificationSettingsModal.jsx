import React, { useState, useEffect, useCallback } from 'react';
import { notificationsApi } from '../../services/apiClient';

export default function NotificationSettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('destinations'); // 'destinations' | 'deliveries' | 'new'
  const [destinations, setDestinations] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }

  // Form states
  const [formName, setFormName] = useState('');
  const [formChannel, setFormChannel] = useState('discord');
  const [formTarget, setFormTarget] = useState('');
  const [formOnChange, setFormOnChange] = useState(true);
  const [formOnHighImportance, setFormOnHighImportance] = useState(false);
  const [formOnFailure, setFormOnFailure] = useState(false);
  const [formKeywords, setFormKeywords] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchDestinations = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await notificationsApi.listDestinations();
      if (res.success && Array.isArray(res.data)) {
        setDestinations(res.data);
      }
    } catch (err) {
      console.warn('Failed to fetch destinations:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchDeliveries = useCallback(async () => {
    try {
      const res = await notificationsApi.listDeliveries({ limit: 20 });
      if (res.success && Array.isArray(res.data)) {
        setDeliveries(res.data);
      }
    } catch (err) {
      console.warn('Failed to fetch deliveries:', err.message);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchDestinations();
      fetchDeliveries();
      setFeedback(null);
      setFormError('');
    }
  }, [isOpen, fetchDestinations, fetchDeliveries]);

  const handleTest = async (destinationId) => {
    try {
      setTestingId(destinationId);
      setFeedback(null);
      const res = await notificationsApi.testDestination(destinationId);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Notification confirmed: Provider accepted and delivered test dispatch ✓'
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.data?.error_message || 'Delivery rejected by provider'
        });
      }
      fetchDeliveries();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to dispatch test notification'
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id) => {
    try {
      await notificationsApi.deleteDestination(id);
      fetchDestinations();
      setFeedback({ type: 'success', message: 'Destination removed.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleToggleActive = async (destination) => {
    try {
      await notificationsApi.updateDestination(destination.id, {
        is_active: !destination.is_active
      });
      fetchDestinations();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleCreateDestination = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formTarget.trim()) {
      setFormError('Target destination (URL, email, or Chat ID) is required.');
      return;
    }

    const keywordsList = formKeywords
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);

    setIsSubmitting(true);
    try {
      await notificationsApi.createDestination({
        name: formName.trim() || `${formChannel.toUpperCase()} Alerts`,
        channel: formChannel,
        target_destination: formTarget.trim(),
        triggers: {
          on_change: formOnChange,
          on_high_importance: formOnHighImportance,
          on_failure: formOnFailure,
          keywords: keywordsList
        },
        is_active: true
      });

      setFeedback({ type: 'success', message: 'Notification destination configured successfully.' });
      setFormName('');
      setFormTarget('');
      setFormKeywords('');
      setActiveTab('destinations');
      fetchDestinations();
    } catch (err) {
      setFormError(err.message || 'Failed to create notification destination.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-surface-container-lowest rounded-xl shadow-2xl border border-sandstone w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* MODAL HEADER */}
        <div className="p-6 border-b border-sandstone flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[24px] text-primary">notifications_active</span>
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-normal">
                Notification Channels &amp; Alert Rules
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Configure instant alerts for meaningful changes, keywords, and system degradations.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* FEEDBACK BANNER */}
        {feedback && (
          <div className={`px-6 py-3 text-body-sm flex items-center justify-between border-b ${
            feedback.type === 'success'
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-error/10 text-error border-error/20'
          }`}>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">
                {feedback.type === 'success' ? 'check_circle' : 'error'}
              </span>
              <span>{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-on-surface-variant hover:text-on-surface text-xs">
              Dismiss
            </button>
          </div>
        )}

        {/* TABS */}
        <div className="flex border-b border-sandstone px-6 bg-surface-container-lowest">
          <button
            onClick={() => setActiveTab('destinations')}
            className={`py-3 px-4 font-label-md text-label-md font-medium border-b-2 transition-colors ${
              activeTab === 'destinations'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Configured Channels ({destinations.length})
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`py-3 px-4 font-label-md text-label-md font-medium border-b-2 transition-colors ${
              activeTab === 'new'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            + Add Destination
          </button>
          <button
            onClick={() => setActiveTab('deliveries')}
            className={`py-3 px-4 font-label-md text-label-md font-medium border-b-2 transition-colors ${
              activeTab === 'deliveries'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Delivery Log ({deliveries.length})
          </button>
        </div>

        {/* TAB CONTENTS */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'destinations' && (
            <div className="flex flex-col gap-4">
              {isLoading ? (
                <div className="py-12 text-center text-on-surface-variant">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <span>Loading notification destinations...</span>
                </div>
              ) : destinations.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-sandstone rounded-lg">
                  <span className="material-symbols-outlined text-[36px] text-tertiary mb-2">notifications_off</span>
                  <h4 className="font-headline-sm text-headline-sm text-on-surface font-normal">
                    No Notification Channels Configured
                  </h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 mb-4">
                    Set up Discord webhooks, Telegram bots, or Email to receive dispatches.
                  </p>
                  <button
                    onClick={() => setActiveTab('new')}
                    className="px-4 py-2 bg-primary text-on-primary rounded font-label-md text-label-md hover:bg-primary-container transition-colors shadow-xs"
                  >
                    Configure First Channel
                  </button>
                </div>
              ) : (
                destinations.map((dest) => (
                  <div
                    key={dest.id}
                    className="p-4 rounded-lg border border-sandstone bg-surface-container-low flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center shrink-0 border border-sandstone">
                        {dest.channel === 'discord' ? (
                          <span className="text-[18px] font-bold text-[#5865F2]">D</span>
                        ) : dest.channel === 'telegram' ? (
                          <span className="material-symbols-outlined text-[18px] text-[#229ED9]">send</span>
                        ) : (
                          <span className="material-symbols-outlined text-[18px] text-primary">mail</span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-headline-sm text-headline-sm text-on-surface font-medium">
                            {dest.name}
                          </span>
                          <span className={`text-[10px] font-label-sm uppercase px-1.5 py-0.5 rounded font-medium ${
                            dest.is_active ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'
                          }`}>
                            {dest.is_active ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        <span className="font-telemetry-data text-body-sm text-on-surface-variant truncate max-w-sm mt-0.5">
                          {dest.target_destination}
                        </span>

                        {/* Trigger flags */}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {dest.triggers?.on_change && (
                            <span className="text-[10px] bg-surface-container-high px-2 py-0.5 rounded text-on-surface-variant">
                              All Changes
                            </span>
                          )}
                          {dest.triggers?.on_high_importance && (
                            <span className="text-[10px] bg-secondary-container/40 px-2 py-0.5 rounded text-on-secondary-container">
                              High Priority Only
                            </span>
                          )}
                          {dest.triggers?.on_failure && (
                            <span className="text-[10px] bg-error/15 px-2 py-0.5 rounded text-error">
                              Failure Alerts
                            </span>
                          )}
                          {dest.triggers?.keywords?.length > 0 && (
                            <span className="text-[10px] bg-tertiary/15 px-2 py-0.5 rounded text-tertiary">
                              Keywords: {dest.triggers.keywords.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <button
                        onClick={() => handleTest(dest.id)}
                        disabled={testingId === dest.id || !dest.is_active}
                        className="px-3 py-1.5 rounded text-body-sm border border-sandstone bg-surface-container-lowest hover:bg-surface-container text-on-surface flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        type="button"
                      >
                        <span className={`material-symbols-outlined text-[15px] ${testingId === dest.id ? 'animate-spin' : ''}`}>
                          {testingId === dest.id ? 'sync' : 'send'}
                        </span>
                        <span>{testingId === dest.id ? 'Sending...' : 'Test'}</span>
                      </button>

                      <button
                        onClick={() => handleToggleActive(dest)}
                        className="px-2.5 py-1.5 rounded text-body-sm border border-sandstone bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant transition-colors"
                        type="button"
                        title={dest.is_active ? 'Pause' : 'Activate'}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {dest.is_active ? 'pause' : 'play_arrow'}
                        </span>
                      </button>

                      <button
                        onClick={() => handleDelete(dest.id)}
                        className="px-2.5 py-1.5 rounded text-body-sm border border-sandstone bg-surface-container-lowest hover:bg-error/10 text-error transition-colors"
                        type="button"
                        title="Delete"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'new' && (
            <form onSubmit={handleCreateDestination} className="flex flex-col gap-5">
              {formError && (
                <div className="p-3 bg-error/10 border border-error/30 rounded text-error text-body-sm">
                  {formError}
                </div>
              )}

              {/* Channel Selector */}
              <div>
                <label className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider block mb-2 font-semibold">
                  Notification Channel
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'discord', label: 'Discord Webhook', icon: 'forum' },
                    { id: 'telegram', label: 'Telegram Bot', icon: 'send' },
                    { id: 'email', label: 'Email Dispatch', icon: 'mail' }
                  ].map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setFormChannel(ch.id)}
                      className={`p-3 rounded-lg border text-left flex items-center gap-2.5 transition-all ${
                        formChannel === ch.id
                          ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs'
                          : 'border-sandstone bg-surface-container-low text-on-surface hover:bg-surface-container'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">{ch.icon}</span>
                      <span className="font-label-md text-label-md">{ch.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider block mb-1.5 font-semibold">
                  Channel Name / Label
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Engineering Discord Alerts"
                  className="w-full px-3.5 py-2.5 rounded border border-sandstone bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-hidden focus:border-primary"
                />
              </div>

              {/* Target Destination */}
              <div>
                <label className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider block mb-1.5 font-semibold">
                  {formChannel === 'discord'
                    ? 'Discord Webhook URL (HTTPS discord.com required)'
                    : formChannel === 'telegram'
                    ? 'Telegram Chat ID (Numeric)'
                    : 'Recipient Email Address'}
                </label>
                <input
                  type="text"
                  value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  placeholder={
                    formChannel === 'discord'
                      ? 'https://discord.com/api/webhooks/123456789/abcdef...'
                      : formChannel === 'telegram'
                      ? '-100123456789 or 987654321'
                      : 'ops-team@company.com'
                  }
                  className="w-full px-3.5 py-2.5 rounded border border-sandstone bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-hidden focus:border-primary font-telemetry-data"
                  required
                />
                <span className="text-[12px] text-on-surface-variant block mt-1">
                  {formChannel === 'discord'
                    ? 'Strict SSRF validation enforced. Webhook must reside on discord.com.'
                    : formChannel === 'telegram'
                    ? 'Ensure bot has been added to chat/channel.'
                    : 'Dispatches will be delivered with Nordic Atelier templates.'}
                </span>
              </div>

              {/* Triggers */}
              <div className="pt-2 border-t border-sandstone">
                <label className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider block mb-2 font-semibold">
                  Trigger Preferences &amp; Alert Rules
                </label>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 text-body-sm text-on-surface cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formOnChange}
                      onChange={(e) => setFormOnChange(e.target.checked)}
                      className="accent-primary rounded"
                    />
                    <span>Notify on all meaningful content changes</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-body-sm text-on-surface cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formOnHighImportance}
                      onChange={(e) => setFormOnHighImportance(e.target.checked)}
                      className="accent-primary rounded"
                    />
                    <span>Restrict to high-importance changes only</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-body-sm text-on-surface cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formOnFailure}
                      onChange={(e) => setFormOnFailure(e.target.checked)}
                      className="accent-primary rounded"
                    />
                    <span>Notify on persistent monitoring failures (2+ consecutive check drops)</span>
                  </label>
                </div>
              </div>

              {/* Keyword Filters */}
              <div>
                <label className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider block mb-1.5 font-semibold">
                  Keyword Watch List (Optional)
                </label>
                <input
                  type="text"
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                  placeholder="e.g. pricing, terms of service, sale, discontinued"
                  className="w-full px-3.5 py-2.5 rounded border border-sandstone bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-hidden focus:border-primary"
                />
                <span className="text-[12px] text-on-surface-variant block mt-1">
                  Comma-separated keywords or phrases. Triggers when words appear, disappear, or change context.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-sandstone">
                <button
                  type="button"
                  onClick={() => setActiveTab('destinations')}
                  className="px-4 py-2 border border-sandstone text-on-surface rounded font-label-md text-label-md hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-primary text-on-primary rounded font-label-md text-label-md hover:bg-primary-container disabled:opacity-50 transition-colors shadow-xs"
                >
                  {isSubmitting ? 'Registering...' : 'Save Channel Destination'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'deliveries' && (
            <div className="flex flex-col gap-3">
              {deliveries.length === 0 ? (
                <div className="py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[32px] text-tertiary mb-1">history</span>
                  <p className="font-body-sm text-body-sm">No notification dispatches recorded yet.</p>
                </div>
              ) : (
                deliveries.map((del) => (
                  <div
                    key={del.id}
                    className="p-3.5 rounded-lg border border-sandstone bg-surface-container-low flex items-center justify-between gap-3 text-body-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        del.status === 'delivered'
                          ? 'bg-primary'
                          : del.status === 'pending'
                          ? 'bg-tertiary animate-pulse'
                          : 'bg-error'
                      }`}></span>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <strong className="text-on-surface">{del.destination_name || del.channel}</strong>
                          <span className="text-[11px] font-label-sm uppercase bg-surface-container px-2 py-0.5 rounded text-tertiary">
                            {del.trigger_type}
                          </span>
                        </div>
                        <span className="text-[12px] text-on-surface-variant truncate max-w-md mt-0.5">
                          {del.error_message || (del.payload?.title || 'Notification dispatched')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-on-surface-variant font-label-sm text-label-sm shrink-0">
                      <span>{del.sent_at ? new Date(del.sent_at).toLocaleTimeString() : 'Queued'}</span>
                      <span className={`capitalize font-medium ${
                        del.status === 'delivered' ? 'text-primary' : del.status === 'pending' ? 'text-tertiary' : 'text-error'
                      }`}>
                        {del.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
