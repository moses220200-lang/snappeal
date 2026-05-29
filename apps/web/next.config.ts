import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev access from 127.0.0.1 / cloudflared tunnels in addition to
  // the default `localhost`. Without this, Next 16 blocks HMR + bundle
  // requests for cross-origin loopback aliases, which breaks hydration.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.trycloudflare.com",
    "parkingrabbit.theailab.dev",
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

  // /admin/wiki iframes the MkDocs Material build under the SAME ORIGIN
  // (`/wiki/`) so it works through the Cloudflare quick tunnel without
  // needing a separate wiki-tunnel URL. The Caddyfile in the repo
  // handles this for `http://localhost:8080` + the Cloudflare-fronted
  // setup; THIS rewrite covers the bypass-Caddy case (hitting the
  // Next.js dev server directly on `:3001`) so /wiki/* still resolves
  // to the MkDocs container.
  //
  // `WIKI_PROXY_TARGET` defaults to the docker-compose host binding
  // (`http://127.0.0.1:8800`). When Next.js itself runs in docker
  // alongside the wiki, override to `http://parkingrabbit-wiki:8000`.
  async rewrites() {
    const wikiTarget =
      process.env.WIKI_PROXY_TARGET ?? "http://127.0.0.1:8800";
    return [
      { source: "/wiki", destination: `${wikiTarget}/` },
      { source: "/wiki/:path*", destination: `${wikiTarget}/:path*` },
    ];
  },
};

export default nextConfig;
