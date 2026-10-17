import { Router } from 'express';

const router = Router();

// In-memory demo state for live demonstrations
let currentDemoVersion = 1;

/**
 * Returns the HTML for the Nordic Atelier Demo Store
 */
function renderDemoStoreHtml(version) {
  const isV2 = version === 2;

  const title = isV2 
    ? 'Atelier Nordic Stoneware — Autumn Edition' 
    : 'Atelier Nordic Stoneware — Minimalist Ceramics';

  const price = isV2 ? '₹1,199' : '₹999';
  const priceSubtitle = isV2 ? 'per piece · Autumn Release Price' : 'per piece · Standard Studio Price';

  const collectionName = isV2 
    ? 'Autumn Stoneware Collection' 
    : 'Summer Porcelain & Stoneware';

  const description = isV2
    ? 'Sculptural dark vessels and warm walnut accents. Each piece is hand-thrown on the potter’s wheel in our Copenhagen atelier and fired at 1,280°C for exceptional durability.'
    : 'Handcrafted stoneware ceramics and porcelain table pieces. Curated minimalist vessels designed for tranquil morning rituals and tactile warmth.';

  const stockBadge = isV2
    ? '<span style="background: rgba(217, 119, 6, 0.15); color: #d97706; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Limited: 3 Pieces Remaining</span>'
    : '<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">In Stock · Ready to Dispatch</span>';

  const specifications = isV2
    ? `
      <li><strong>Glaze:</strong> Matte Basalt Charcoal with satin speckled iron rim</li>
      <li><strong>Volume:</strong> 340ml / 11.5 fl oz</li>
      <li><strong>Material:</strong> High-fire refractory stoneware clay</li>
      <li><strong>Edition:</strong> Limited Autumn Batch #09 (Numbered 1-50)</li>
    `
    : `
      <li><strong>Glaze:</strong> Raw Birch Oatmeal with natural unglazed foot</li>
      <li><strong>Volume:</strong> 320ml / 10.8 fl oz</li>
      <li><strong>Material:</strong> Iron-rich Nordic stoneware clay</li>
      <li><strong>Edition:</strong> Studio Permanent Collection Batch #08</li>
    `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      --bg: #111418;
      --card-bg: #181d24;
      --border: rgba(255, 255, 255, 0.08);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #d97706;
    }
    body {
      margin: 0;
      padding: 40px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      background-color: var(--bg);
      color: var(--text-main);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .container {
      max-width: 680px;
      width: 100%;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 36px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    .tagline {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin: 0 0 16px 0;
      color: #ffffff;
    }
    .price-container {
      margin: 24px 0;
      padding: 16px 20px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .price-value {
      font-size: 32px;
      font-weight: 700;
      color: #ffffff;
      font-feature-settings: "tnum";
    }
    .price-sub {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .description {
      font-size: 15px;
      line-height: 1.6;
      color: #d1d5db;
      margin-bottom: 24px;
    }
    ul.specs {
      list-style: none;
      padding: 0;
      margin: 24px 0;
      border-top: 1px solid var(--border);
      padding-top: 16px;
    }
    ul.specs li {
      font-size: 13px;
      line-height: 1.8;
      color: var(--text-muted);
    }
    ul.specs li strong {
      color: #e5e7eb;
    }
    .demo-bar {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px dashed var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #6b7280;
    }
    .toggle-btn {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      font-weight: 500;
    }
    .toggle-btn:hover {
      background: #1d4ed8;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="tagline">Atelier Nordic · Craftsmanship & Design</div>
    <h1 id="product-title">${title}</h1>
    <div>${stockBadge}</div>

    <div class="price-container" id="price-section">
      <div>
        <div class="price-value" id="current-price">${price}</div>
        <div class="price-sub">${priceSubtitle}</div>
      </div>
      <div>
        <span style="font-size: 13px; color: var(--text-muted);">Collection: ${collectionName}</span>
      </div>
    </div>

    <p class="description" id="product-description">${description}</p>

    <ul class="specs" id="product-specs">
      ${specifications}
    </ul>

    <div class="demo-bar">
      <span>PagePulse Test Page (Version ${version} Active)</span>
      <form method="POST" action="/demo/toggle" style="margin: 0;">
        <button type="submit" class="toggle-btn">Switch to Version ${isV2 ? '1 (₹999)' : '2 (₹1,199)'}</button>
      </form>
    </div>
  </div>
</body>
</html>`;
}

// 1. Render the demo page
router.get('/store', (req, res) => {
  const versionParam = req.query.v;
  const version = (versionParam === '1' || versionParam === '2')
    ? parseInt(versionParam, 10)
    : currentDemoVersion;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderDemoStoreHtml(version));
});

// 2. Toggle demo version state
router.post('/toggle', (req, res) => {
  currentDemoVersion = currentDemoVersion === 1 ? 2 : 1;
  
  // If request accepts JSON, is called via /api, or sent with application/json
  const isApi = req.originalUrl.startsWith('/api') || 
                req.baseUrl.startsWith('/api') || 
                req.xhr || 
                req.headers.accept?.includes('application/json');

  if (isApi) {
    return res.json({
      success: true,
      currentVersion: currentDemoVersion,
      price: currentDemoVersion === 2 ? '₹1,199' : '₹999',
      message: `Toggled to version ${currentDemoVersion}`
    });
  }

  // Otherwise redirect back to the store
  res.redirect('/demo/store');
});

// 3. Reset to baseline version 1
router.post('/reset', (req, res) => {
  currentDemoVersion = 1;
  res.json({
    success: true,
    currentVersion: 1,
    price: '₹999',
    message: 'Reset to baseline version 1'
  });
});

// 4. Get current demo version status
router.get('/status', (req, res) => {
  res.json({
    version: currentDemoVersion,
    price: currentDemoVersion === 2 ? '₹1,199' : '₹999',
    url: '/demo/store'
  });
});

export default router;
