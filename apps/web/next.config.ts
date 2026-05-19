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
};

export default nextConfig;
