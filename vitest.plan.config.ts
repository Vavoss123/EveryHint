import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/plan.integration.ts"],
    environment: "node",
    testTimeout: 15000,
    hookTimeout: 10000,
  },
});
