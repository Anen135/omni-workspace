import { build } from 'esbuild';
await build({ entryPoints: ['desktop/omni-agent.mjs'], bundle: true, format: 'iife', globalName: 'OmniDesktopAgent', platform: 'browser', target: 'chrome120', outfile: 'desktop/generated/agent.js', minify: true });
