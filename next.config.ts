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
};

const withMDX = createMDX({});

export default withMDX(nextConfig);