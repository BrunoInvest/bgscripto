import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'HFT Bot Terminal',
        short_name: 'HFT Bot',
        description: 'Terminal Glassmorphism de Alta Frequência',
        theme_color: '#1e293b',
        background_color: '#1e293b',
        display: 'standalone',
        icons: [
          {
            src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjM2I4MmY2IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTMgM3YxOGgxOCIvPjxwYXRoIGQ9Im0xOSA5LTUgNS00LTRtLTItMi00IDQiLz48L3N2Zz4=',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjM2I4MmY2IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTMgM3YxOGgxOCIvPjxwYXRoIGQ9Im0xOSA5LTUgNS00LTRtLTItMi00IDQiLz48L3N2Zz4=',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: true, // Bypass explícito para URL dinâmicas do Cloudflare
    proxy: {
      // Redireciona chamadas da API REST para o backend via IPv4 direto para evitar ECONNREFUSED
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
      },
      // Redireciona chamadas de WebSocket
      '/socket.io': {
        target: 'http://127.0.0.1:3002',
        ws: true,
      },
    },
  },
})