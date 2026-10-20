import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';

// Render the same source vector used by the header/sidebar into distributable assets.
const root = fileURLToPath(new URL('../', import.meta.url));
const { outputFiles } = await build({
  absWorkingDir: root, entryPoints: ['src/components/ui/BrandMark.tsx'],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const module = { exports: {} };
new Function('require', 'module', 'exports', outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const svg = renderToStaticMarkup(createElement(module.exports.BrandMark, { size: 128 }));
await writeFile(new URL('../public/brand.svg', import.meta.url), svg + '\n');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>body{margin:0}svg{display:block}</style>${svg}`);
  await page.locator('svg').screenshot({ path: fileURLToPath(new URL('../public/icon.png', import.meta.url)), omitBackground: true });
} finally { await browser.close(); }
console.log('Generated public/brand.svg and 128px public/icon.png from BrandMark.');
