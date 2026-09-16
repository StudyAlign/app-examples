import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served under /react/ behind the reverse proxy, so every asset URL and the
// dev HMR websocket must carry that base. VITE_HMR_CLIENT_PORT is the public
// proxy port (set by the dev compose overlay) so live reload works through it.
export default defineConfig(() => {
  const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT
    ? Number(process.env.VITE_HMR_CLIENT_PORT)
    : undefined;

  return {
    base: "/react/",
    plugins: [react()],
    server: {
      host: true,
      port: 80,
      // Behind the proxy the browser connects to the proxy port, not 80.
      hmr: hmrClientPort ? { clientPort: hmrClientPort } : undefined,
      // The Host header arriving through the proxy is the public host.
      allowedHosts: true,
    },
  };
});
