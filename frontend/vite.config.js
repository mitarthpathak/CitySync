import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Styling goes through postcss.config.mjs (@tailwindcss/postcss), same as the original landing page.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: { port: 5173 },
  // three.js is its own lazy chunk (only the globe screen loads it); ~500 kB is expected.
  build: { chunkSizeWarningLimit: 700 },
})
