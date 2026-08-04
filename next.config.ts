import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  // pdf-parse (via pdfjs-dist) dynamically imports its own worker script at
  // runtime. Turbopack ignores the /*webpackIgnore*/ hint on that import and
  // tries to bundle it, producing a missing-chunk error for pdf.worker.mjs.
  // Marking the package external keeps it a plain Node require, so the
  // worker file resolves from node_modules like it does outside Next.js.
  // pdfkit (JD Intelligence Engine's optimized-resume PDF export) has the
  // same class of problem: it reads its built-in AFM font metrics
  // (Helvetica.afm, ...) from a path relative to its own `__dirname` at
  // runtime. Turbopack bundling rewrites that to a virtual path that
  // doesn't exist, producing an ENOENT for the font file even though
  // pdfkit itself installed fine — same fix as pdf-parse/pdfjs-dist below.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "pdfkit"],
  // pdfjs-dist resolves several of its own files at runtime via dynamic/
  // computed paths rather than static imports — its @napi-rs/canvas
  // polyfill (needed for DOMMatrix) via
  // `process.getBuiltinModule("module").createRequire(...)`, and its
  // pdf.worker.mjs (both its own copy and pdf-parse's bundled copies) via a
  // runtime-constructed URL. Both are too indirect for Next.js's build-time
  // file tracer (@vercel/nft) to detect, so they silently get left out of
  // the deployed serverless function on Vercel even though `pdf-parse`/
  // `pdfjs-dist` themselves are present — each missing file surfaces as its
  // own separate runtime error ("DOMMatrix is not defined", then "Cannot
  // find module .../pdf.worker.mjs", ...) since the tracer's gap is the
  // same for all of them. Force-including the two full package trees plus
  // the native binary is the same fix Next.js's own docs recommend for
  // other native/runtime deps like `sharp`.
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/pdfjs-dist/**/*",
      "node_modules/pdf-parse/**/*",
      "node_modules/@napi-rs/canvas/**/*",
      "node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "node_modules/@napi-rs/canvas-linux-arm64-gnu/**/*",
      "node_modules/pdfkit/**/*",
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