import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-three': ['three', '@react-three/fiber'],
          'vendor-react': ['react', 'react-dom'],
          'vendor-state': ['zustand'],
        },
      },
    },
  },
});

