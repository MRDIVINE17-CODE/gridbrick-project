import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the FastAPI server runs on :8000; Vite proxies /api to it so the
// browser sees one origin, exactly like production (Vercel rewrite / Docker).
export default defineConfig({
  plugins: [react()],
  build: {
    // Recharts is most of the bundle; one ~200 kB gzip chunk is fine for this app.
    chunkSizeWarningLimit: 800,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
