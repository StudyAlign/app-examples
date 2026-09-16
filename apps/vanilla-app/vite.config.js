import { defineConfig } from "vite";

// Served under /vanilla/ behind the reverse proxy. See the React app's config
// for why base + the HMR client port matter.
export default defineConfig(() => {
  const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT
    ? Number(process.env.VITE_HMR_CLIENT_PORT)
    : undefined;

  return {
    base: "/vanilla/",
    server: {
      host: true,
      port: 80,
      hmr: hmrClientPort ? { clientPort: hmrClientPort } : undefined,
      allowedHosts: true,
    },
  };
});
