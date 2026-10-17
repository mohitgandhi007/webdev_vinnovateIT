# ==============================================================================
# PagePulse — Digital Observatory & Website Change Monitoring Platform
# Multi-stage Production Dockerfile
# ==============================================================================

# Stage 1: Build the React frontend with Vite
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app

# Copy package manifests and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy frontend source and build
COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

# Stage 2: Production runtime with Playwright browser dependencies
FROM mcr.microsoft.com/playwright:v1.49.0-noble AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV SCREENSHOTS_DIR=/app/uploads/screenshots

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Install Chromium browser binary for Playwright
RUN npx playwright install chromium

# Copy backend application source and database migrations
COPY server/ ./server/

# Copy built frontend assets from builder stage
COPY --from=frontend-builder /app/dist ./dist

# Create upload directories and set permissions
RUN mkdir -p /app/uploads/screenshots && chown -R pwuser:pwuser /app

# Switch to non-root user provided by Playwright image
USER pwuser

# Expose HTTP port
EXPOSE 3001

# Container Healthcheck using native curl or Node HTTP fetch
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health/live').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the unified PagePulse application (API + Scheduler + Static Frontend)
CMD ["node", "server/src/server.js"]
