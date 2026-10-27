import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {},
  preload: {
    build: {
      rolldownOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
          audio: resolve("src/preload/audio.ts"),
        },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    plugins: [react()],
    server: { host: "127.0.0.1" },
    build: {
      minify: true,
      rolldownOptions: {
        input: {
          index: resolve("src/renderer/index.html"),
          audio: resolve("src/renderer/audio.html"),
        },
      },
    },
  },
});
