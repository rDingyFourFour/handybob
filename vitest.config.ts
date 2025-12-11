import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["tests/setup/supabaseEnv.ts"],
    globals: true,
    environment: "happy-dom",
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
