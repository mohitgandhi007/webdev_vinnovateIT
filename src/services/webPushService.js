import { apiClient } from './apiClient';

/**
 * Helper to convert a URL-safe Base64 string to a Uint8Array
 * required by PushManager.subscribe({ applicationServerKey })
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const STORAGE_KEY = 'pagepulse_web_push_subscription';

export const webPushService = {
  /**
   * Check whether the current browser supports Web Push & Service Workers
   */
  isSupported() {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  },

  /**
   * Get current browser notification permission ('default' | 'granted' | 'denied' | 'unsupported')
   */
  getPermissionState() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  },

  /**
   * Get cached local subscription record
   */
  getStoredSubscription() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /**
   * Check complete push status across browser APIs, service worker, and backend
   */
  async checkStatus() {
    const supported = this.isSupported();
    const permission = this.getPermissionState();

    if (!supported) {
      return {
        supported: false,
        permission: 'unsupported',
        isSubscribed: false,
        activeSubscription: null,
        serverConfigured: false
      };
    }

    let isSubscribed = false;
    let endpoint = null;

    try {
      if (navigator.serviceWorker.controller || (await navigator.serviceWorker.getRegistration())) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          isSubscribed = true;
          endpoint = sub.endpoint;
        }
      }
    } catch (err) {
      console.warn('[WebPush] Error inspecting push manager subscription:', err);
    }

    let serverConfigured = false;
    try {
      const statusRes = await apiClient.get('/notifications/push/status');
      if (statusRes?.success) {
        serverConfigured = statusRes.data.configured;
      }
    } catch {
      // Backend may be offline or in demo mode
    }

    return {
      supported: true,
      permission,
      isSubscribed,
      endpoint,
      storedSubscription: this.getStoredSubscription(),
      serverConfigured
    };
  },

  /**
   * Request permission, register service worker, and subscribe via PushManager
   */
  async subscribe(preferences = { notify_on_change: true, notify_on_failure: false, importance: 'all' }) {
    if (!this.isSupported()) {
      throw new Error('This browser does not support Web Push notifications.');
    }

    // 1. Check existing permission
    if (Notification.permission === 'denied') {
      throw new Error(
        'Notification permission is currently blocked in your browser. Please allow notifications in site settings.'
      );
    }

    // 2. Request user permission following explicit button click
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission was not granted by the browser.');
    }

    // 3. Register or get existing service worker
    let registration;
    try {
      registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    } catch (swErr) {
      throw new Error(`Service worker registration failed: ${swErr.message}`);
    }

    // 4. Retrieve VAPID public key from backend
    let publicKey;
    try {
      const keyRes = await apiClient.get('/notifications/push/public-key');
      publicKey = keyRes?.data?.publicKey;
      if (!publicKey) {
        throw new Error('Server VAPID public key is empty or missing.');
      }
    } catch (err) {
      throw new Error(`Failed to retrieve VAPID public key from server: ${err.message}`);
    }

    // 5. Convert VAPID key and subscribe
    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    let pushSubscription = await registration.pushManager.getSubscription();
    if (!pushSubscription) {
      pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    }

    const subJson = pushSubscription.toJSON();

    // 6. Send subscription payload to backend
    const payload = {
      endpoint: pushSubscription.endpoint,
      keys: {
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth
      },
      preferences,
      userAgent: navigator.userAgent
    };

    const res = await apiClient.post('/notifications/push/subscribe', payload);

    if (res?.success && res.data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(res.data));
      return res.data;
    }

    throw new Error(res?.error?.message || 'Failed to save subscription on server');
  },

  /**
   * Unsubscribe and deactivate subscription on both client and backend
   */
  async unsubscribe() {
    let endpoint = null;

    if (this.isSupported()) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          endpoint = sub.endpoint;
          await sub.unsubscribe();
        }
      } catch (err) {
        console.warn('[WebPush] Error unsubscribing from PushManager:', err);
      }
    }

    const stored = this.getStoredSubscription();
    const id = stored?.id || null;

    try {
      await apiClient.post('/notifications/push/unsubscribe', { endpoint, id });
    } catch (err) {
      console.warn('[WebPush] Error notifying backend of unsubscription:', err);
    } finally {
      localStorage.removeItem(STORAGE_KEY);
    }

    return { success: true };
  },

  /**
   * Update notification alert preferences
   */
  async updatePreferences(preferences) {
    const stored = this.getStoredSubscription();
    if (!stored?.id) {
      throw new Error('No active registered subscription found to update');
    }

    const res = await apiClient.patch('/notifications/push/preferences', {
      id: stored.id,
      preferences
    });

    if (res?.success && res.data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(res.data));
      return res.data;
    }

    throw new Error(res?.error?.message || 'Failed to update preferences');
  },

  /**
   * Trigger an immediate test notification
   */
  async sendTestNotification() {
    const stored = this.getStoredSubscription();
    let endpoint = null;

    if (this.isSupported()) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) endpoint = sub.endpoint;
      } catch {}
    }

    return apiClient.post('/notifications/push/test', {
      id: stored?.id || null,
      endpoint
    });
  }
};
