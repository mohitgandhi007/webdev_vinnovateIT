import { rssService, escapeXml } from '../services/rss.service.js';

export const rssController = {
  /**
   * Serve RSS 2.0 XML feed for a monitor
   * Publicly accessible with valid unguessable feed token or authorized workspace
   */
  async getFeed(req, res) {
    try {
      const monitorId = req.params.id;
      const token = req.query.token || req.headers['x-feed-token'] || null;
      const workspaceId = req.headers['x-workspace-id'] || null;

      const feedData = await rssService.getFeedData(monitorId, { token, workspaceId });

      if (!feedData.authorized) {
        res.set('Content-Type', 'application/xml; charset=utf-8');
        return res.status(feedData.statusCode).send(
          `<?xml version="1.0" encoding="UTF-8"?>\n<error><code>${feedData.statusCode}</code><message>${escapeXml(feedData.error)}</message></error>`
        );
      }

      // Check Conditional Request Headers for Caching
      res.set('ETag', feedData.etag);
      res.set('Last-Modified', feedData.lastModified);
      res.set('Cache-Control', 'private, max-age=60, must-revalidate');

      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && (ifNoneMatch === feedData.etag || ifNoneMatch === `W/${feedData.etag}`)) {
        return res.status(304).end();
      }

      const ifModifiedSince = req.headers['if-modified-since'];
      if (ifModifiedSince) {
        const clientDate = new Date(ifModifiedSince);
        const serverDate = new Date(feedData.lastModified);
        if (!isNaN(clientDate.getTime()) && clientDate >= serverDate) {
          return res.status(304).end();
        }
      }

      const selfUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const xml = rssService.buildRssXml(feedData.monitor, feedData.changes, { selfUrl });

      res.set('Content-Type', 'application/rss+xml; charset=utf-8');
      return res.status(200).send(xml);
    } catch (err) {
      console.error('[RSS Controller Error]', err);
      res.set('Content-Type', 'application/xml; charset=utf-8');
      return res.status(500).send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<error><code>500</code><message>Failed to generate RSS feed</message></error>`
      );
    }
  },

  /**
   * Get feed configuration and token metadata (Authenticated UI / API)
   */
  async getFeedMeta(req, res) {
    try {
      const monitorId = req.params.id;
      const workspaceId = req.headers['x-workspace-id'] || null;
      const meta = await rssService.getFeedMeta(monitorId, workspaceId);

      return res.status(200).json({
        success: true,
        data: meta
      });
    } catch (err) {
      const statusCode = err.message.includes('not found') ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message
      });
    }
  },

  /**
   * Rotate access token for a monitor (Authenticated)
   */
  async rotateToken(req, res) {
    try {
      const monitorId = req.params.id;
      const workspaceId = req.headers['x-workspace-id'] || null;
      const result = await rssService.rotateToken(monitorId, workspaceId);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      const statusCode = err.message.includes('not found') ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message
      });
    }
  },

  /**
   * Revoke access token for a monitor (Authenticated)
   */
  async revokeToken(req, res) {
    try {
      const monitorId = req.params.id;
      const workspaceId = req.headers['x-workspace-id'] || null;
      const result = await rssService.revokeToken(monitorId, workspaceId);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      const statusCode = err.message.includes('not found') ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message
      });
    }
  }
};
