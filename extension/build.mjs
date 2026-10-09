import { build as bundle } from 'esbuild';
import { copyFile, cp, mkdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(projectRoot, 'dist-extension');
if (dirname(outputDir) !== projectRoot || basename(outputDir) !== 'dist-extension') throw new Error('Unexpected extension output directory.');
process.chdir(projectRoot);
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const contentStyles = {
  name: 'content-styles',
  setup(build) {
    build.onResolve({ filter: /\.css(?:\?inline)?$/ }, args => ({ path: resolve(args.resolveDir, args.path.replace(/\?inline$/, '')), namespace: args.path.endsWith('?inline') ? 'shadow-css' : 'skip-css' }));
    build.onLoad({ filter: /.*/, namespace: 'skip-css' }, () => ({ contents: '', loader: 'js' }));
    build.onLoad({ filter: /.*/, namespace: 'shadow-css' }, async args => {
      const css = (await readFile(args.path, 'utf8')).replace(/@import\s+url\([^)]*\)\s*;/g, '').replace(/:root|(?<![\w-])body(?![\w-])/g, ':host');
      return { contents: `export default ${JSON.stringify(css)}`, loader: 'js' };
    });
    // PDF.js uses the bundled isolated-world handler, without page CSP or
    // cross-origin extension worker imports.
    build.onResolve({ filter: /pdf\.worker\.min\.mjs\?url$/ }, () => ({ path: 'pdf-worker-url', namespace: 'inline-worker' }));
    build.onLoad({ filter: /.*/, namespace: 'inline-worker' }, () => ({ contents: 'export default ""', loader: 'js' }));
  },
};
await bundle({ entryPoints: ['src/extension-entry.tsx'], bundle: true, format: 'iife', platform: 'browser', target: 'chrome120', outfile: 'dist-extension/content.js', define: { 'import.meta.env.MODE': '"extension"', 'process.env.NODE_ENV': '"production"' }, plugins: [contentStyles], minify: true });
await bundle({ entryPoints: ['extension/background.mjs'], bundle: true, format: 'esm', platform: 'browser', target: 'chrome120', outfile: 'dist-extension/background.js' });
await bundle({ entryPoints: ['desktop/omni-agent.mjs'], bundle: true, format: 'iife', globalName: 'OmniDesktopAgent', platform: 'browser', target: 'chrome120', outfile: 'dist-extension/agent.js' });
await cp('public', 'dist-extension', { recursive: true });
await copyFile('extension/manifest.json', 'dist-extension/manifest.json');
await copyFile('extension/launcher.html', 'dist-extension/index.html');
await copyFile('extension/launcher.js', 'dist-extension/launcher.js');
await copyFile('LICENSE', 'dist-extension/LICENSE');
await copyFile('extension/README.md', 'dist-extension/README.md');
