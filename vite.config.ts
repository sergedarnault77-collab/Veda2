import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/** Relative base is required for Capacitor WKWebView asset URLs; keep "/" for Vercel web. */
const base = process.env.VEDA_CAPACITOR === "1" ? "./" : "/";

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**", "tests/**", "node_modules/**"],
  },
});
