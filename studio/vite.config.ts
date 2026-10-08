import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative base so the same build works at a domain root, in a sub-folder, and inside the Android app.
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Car Studio",
        short_name: "Car Studio",
        description: "Shoot, cut out and stage vehicle photos.",
        theme_color: "#1a1a1a",
        background_color: "#1a1a1a",
        display: "standalone",
        orientation: "any",
        start_url: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The 27 MB AI runtime is cached on first use instead, so server-only users never download it.
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith(".wasm"),
            handler: "CacheFirst",
            options: { cacheName: "ai-wasm", expiration: { maxEntries: 4 } },
          },
          {
            // AI runtime files fetched from CDN on first use.
            urlPattern: ({ url }) => url.hostname === "cdn.jsdelivr.net",
            handler: "CacheFirst",
            options: { cacheName: "ai-runtime", expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
  ],
  worker: { format: "es" },
  server: { host: true, proxy: { "/api": "http://localhost:8787" } },
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
});
