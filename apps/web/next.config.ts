import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev access from 127.0.0.1 / cloudflared tunnels in addition to
  // the default `localhost`. Without this, Next 16 blocks HMR + bundle
  // requests for cross-origin loopback aliases, which breaks hydration.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.trycloudflare.com",
    "snappeal.theailab.dev",
  ],

  // PR 2 (knowledge base): the generate-stream + generate routes read
  // markdown precedents / code briefs / council briefs from the
  // `apps/web/knowledge/**` folder at runtime via node:fs/promises.
  // Without an explicit trace include, Vercel's function bundler doesn't
  // know to ship those files alongside the route, and reads fail in
  // production with ENOENT. The patterns are relative to this file
  // (apps/web/next.config.ts).
  outputFileTracingIncludes: {
    "/api/generate-stream": ["./knowledge/**/*"],
    "/api/generate": ["./knowledge/**/*"],
  },
};

export default nextConfig;
