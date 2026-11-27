/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const vendor = (id: string, pkgs: string) => new RegExp(`[\\\\/]node_modules[\\\\/](${pkgs})[\\\\/]`).test(id);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Match packages by path so shared tiny deps (e.g. clsx, also used by recharts) are
        // not pulled into the charts chunk, which would make every page preload recharts.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (vendor(id, "react|react-dom|scheduler|react-router|react-router-dom")) return "react";
          if (vendor(id, "recharts|recharts-scale|react-smooth|victory-vendor|d3-[^\\\\/]+|decimal\\.js-light|lodash|eventemitter3|fast-equals")) return "charts";
          if (vendor(id, "leaflet|react-leaflet|@react-leaflet")) return "map";
          if (vendor(id, "motion|framer-motion|motion-dom|motion-utils")) return "motion";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    restoreMocks: true,
  },
});
