import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Allow /doctor path to serve the SPA (both routes handled by index.html)
  server: {
    host: true,
    allowedHosts: true,
    historyApiFallback: true,
  },
})
