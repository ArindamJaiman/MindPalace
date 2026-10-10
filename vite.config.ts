import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'zustand'],
          motion: ['framer-motion'],
          editor: ['@uiw/react-codemirror', '@codemirror/lang-markdown', '@codemirror/autocomplete', '@codemirror/language', '@codemirror/view', '@codemirror/state'],
          markdown: ['marked', 'dompurify', 'd3-force'],
        },
      },
    },
  },
});
