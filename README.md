# PagePulse — Digital Observatory & Website Change Monitoring

PagePulse is a modern, full-stack website observatory and visual change monitoring platform. It combines Playwright-driven browser captures, pixel-accurate visual diffing, semantic text comparison, Gemini AI change intelligence, numerical value tracking, multi-channel alerts, and standards-compliant RSS 2.0 feeds.

Built with a **Nordic Atelier** design aesthetic using React, Tailwind CSS, Node.js Express, and PostgreSQL.

---

## Key Features

- **Autonomous Monitoring & Diff Engine**:
  - Headless Chromium powered by Playwright with concurrency pool management.
  - Multi-mode comparisons: Semantic text diffs, visual side-by-side overlays, and DOM structure analysis.
  - Granular CSS selector scoping, element ignore rules, and noise thresholds.
- **Gemini AI Change Intelligence**:
  - Automatically synthesizes visual and DOM diffs into executive headlines, business impact inferences, and structured takeaways.
  - Graceful fallback: Full deterministic intelligence remains 100% operational even without an API key.
- **Numerical Metric Tracking**:
  - CSS selector-based numerical value extraction (e.g., product prices, inventory counts).
  - Time-series tracking with interactive trend charts and snapshot linkages.
- **Multi-Channel Alert Delivery**:
  - Real-time notifications via Discord webhooks, Telegram, and Email (SMTP).
  - Configurable alert rules: High-importance changes, keyword triggers, and failure alerts with retry exponential backoff.
- **Secure RSS 2.0 Change Feeds**:
  - Standards-compliant RSS 2.0 feed per monitor.
  - 256-bit unguessable access tokens with one-click rotation and revocation.
  - Stable opaque GUIDs (`urn:pagepulse:change:...`), accurate RFC 822 timestamps, and HTTP 304 caching (`ETag` / `Last-Modified`).
- **Enterprise-Grade Security & SSRF Protection**:
  - Multi-layer defense against SSRF, DNS rebinding, private IP ranges (RFC 1918), cloud metadata endpoints (`169.254.169.254`), and malicious subresource redirects.
- **Zero-Config In-Memory Fallback**:
  - If an external PostgreSQL server is not connected, PagePulse automatically boots an in-memory relational PostgreSQL engine with all migrations applied for instant local demonstrations.

---

## Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │    PagePulse React Frontend (Vite)      │
                      │    Nordic Atelier Minimalist Design     │
                      └────────────────────┬────────────────────┘
                                           │ HTTP / REST
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │      Node.js / Express Backend          │
                      │  - Monitoring Scheduler & Worker Pool   │
                      │  - SSRF Interception Layer              │
                      │  - Playwright Headless Browser Pool     │
                      │  - Gemini AI Intelligence Client        │
                      │  - Multi-Channel Notification Dispatcher│
                      │  - RSS 2.0 Feed Generator               │
                      └────────────────────┬────────────────────┘
                                           │
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │      PostgreSQL Relational Storage      │
                      │  (or In-Memory Engine Fallback)         │
                      └─────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher
- **PostgreSQL** *(Optional)*: `v14+` (PagePulse will automatically use an in-memory relational engine if PostgreSQL is not running)

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/mohitgandhi007/webdev_vinnovateIT.git
cd webdev_vinnovateIT
npm install
```

Install the Playwright browser binaries for website screenshot capture:

```bash
npx playwright install chromium
```

### 2. Environment Configuration

Copy the sample environment file:

```bash
cp .env.example .env
```

Edit `.env` to configure your settings (all settings have sensible defaults for local development):
- Set `GEMINI_API_KEY` to enable Google Gemini AI change intelligence (optional).
- Set `DATABASE_URL` if connecting to an external PostgreSQL instance (optional).

### 3. Running Locally

#### Development Mode (Frontend & Backend Separate)

Run the backend API and monitoring engine:
```bash
npm run server:dev
```

In a separate terminal, run the Vite frontend:
```bash
npm run dev
```

Open your browser at **`http://localhost:5173`**.

#### Production Mode (Unified Single Process)

Build the frontend and start the combined production server:
```bash
npm run build
npm start
```

Access the application at **`http://localhost:3001`**.

---

## Docker Deployment

PagePulse includes a multi-stage `Dockerfile` and `docker-compose.yml` pre-configured with all Playwright OS dependencies and PostgreSQL.

To build and run with Docker Compose:

```bash
docker-compose up -d --build
```

The application will be live at `http://localhost:3001`.

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite React frontend in development mode on port 5173 |
| `npm run server:dev` | Starts the Node.js API server with file watching on port 3001 |
| `npm run build` | Compiles the production bundle to `dist/` |
| `npm start` | Runs the production backend (serves API and compiled frontend) |
| `npm run server:migrate` | Runs SQL migration scripts against the configured PostgreSQL database |
| `npm run server:test` | Executes the complete backend test suite (185+ automated tests) |
| `npm run demo:toggle` | Toggles the built-in local store demo target between versions |

---

## Test Suite

PagePulse features comprehensive automated test coverage across all subsystems:

```bash
npm run server:test
```

Includes test suites for:
- Standards-compliant RSS 2.0 Feeds and access token rotation
- SSRF prevention and Playwright network redirect interception
- Gemini AI structured response schema parsing and fallbacks
- Multi-destination notification delivery with retry logic
- Numerical metric series extraction and calculation
- Baseline preservation during target website downtime

---

## License

This project is licensed under the MIT License.
