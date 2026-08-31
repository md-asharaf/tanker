import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_GAME_DEBUG': JSON.stringify(process.env.VITE_GAME_DEBUG || 'false'),
  },
  server: {
    port: 3000
  }
})
