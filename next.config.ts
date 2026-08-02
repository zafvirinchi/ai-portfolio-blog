import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  // pdf-parse (via pdfjs-dist) dynamically imports its own worker script at
  // runtime. Turbopack ignores the /*webpackIgnore*/ hint on that import and
  // tries to bundle it, producing a missing-chunk error for pdf.worker.mjs.
  // Marking the package external keeps it a plain Node require, so the
  // worker file resolves from node_modules like it does outside Next.js.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // pdfjs-dist loads its @napi-rs/canvas polyfill (needed for DOMMatrix,
  // used both for text extraction and getImage()) via
  // `process.getBuiltinModule("module").createRequire(...)` — too dynamic
  // for Next.js's build-time file tracer (@vercel/nft) to detect, so its
  // platform-specific native binary silently gets left out of the deployed
  // serverless function on Vercel, and require("@napi-rs/canvas") fails at
  // runtime. Force-including it here is the same fix Next.js's own docs
  // recommend for other native/runtime deps like `sharp`.
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/@napi-rs/canvas/**/*",
      "node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "node_modules/@napi-rs/canvas-linux-arm64-gnu/**/*",
    ],
  },
  images: {
    // next/image refuses to load from any host not explicitly listed here —
    // needed for extracted interview diagrams, which are public URLs served
    // from the project's Supabase Storage bucket (interview-diagrams).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);