import { defineConfig } from "vitest/config";
export default defineConfig({
  server: { host: "127.0.0.1", port: 5173, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  test: { environment: "jsdom", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
