# PagePulse — Deployment & Live Demonstration Guide

This guide details the production architecture, environment configuration, database lifecycle, build and execution commands, health probes, and live demonstration workflow for **PagePulse**.

---

## 1. Deployment Architecture

PagePulse consists of four core operational components:
1. **React 18 SPA Frontend**: Nordic Atelier user interface compiled with Vite.
2. **Node.js Express API**: Central REST API and static asset server.
3. **Persistent Playwright Worker**: Background scheduler polling monitors and launching headless Chromium for full-page visual captures, DOM extraction, and visual diffing.
4. **PostgreSQL 16 Database**: Relational datastore for workspaces, monitors, canonical targets, snapshots, detected changes, AI insights, and notifications.

```
                      ┌───────────────────────────────────────────────┐
                      │              PagePulse Platform               │
                      │                                               │
   [ Web Browser ] ───┼──► [ Reverse Proxy / Cloud Load Balancer ]     │
                      │                   │                           │
                      │                   ▼                           │
                      │        [ Node.js Express 4.21 ]                │
                      │        ├── Static Frontend (dist/)            │
                      │        ├── REST API (/api/*)                  │
                      │        ├── Demo Fixture (/demo/*)             │
                      │        └── Screenshot Delivery (/uploads/*)   │
                      │                   │                           │
                      │                   ▼                           │
                      │        [ Persistent Worker ]                  │
                      │        └── Headless Chromium (Playwright)    │
                      │                   │                           │
                      └───────────────────┼───────────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
      [ PostgreSQL 16 DB ]                           [ Persistent Disk Volume ]
      (Relational Data, Migrations)                  (/app/uploads/screenshots)
```

### Why Playwright Cannot Run on Static Hosts
Static frontend hosting providers (e.g. Cloudflare Pages, GitHub Pages, Vercel static output) only serve pre-rendered client files. Browser automation engines require:
- A Linux environment with native OS libraries (`libnss3`, `libatk-bridge2.0-0`, `libgbm1`, `libdrm2`, `libxcomposite1`, etc.).
- A long-running persistent Node.js event loop for timed cadence polling (`scheduler.start()`).
- Writable, persistent local disk or volume storage for screenshots.

### Recommended Deployment Model: Unified Container
To minimize operational complexity, PagePulse packages the compiled React frontend, Express API, Playwright browser engine, and scheduler into a single unified Docker container (`Dockerfile`). In this model:
- The Express server serves both the static frontend (`dist/`) and the API routes (`/api/*`), eliminating cross-origin CORS issues and DNS latency.
- Headless Chromium runs natively inside the container.
- Screenshots are saved to an attached persistent volume (`/app/uploads/screenshots`).
- An external managed PostgreSQL instance (e.g., AWS RDS, Supabase, Neon) or Docker Compose PostgreSQL container stores relational state.

---

## 2. Environment Variables

Store production configuration in environment variables or cloud secret managers. Never commit production `.env` files into version control.

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Runtime mode: `production`, `development`, or `test`. |
| `PORT` | Yes | `3001` | HTTP port for API and frontend static server. |
| `DATABASE_URL` | Yes | `postgresql://...` | Connection URI for PostgreSQL database. *(Auto-falls back to in-memory DB if absent in dev).* |
| `DATABASE_POOL_MIN` | No | `2` | Minimum connection pool size. |
| `DATABASE_POOL_MAX` | No | `10` | Maximum connection pool size. |
| `DATABASE_SSL` | No | `false` | Set to `true` or `require` when connecting to AWS RDS, Supabase, or Neon. |
| `SCREENSHOTS_DIR` | Yes | `/app/uploads/screenshots` | Persistent path where full-page PNG screenshots are saved. |
| `STORAGE_DRIVER` | No | `local` | Storage driver (`local` disk or volume). |
| `SNAPSHOT_RETENTION_DAYS` | No | `30` | Age in days before unreferenced historical snapshots are pruned. |
| `KEEP_MIN_SNAPSHOTS` | No | `5` | Minimum number of snapshots to retain per target regardless of age. |
| `GEMINI_API_KEY` | No | `""` | Google Gemini API key from AI Studio. *(If absent, deterministic AI fallback is used).* |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Supported Gemini model identifier (e.g., `gemini-2.5-flash`, `gemini-1.5-pro`). |
| `ALLOW_LOCAL_FIXTURES` | Security | `false` | Set to `false` in production. Set to `true` only for local demos to monitor `localhost`. |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origins if frontend and API are hosted on separate domains. |
| `APP_BASE_URL` | No | `http://localhost:3001` | Public domain of the application (used in notification links). |
| `TELEGRAM_BOT_TOKEN` | Optional | `""` | Telegram Bot Token for delivery to Telegram chats/channels. |
| `DISCORD_WEBHOOK_URL`| Optional | `""` | Default Discord webhook URL for change notification alerts. |
| `SMTP_HOST` | Optional | `""` | SMTP hostname for email notifications (e.g., `smtp.sendgrid.net`). |
| `SMTP_PORT` | Optional | `587` | SMTP port (e.g. `587` for TLS, `465` for SSL). |
| `SMTP_USER` | Optional | `""` | SMTP authentication username. |
| `SMTP_PASS` | Optional | `""` | SMTP authentication password. |
| `FROM_EMAIL` | Optional | `alerts@pagepulse.app` | Verified sender email address. |

