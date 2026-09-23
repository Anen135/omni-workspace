// Explicit opt-in: node tests/file-preview-live.mjs <public Academy file URL>.
// Uses the real local middleware and remote bytes; never signs in or saves files.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { createMiddleware } from '../server/omni-bridge.mjs';

const url = process.argv[2];
if (!url) throw new Error('Pass a public Academy file URL to test.');
const server = await createServer({ configFile: false, plugins: [{ name: 'preview-test', configureServer(server) {
  server.middlewares.use(createMiddleware({ dispatch: async () => ({ connected: false }) }));
} }], server: { host: '127.0.0.1', port: 5185, strictPort: true, watch: { ignored: ['**/.omni-browser/**'] } } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  page.setDefaultTimeout(60000);
  await page.goto('http://127.0.0.1:5185');
  await page.evaluate(async url => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { FilePreview } = await import('/src/FilePreview.tsx');
    const host = document.createElement('div');
    host.id = 'live-preview-test';
    host.style = 'position:fixed;inset:0;background:white;z-index:99999;overflow:auto;padding:20px';
    document.body.append(host);
    ReactDOM.createRoot(host).render(React.createElement(FilePreview, { url }));
  }, url);
  const button = page.locator('#live-preview-test button');
  await button.hover();
  await page.locator('[role="tooltip"] canvas[data-rendered="true"]').waitFor();
  console.log('Real PDF hover: rendered');
  await button.click();
  await page.locator('#live-preview-test canvas[data-rendered="true"]').first().waitFor();
  assert.ok(await page.locator('#live-preview-test canvas').count() > 0);
  console.log('Real PDF expanded: rendered');
} finally { await browser?.close(); await server.close(); }
