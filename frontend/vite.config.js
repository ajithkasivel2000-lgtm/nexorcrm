import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend the dev server forwards to; API_TARGET overrides (e.g. a test backend).
const API = process.env.API_TARGET || 'http://localhost:7012'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  /* jspdf and jspdf-autotable are only reached through a dynamic import, in
     the PDF export and the Leads document. The dev server therefore does not
     know about them at startup: the first download makes it discover them,
     re-run dependency optimisation, and re-hash every pre-bundled module — so
     the requests already in flight fail with
     "504 (Outdated Optimize Dep)" and the download throws.
     Naming them here pre-bundles them with everything else, so nothing is
     discovered late. Their own dependencies (html2canvas, dompurify, canvg)
     come along with them. */
  optimizeDeps: {
    include: ['jspdf', 'jspdf-autotable'],
  },

  server: {
    proxy: {
      '/api': API,
      // Live updates (Socket.IO) — a websocket, so it needs ws: true.
      '/socket.io': { target: API, ws: true },
    }
  }
});
