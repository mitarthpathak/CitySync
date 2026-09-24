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
  // The globe (react-globe.gl + three.js) is its own lazy chunk that only /app loads; ~2 MB is expected.
  build: { chunkSizeWarningLimit: 2100 },
})
