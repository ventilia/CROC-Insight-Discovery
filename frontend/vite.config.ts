import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const backend = fileURLToPath(new URL("../backend", import.meta.url));
  const {
    CROC_DEMO_API_PASSWORD: password,
    CROC_DEMO_EDITOR_PASSWORD: editorPassword,
  } = loadEnv(mode, backend, "CROC_");
  const target = "http://127.0.0.1:8080";
  const auth = editorPassword
    ? "demo-editor:" + editorPassword
    : password
      ? "demo-reader:" + password
      : undefined;
  const proxy = {
    "/api": {
      target,
      ...(auth ? { auth } : {}),
    },
  };

  return {
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      cors: false,
      proxy,
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
      cors: false,
      proxy,
    },
  };
});
