import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Port fixe : évite que Vite bascule sur un autre port quand le
    // précédent est encore occupé (ex: redémarrage rapide), ce qui
    // désynchronise le client HMR déjà connecté sur l'ancien port.
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Isole les grosses dépendances PDF dans leurs propres chunks,
        // chargés uniquement quand une page d'outil qui en a besoin est
        // ouverte (voir React.lazy dans App.jsx) — le chunk initial reste
        // léger pour un premier chargement rapide.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('pdfjs-dist')) return 'vendor-pdfjs'
          if (id.includes('pdf-lib')) return 'vendor-pdf-lib'
          if (id.includes('jszip')) return 'vendor-jszip'
          if (id.includes('mammoth')) return 'vendor-mammoth'
          if (id.includes('/docx/')) return 'vendor-docx'
          if (id.includes('xlsx')) return 'vendor-xlsx'
          if (id.includes('tesseract.js')) return 'vendor-tesseract'
          if (id.includes('qpdf-wasm')) return 'vendor-qpdf'
          if (id.includes('lamejs')) return 'vendor-lamejs'
          if (id.includes('gif.js')) return 'vendor-gifjs'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
            return 'vendor-react'
          }
        },
      },
    },
  },
})
