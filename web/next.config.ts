import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: webRoot,
  },
  async rewrites() {
    // In development the backend runs on 3001. On Vercel set ATLAS_API_URL to
    // your deployed backend URL (server-side only — not NEXT_PUBLIC).
    // The browser always calls /api/* on the same origin; Next.js proxies it.
    const backendUrl = (process.env.ATLAS_API_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