---

## 3. Database & Migrations

### Safe Migration Lifecycle
PagePulse includes a zero-downtime, transactional migration runner in `server/scripts/migrate.js`:
- Tracks applied versions in the `schema_migrations` table.
- Executes each SQL migration inside an explicit transaction (`BEGIN` ... `COMMIT`).
- Rolls back (`ROLLBACK`) safely if any statement fails.
- Never drops existing tables or deletes production data during migrations.

### Initializing Production Database
```bash
# 1. Apply schema migrations
npm run server:migrate

# 2. (Optional) Seed initial demo workspace
npm run server:seed
```

### Snapshot Retention & Storage Cleanup
To prevent unbounded disk consumption from screenshots, PagePulse provides a dedicated cleanup script:
```bash
npm run server:clean
```
**Safety Guarantees of Storage Cleaner**:
- **Baseline Protection**: Never deletes the latest snapshot for any active canonical target.
- **Audit Integrity**: Never deletes snapshots referenced by `detected_changes` records.
- **Minimum History**: Preserves at least `KEEP_MIN_SNAPSHOTS` (default: 5) per target.
- **Orphan Cleanup**: Deletes unreferenced image files only if older than a 1-hour grace period to protect active in-flight worker jobs.

---

## 4. Build and Start Commands

All commands match the package manifests in `package.json`:

| Action | Command | Purpose |
| :--- | :--- | :--- |
| **Install Dependencies** | `npm ci` | Installs exact dependencies from `package-lock.json`. |
| **Install Playwright Browsers**| `npx playwright install chromium` | Downloads headless Chromium browser binaries. |
| **Run Frontend Locally** | `npm run dev` | Starts Vite React dev server on `http://localhost:5173`. |
| **Run Backend Locally** | `npm run server:dev` | Starts Express API and worker in watch mode on port `3001`. |
| **Run Migrations** | `npm run server:migrate` | Applies pending database migrations safely. |
| **Run Storage Cleanup** | `npm run server:clean` | Prunes expired snapshots and cleans orphaned screenshots. |
| **Run Automated Tests** | `npm run server:test` | Runs full test suite (141+ tests across all 12 phases). |
| **Build Production Frontend** | `npm run build` | Compiles React assets into `/dist` (gzip-optimized). |
| **Start Production Server** | `npm run server:start` | Launches Express API, persistent worker, and serves `/dist`. |
| **Toggle Demo Store** | `npm run demo:toggle` | Switches demo store between ₹999 and ₹1,199. |

---

## 5. Deployment Health Probes

PagePulse provides three standardized health and readiness endpoints for cloud orchestrators (Docker, Kubernetes, AWS ECS, Render):

### 1. Detailed Diagnostic (`GET /api/health`)
Returns comprehensive operational status:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2026-10-17T07:55:51.721Z",
  "uptime_seconds": 1240,
  "services": {
    "api": "online",
    "database": {
      "status": "connected",
      "latency_ms": 2
    },
    "worker": {
      "status": "running",
      "poll_interval_ms": 15000
    },
    "storage": {
      "status": "ready",
      "directory": "/app/uploads/screenshots"
    },
    "gemini": {
      "status": "configured",
      "model": "gemini-2.5-flash"
    }
  },
  "memory": {
    "rss_mb": 118,
    "heap_used_mb": 42
  }
}
```

### 2. Orchestrator Liveness Probe (`GET /api/health/live`)
Returns HTTP 200 `{ "status": "alive" }` if the process is responsive. Used to restart dead containers.

### 3. Load Balancer Readiness Probe (`GET /api/health/ready`)
Returns HTTP 200 `{ "status": "ready", "database": "connected" }` when PostgreSQL is connected and capable of accepting traffic. Returns HTTP 503 if the database is unreachable.

---

## 6. Docker Deployment (Recommended)

### Using Docker Compose
1. Ensure Docker and Docker Compose are installed.
2. Configure `.env` from template:
   ```bash
   cp .env.example .env
   ```
3. Start the application and database:
   ```bash
   docker compose up -d --build
   ```
4. Verify running services:
   ```bash
   docker compose ps
   curl http://localhost:3001/api/health
   ```
5. Open `http://localhost:3001` in your browser.

