import { defineConfig } from 'vite';
import { omniBridge } from './server/omni-bridge.mjs';

export default defineConfig({
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.omni-browser/**'] },
    watch: {
      ignored: ['**/.omni-browser/**']
    }
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  plugins: [omniBridge()],
});
