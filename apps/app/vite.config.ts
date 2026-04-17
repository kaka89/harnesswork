import os from "node:os";
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import devtools from "solid-devtools/vite";
import solid from "vite-plugin-solid";

const portValue = Number.parseInt(process.env.PORT ?? "", 10);
const devPort = Number.isFinite(portValue) && portValue > 0 ? portValue : 5173;
const allowedHosts = new Set<string>();
const envAllowedHosts = process.env.VITE_ALLOWED_HOSTS ?? "";

const addHost = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return;
  allowedHosts.add(trimmed);
};

envAllowedHosts.split(",").forEach(addHost);
addHost(process.env.OPENWORK_PUBLIC_HOST ?? null);
const hostname = os.hostname();
addHost(hostname);
const shortHostname = hostname.split(".")[0];
if (shortHostname && shortHostname !== hostname) {
  addHost(shortHostname);
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    devtools({
      autoname: true,
      locator: {
        targetIDE: "vscode",
        jsxLocation: true,
        componentLocation: true,
      },
    }),
    solid(),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: '0.0.0.0', // 绑定所有接口（IPv4+IPv6），确保 localhost/127.0.0.1 均可访问
    port: devPort,
    strictPort: true,
    ...(allowedHosts.size > 0 ? { allowedHosts: Array.from(allowedHosts) } : {}),
  },
  build: {
    target: "esnext",
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/app/components/cockpit/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}"],
    },
  },
});
