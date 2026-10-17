import crypto from 'node:crypto';
import { monitorRepository } from '../repositories/monitor.repository.js';
import { changeRepository } from '../repositories/change.repository.js';
import { config } from '../config/env.js';

/**
 * PagePulse RSS Feed Service
 * 
 * Access-Control Model:
 * Each monitor's RSS feed is protected by an unguessable 256-bit access token
 * (?token=<64-hex-chars>), or authenticated via workspace ownership headers.
 * 
 * Security & Privacy Principles:
 * 1. Scope: Feeds are strictly per-monitor. There is no global feed that exposes
 *    other users' monitors or global change history.
 * 2. Privacy: Sourced strictly from detected changes; zero private user information
 *    (emails, passwords, webhook secrets, workspace keys) is included.
 * 3. Identifiers: Item GUIDs are opaque, deterministic URN hashes that do not
 *    leak internal database sequential IDs or structures.
 * 4. Token Lifecycle: Unguessable tokens are generated cryptographically and can be
 *    rotated or revoked at any time by the monitor owner.
 * 5. Caching: Full ETag and Last-Modified support with HTTP 304 Not Modified responses.
 */

export function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function wrapCdata(str) {
  if (!str) return '';
  // Safe CDATA escaping: replace any embedded ]]> with ]]]]><![CDATA[>
  const safeStr = String(str).replace(/]]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${safeStr}]]>`;
}

export function generateOpaqueGuid(changeId) {
  const hash = crypto.createHash('sha256').update(`pp:change:${changeId}`).digest('hex').slice(0, 32);
  return `urn:pagepulse:change:${hash}`;
}

export const rssService = {
  /**
   * Authorize and fetch data needed for monitor RSS feed
   */
  async getFeedData(monitorId, { token = null, workspaceId = null } = {}) {
    const monitor = await monitorRepository.findById(monitorId);
    if (!monitor) {
      return { authorized: false, statusCode: 404, error: 'Monitor not found' };
    }

    // Access control evaluation:
    // Option A: Token-based access (RSS reader with unguessable token)
    let isAuthorized = false;
    let authMethod = 'none';

    if (token && typeof token === 'string') {
      const cleanToken = token.trim();
      if (monitor.feed_token && monitor.feed_token === cleanToken && monitor.feed_enabled !== false) {
        isAuthorized = true;
        authMethod = 'feed_token';
      } else {
        return {
          authorized: false,
          statusCode: 401,
          error: 'Invalid, revoked, or disabled RSS feed token'
        };
      }
    }

    // Option B: Workspace-based authenticated access (UI/API client)
    if (!isAuthorized && workspaceId) {
      if (monitor.workspace_id === workspaceId) {
        isAuthorized = true;
        authMethod = 'workspace_auth';
      } else {
        return {
          authorized: false,
          statusCode: 403,
          error: 'Access denied: monitor belongs to another workspace'
        };
      }
    }

    if (!isAuthorized) {
      return {
        authorized: false,
        statusCode: 401,
        error: 'RSS feed is protected. A valid access token or workspace authorization is required.'
      };
    }

    // Fetch actual stored change records for this monitor
    const changes = await changeRepository.findChangesForFeed(monitor.id, 50);

    // Compute caching headers
    const latestChange = changes[0];
    const latestTimestamp = latestChange?.detected_at 
      ? new Date(latestChange.detected_at).toUTCString()
      : new Date(monitor.updated_at || monitor.created_at).toUTCString();

    const etagRaw = `${monitor.id}-${changes.length}-${latestChange?.id || 'none'}-${latestChange?.detected_at || 'none'}`;
    const etag = `"${crypto.createHash('sha1').update(etagRaw).digest('hex')}"`;

    return {
      authorized: true,
      authMethod,
      monitor,
      changes,
      etag,
      lastModified: latestTimestamp
    };
  },

  /**
   * Build valid, standards-compliant RSS 2.0 XML document
   */
  buildRssXml(monitor, changes, { selfUrl = '', webBaseUrl = '' } = {}) {
    const frontendBase = webBaseUrl || config.corsOrigin || 'http://localhost:5173';
    const monitorWebUrl = `${frontendBase}/compare/${monitor.id}`;
    const feedSelfUrl = selfUrl || `${frontendBase}/api/monitors/${monitor.id}/rss.xml`;

    const lastBuildDate = changes.length > 0
      ? new Date(changes[0].detected_at).toUTCString()
      : new Date(monitor.updated_at || monitor.created_at).toUTCString();

    const itemsXml = changes.map(change => {
      const itemTitle = change.ai_headline || change.title || 'Page Content Alteration Detected';
      const changeWebUrl = `${frontendBase}/compare/${monitor.id}?changeId=${change.id}`;
      const guid = generateOpaqueGuid(change.id);
      const pubDate = new Date(change.detected_at).toUTCString();

      // Clean concise summary (strictly no private user data)
      let summaryText = change.ai_summary || change.description || 'Webpage content alterations detected.';
      if (change.dom_nodes_modified) {
        summaryText += ` (${change.dom_nodes_modified} DOM nodes altered)`;
      }

      const category = change.ai_category || change.change_type || 'content';

      return `    <item>
      <title>${escapeXml(itemTitle)}</title>
      <link>${escapeXml(changeWebUrl)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeXml(category)}</category>
      <description>${wrapCdata(summaryText)}</description>
    </item>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>PagePulse — ${escapeXml(monitor.name)} Changes</title>
    <link>${escapeXml(monitorWebUrl)}</link>
    <description>Detected webpage content alterations for ${escapeXml(monitor.name)} (${escapeXml(monitor.url)})</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>PagePulse RSS Engine v1.0</generator>
    <atom:link href="${escapeXml(feedSelfUrl)}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;
  },

  /**
   * Rotate access token for a monitor
   */
  async rotateToken(monitorId, workspaceId = null) {
    const updated = await monitorRepository.rotateFeedToken(monitorId, workspaceId);
    if (!updated) {
      throw new Error('Monitor not found or unauthorized');
    }
    return {
      feedToken: updated.feed_token,
      feedEnabled: updated.feed_enabled,
      feedUrl: this.constructFeedUrl(updated.id, updated.feed_token)
    };
  },

  /**
   * Revoke access token for a monitor
   */
  async revokeToken(monitorId, workspaceId = null) {
    const updated = await monitorRepository.revokeFeedToken(monitorId, workspaceId);
    if (!updated) {
      throw new Error('Monitor not found or unauthorized');
    }
    return {
      feedToken: null,
      feedEnabled: false
    };
  },

  /**
   * Get feed status and URL for a monitor
   */
  async getFeedMeta(monitorId, workspaceId = null) {
    const monitor = await monitorRepository.findById(monitorId, workspaceId);
    if (!monitor) {
      throw new Error('Monitor not found or unauthorized');
    }

    let token = monitor.feed_token;
    // If no token exists yet, auto-provision one
    if (!token) {
      const res = await this.rotateToken(monitorId, workspaceId);
      token = res.feedToken;
    }

    return {
      feedEnabled: monitor.feed_enabled !== false,
      feedToken: token,
      feedUrl: this.constructFeedUrl(monitor.id, token)
    };
  },

  constructFeedUrl(monitorId, token) {
    const port = config.port || 3001;
    const base = config.isProd ? config.corsOrigin : `http://localhost:${port}`;
    return `${base}/api/monitors/${monitorId}/rss.xml?token=${token}`;
  }
};
