import http from 'node:http';

export function createTestFixtureServer() {
  let changeVersion = 1;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Allow tests to dynamically set change version
    if (url.searchParams.has('setVersion')) {
      changeVersion = parseInt(url.searchParams.get('setVersion'), 10);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ changeVersion }));
    }

    switch (url.pathname) {
      // 1. Unchanged page
      case '/unchanged':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Atelier Nordic</title></head>
            <body>
              <main>
                <h1>Atelier Nordic Stoneware</h1>
                <p>Curated stoneware ceramics and minimalist vessels.</p>
              </main>
            </body>
          </html>
        `);

      // 2. Page whose text changes
      case '/text-change': {
        const v = url.searchParams.get('v') || String(changeVersion);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        if (v === '1') {
          return res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Atelier Lookbook</title></head>
              <body>
                <main>
                  <h1>Summer Ceramics Collection</h1>
                  <p>Light terracotta and porcelain table pieces.</p>
                </main>
              </body>
            </html>
          `);
        } else {
          return res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Atelier Lookbook</title></head>
              <body>
                <main>
                  <h1>Autumn Stoneware Collection</h1>
                  <p>Sculptural dark vessels and walnut accents.</p>
                  <p>Limited release: 50 pieces available.</p>
                </main>
              </body>
            </html>
          `);
        }
      }

      // 3. JavaScript-rendered page
      case '/js-rendered':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Dynamic App</title></head>
            <body>
              <div id="root">Loading...</div>
              <script>
                setTimeout(() => {
                  document.getElementById('root').innerHTML = '<h2>Hydrated Client Product Catalog</h2><p>Items rendered via JavaScript</p>';
                }, 100);
              </script>
            </body>
          </html>
        `);

      // 4. Page with a selected CSS region
      case '/selected-css':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Targeted Region</title></head>
            <body>
              <header><p>Ignored Banner Noise: Promo 123</p></header>
              <section id="pricing-tier" class="price-box">
                <h2>Studio Subscription</h2>
                <span class="price">$49 / month</span>
              </section>
              <footer><p>Ignored Footer: Copyright 2026</p></footer>
            </body>
          </html>
        `);

      // 5. Page with missing selector
      case '/missing-selector':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`
          <!DOCTYPE html>
          <html>
            <body><h1>No Matching Target</h1><p>Regular content</p></body>
          </html>
        `);

      // 6. Page that times out
      case '/timeout':
        // Intentionally hold response
        return setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Delayed response');
          }
        }, 35000);

      // 7. Page that returns an HTTP error
      case '/http-error':
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Internal Server Error 500');

      // 8. Page that redirects
      case '/redirect':
        res.writeHead(302, { 'Location': '/unchanged' });
        return res.end();

      // 9. Page that displays a challenge-like screen
      case '/challenge':
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Just a moment...</title></head>
            <body>
              <h1>Cloudflare Turnstile</h1>
              <p>Verify you are human before proceeding to access denied.</p>
            </body>
          </html>
        `);

      // 10. Page with volatile content
      case '/volatile':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <main>
                <h1>Stable Product Name</h1>
                <p>Consistent product description.</p>
                <div class="volatile-timestamp">Timestamp: ${Date.now()}</div>
              </main>
            </body>
          </html>
        `);

      // 11. Controlled Pricing Change Page (₹999 to ₹1,199)
      case '/pricing-change': {
        const v = url.searchParams.get('v') || String(changeVersion);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        const price = v === '2' ? '₹1,199' : '₹999';
        return res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Studio Membership</title></head>
            <body>
              <main>
                <h1>Atelier Nordic Studio Membership</h1>
                <p class="description">Unlimited studio access and ceramic firing.</p>
                <div class="pricing-box">
                  <span class="price">${price} per month</span>
                </div>
              </main>
            </body>
          </html>
        `);
      }

      // 12. Controlled Noisy Page with volatile timestamps and ads
      case '/noisy-page': {
        const v = url.searchParams.get('v') || '1';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        const desc = v === '2' 
          ? 'Sculptural dark vessels and walnut accents.' 
          : 'Handcrafted stoneware ceramics and vessels.';
        return res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Product Catalog</title></head>
            <body>
              <main>
                <h1>Nordic Stoneware Catalog</h1>
                <p class="catalog-desc">${desc}</p>
                <div class="timestamp">Rendered at ${Date.now()}-${Math.random()}</div>
                <div class="ad-banner">Promotional Banner #${Math.floor(Math.random() * 1000)}</div>
                <div class="live-counter">Visitor count: ${Math.floor(Math.random() * 500)}</div>
              </main>
            </body>
          </html>
        `);
      }

      default:
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not Found');
    }
  });

  return {
    server,
    start() {
      return new Promise((resolve) => {
        // Listen on loopback ephemeral port
        server.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          const baseUrl = `http://127.0.0.1:${port}`;
          resolve({ port, baseUrl });
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        server.close(resolve);
      });
    },
    setVersion(v) {
      changeVersion = v;
    }
  };
}
