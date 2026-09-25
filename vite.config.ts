import { defineConfig } from 'vite';
import { omniBridge } from './server/omni-bridge.mjs';

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/omni-workspace/' : '/',
  build: { outDir: mode === 'extension' ? 'dist-extension' : 'dist' },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.omni-browser/**', '**/.agent-notes/**'] },
    watch: {
      ignored: ['**/.omni-browser/**', '**/.agent-notes/**']
    }
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  plugins: ['pages', 'extension'].includes(mode) ? [] : [omniBridge()],
}));
