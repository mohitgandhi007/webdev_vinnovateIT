import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { env, config } from './config/env.js';
import { notFoundHandler, errorHandler } from './middleware/error-handler.js';

import healthRoutes from './routes/health.routes.js';
import monitorsRoutes from './routes/monitors.routes.js';
import snapshotsRoutes from './routes/snapshots.routes.js';
import changesRoutes from './routes/changes.routes.js';
import insightsRoutes from './routes/insights.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import demoRoutes from './routes/demo.routes.js';
import { rssController } from './controllers/rss.controller.js';

export function createApp() {
  const app = express();

  // Basic security and parsing middlewares
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001'
      ];
      
      if (env.NODE_ENV === 'development' || allowedOrigins.includes(origin) || config.corsOrigin === '*') {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in dev/testing/demo
    },
    credentials: true
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Static uploads directory for screenshots
  app.use('/uploads', express.static(config.screenshotsDir ? path.dirname(config.screenshotsDir) : path.resolve(process.cwd(), 'uploads')));

  // Dedicated demo store endpoints (for reliable, repeatable demonstrations)
  app.use('/demo', demoRoutes);
  app.use('/api/demo', demoRoutes);

  // API Route Mounts
  app.use('/api/health', healthRoutes);
  app.use('/api/monitors', monitorsRoutes);
  app.use('/api/snapshots', snapshotsRoutes);
  app.use('/api/changes', changesRoutes);
  app.use('/api/insights', insightsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.get('/api/feeds/monitors/:id.xml', rssController.getFeed);

  // Production Frontend Serving (Serves Vite dist/ build if present)
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));

    // Client-side SPA routing fallback
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/demo')) {
        return next();
      }
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        return res.sendFile(indexHtml);
      }
      next();
    });
  }

  // 404 handler for unmatched API routes
  app.use(notFoundHandler);

  // Global structured error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
