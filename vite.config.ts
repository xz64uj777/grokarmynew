import { defineConfig } from "vite";

export default defineConfig({
  base: "/grokarmynew/",
  server: { host: true, port: 5173 },
  build: {
    target: "es2022",
    assetsDir: "assets",
    sourcemap: false,
  },
});
