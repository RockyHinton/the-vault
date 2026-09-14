import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client/src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/support/setup-env.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    globals: false,
    fileParallelism: false,
    maxWorkers: 1,
  },
});