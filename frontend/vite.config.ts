import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const backend = fileURLToPath(new URL("../backend", import.meta.url));
  const { CROC_DEMO_API_PASSWORD: password } = loadEnv(mode, backend, "CROC_");
  const proxy = {
    "/api": {
      target: "http://127.0.0.1:8080",
      ...(password ? { auth: "demo-reader:" + password } : {}),
    },
  };

  return {
    server: { host: "127.0.0.1", port: 5173, strictPort: true, cors: false, proxy },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true, cors: false, proxy },
  };
});