---

## 7. Repeatable Live Demonstration Workflow

This demonstration verifies **real, end-to-end change detection**, visual diff generation, and AI intelligence using the built-in Nordic Atelier demo store fixture.

### Prerequisites
Ensure backend server is running with local fixture support enabled:
```bash
ALLOW_LOCAL_FIXTURES=true npm run server:start
```

### Step-by-Step Demo Script

1. **Open PagePulse**:
   Navigate to `http://localhost:5173` (or `http://localhost:3001` in production container). The Nordic Atelier dark observatory dashboard loads with live system metrics.

2. **Add Controlled Test Webpage**:
   - Click **+ New Monitor** in the top navigation.
   - Enter Target Name: `Nordic Atelier Stoneware Store`
   - Enter Target URL: `http://localhost:3001/demo/store`
   - Select Cadence: `15m`
   - Select Monitoring Mode: `Visual & Text (Both)`
   - Click **Create Monitor**.

3. **Run Initial Check**:
   - Click **Check Now** on the newly created monitor.
   - The persistent worker claims the job, launches headless Chromium, renders the page, captures a full-page screenshot, and establishes the initial baseline snapshot.

4. **Show Baseline Snapshot**:
   - Open the monitor detail.
   - Notice the status badge is **Healthy (Unchanged)**.
   - Under **Baseline Snapshot**, verify the extracted content shows **₹999 per piece** and the title is **"Atelier Nordic Stoneware — Minimalist Ceramics"**.

5. **Change Test Webpage Content**:
   - In a terminal or secondary browser tab, trigger the price change:
     ```bash
     npm run demo:toggle
     ```
     *(Or send `POST http://localhost:3001/api/demo/toggle`)*.
   - The demo store price immediately updates from **₹999** to **₹1,199** ("Autumn Release Price").

6. **Run Next Check**:
   - Click **Check Now** again on the monitor.
   - The worker fetches the updated page, detects a hash mismatch, normalizes the extracted DOM, and triggers the deterministic text diff and visual diff engine.

7. **Show Detected Text Difference**:
   - A new change event appears with title: **"Updated content (+12 / -12 lines)"**.
   - Expand the diff viewer to show the exact inline diff:
     - `- ₹999 per piece · Standard Studio Price`
     - `+ ₹1,199 per piece · Autumn Release Price`
     - `- Summer Porcelain & Stoneware`
     - `+ Autumn Stoneware Collection`

8. **Open Visual Compare**:
   - Click **Inspect Visual Compare** (`/compare/:id`).
   - Switch between **Side-by-Side**, **Overlay Diff**, and **Heatmap Bounding Boxes**.
   - Notice the highlighted visual bounding box highlighting the revised price badge and product description.

9. **Display Gemini AI Summary**:
   - View the AI Change Summary card.
   - If `GEMINI_API_KEY` is provided, Gemini 2.5 Flash analyzes the visual and textual changes, categorizing the change as **Pricing & Inventory Alert** with an executive summary:
     > *"Product pricing increased by 20% from ₹999 to ₹1,199 alongside a collection transition to the limited Autumn release with only 3 units remaining."*
   - If AI key is unset, the deterministic intelligence engine displays a structured change summary.

10. **Show History and Overview**:
    - Navigate back to **History**: The change event is logged with timestamp, duration, and review status.
    - Toggle **Mark as Reviewed**: The badge switches instantly to **Reviewed**.
    - Navigate to **Overview**: Total Monitors, Active Baseline count, and 24h Change Events count reflect the live detection.

---

## 8. Deployment Status & Known Limitations

### Current Deployment Status
- **Architecture**: Complete and verified.
- **Frontend Build**: Vite production build (`dist/`) completes cleanly (1.33s).
- **Backend**: Express API serves static frontend assets with SPA client routing fallback and screenshot static streaming.
- **Worker**: Persistent Playwright scheduler with concurrency locking, exponential backoff, and host rate throttling.
- **Automated Tests**: 152 automated tests across 54 suites pass with 100% success rate (`npm run server:test`).
- **Containerization**: `Dockerfile` and `docker-compose.yml` configured and ready for production deployment.

### Known Limitations
- **Local Fixture Security**: In public production deployments, `ALLOW_LOCAL_FIXTURES` must remain `false` to block internal loopback (127.0.0.1) requests and enforce enterprise SSRF protection.
- **Playwright Memory Footprint**: Headless Chromium consumes approximately 150MB–250MB RAM per concurrent browser instance. Ensure production containers have at least 1GB to 2GB allocated RAM.
- **Gemini Free Quota**: When using the free Gemini tier (15 requests/minute), high-frequency change monitoring may encounter rate limits; PagePulse automatically falls back to deterministic change categorization when Gemini limits are reached.
