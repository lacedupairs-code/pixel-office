import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // served at /classic/ since the 3D Agent Office took over / (2026-10-03)
  base: "/classic/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});

