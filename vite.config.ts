import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false },
  build: {
    rollupOptions: {
      // One page per edition, plus the Gateway that lets you choose between them.
      input: {
        gateway: resolve(__dirname, 'index.html'),
        forge: resolve(__dirname, 'forge/index.html'),
        terminal: resolve(__dirname, 'terminal/index.html'),
      },
      output: {
        // Vendor chunks by package so each page only downloads what it uses.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\/]node_modules[\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\/]/.test(id)) return 'react';
          if (/framer-motion|motion-dom|motion-utils/.test(id)) return 'motion';
          if (/[\/](gsap|@gsap)[\/]/.test(id)) return 'gsap';
          if (/@codemirror|@lezer|@uiw|crelt|style-mod|w3c-keyname/.test(id)) return 'editor';
          if (/marked|dompurify|d3-/.test(id)) return 'markdown';
          if (/@supabase/.test(id)) return 'supabase';
          if (/lucide-react/.test(id)) return 'icons';
          return 'vendor';
        },
      },
    },
  },
});
