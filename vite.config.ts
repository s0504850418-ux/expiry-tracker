import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "ניהול תאריכי תפוגה",
        short_name: "תפוגה",
        description: "מעקב תאריכי תפוגה למוצרים מוכנים במטבח",
        lang: "he",
        dir: "rtl",
        theme_color: "#1F4E79",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
});
