import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Keep the production bundle compatible with older Android/desktop Chrome
    // releases while preserving native dynamic imports for route splitting.
    target: ['es2019', 'chrome87'],
    rollupOptions: {
      output: {
        manualChunks: {
          icons: ['lucide-react'],
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
