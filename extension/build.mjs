import { build as bundle } from 'esbuild';
import { build } from 'vite';
import { copyFile } from 'node:fs/promises';
await build({ mode: 'extension' });
await bundle({ entryPoints: ['extension/background.mjs'], bundle: true, format: 'esm', platform: 'browser', target: 'chrome120', outfile: 'dist-extension/background.js' });
await bundle({ entryPoints: ['desktop/omni-agent.mjs'], bundle: true, format: 'iife', globalName: 'OmniDesktopAgent', platform: 'browser', target: 'chrome120', outfile: 'dist-extension/agent.js' });
await copyFile('extension/manifest.json', 'dist-extension/manifest.json');
await copyFile('LICENSE', 'dist-extension/LICENSE');
await copyFile('extension/README.md', 'dist-extension/README.md');
