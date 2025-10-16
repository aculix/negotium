import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  publicDir: 'assets',
  server: {
    port: 3000,
    open: true
  },
  optimizeDeps: {
    exclude: ['@sveltejs/vite-plugin-svelte']
  }
})
