import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// `base: './'` : l'appli fonctionne à la racine d'un domaine comme dans un sous-dossier
// (GitHub Pages, par exemple). Le routage utilise le hash (#/...) : aucune règle serveur à prévoir.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'TTFL 76ersFR',
        short_name: 'TTFL 76ers',
        description: "Joueurs disponibles de chaque membre de l'équipe pour chaque soirée TTFL",
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0b1f3a',
        background_color: '#0b1f3a',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // Le script de relevé est téléchargé par l'extension (Tampermonkey…), pas utilisé par l'appli : ni en cache hors ligne,
        // ni remplacé par la page d'accueil quand on ouvre son adresse.
        globIgnores: ['**/*.user.js'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\.user\.js$/],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
