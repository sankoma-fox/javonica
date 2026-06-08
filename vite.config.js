import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Cloudflare Pages: dist/ に出力。functions/ はPages Functionsとして配信
// 公開用 index.html と 管理用 admin.html の2エントリをビルド
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8788",
    },
  },
});
