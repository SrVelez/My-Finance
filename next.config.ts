import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O e2e usa outro diretório de build para não colidir com um `next dev` aberto.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: { tsconfigPath: process.env.NEXT_TSCONFIG ?? "tsconfig.json" },
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  async headers() {
    return [
      {
        // O service worker nunca pode ficar preso em cache do navegador.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
