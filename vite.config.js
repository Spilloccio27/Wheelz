import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    // Recharts pesa da solo più di mezzo megabyte non compresso (160 kB
    // gzippati) e sta già in un chunk separato dal resto: la soglia di
    // avviso predefinita di 500 kB segnalerebbe una cosa che sappiamo e che
    // non possiamo ridurre senza cambiare libreria di grafici.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'charts'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('react-dom') || /node_modules[/\\]react[/\\]/.test(id) || id.includes('scheduler')) {
            return 'react'
          }
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
