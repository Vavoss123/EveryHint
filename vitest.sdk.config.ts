import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/claude-sdk.integration.ts"],
    environment: "node",
    testTimeout: 45000,
    hookTimeout: 10000,
  },
});
