import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Hosted runners need more time for cold PDF/native-module imports and
    // durable encrypted SQLite fixtures than the local development machine.
    testTimeout: process.env.CI ? 30_000 : 5_000,
  },
});
