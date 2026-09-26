import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse needs @napi-rs/canvas to polyfill DOMMatrix/Path2D/ImageData
  // when running in a serverless Node runtime (Vercel) — without this,
  // extracting text from real PDFs throws "DOMMatrix is not defined".
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
};

export default nextConfig;
