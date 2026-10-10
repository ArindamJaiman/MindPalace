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
        manualChunks: {
          react: ['react', 'react-dom', 'zustand'],
          motion: ['framer-motion'],
          gsap: ['gsap', '@gsap/react'],
          editor: ['@uiw/react-codemirror', '@codemirror/lang-markdown', '@codemirror/autocomplete', '@codemirror/language', '@codemirror/view', '@codemirror/state'],
          markdown: ['marked', 'dompurify', 'd3-force'],
        },
      },
    },
  },
});
