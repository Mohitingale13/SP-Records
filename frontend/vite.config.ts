import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg", "pwa-192x192.png", "pwa-512x512.png"],
      manifest: {
        id: "/?v=2",
        name: "Shivam Gramin Bigar Sheti Sahakari Patsanstha Maryadit",
        short_name: "Shivam Attendance",
        description: "Digital Attendance Management System for Shivam Patsanstha",
        theme_color: "#00C7C7",
        background_color: "#B8F2EC",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png?v=2",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png?v=2",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png?v=2",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
