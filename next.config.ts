import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse needs @napi-rs/canvas to polyfill DOMMatrix/Path2D/ImageData
  // when running in a serverless Node runtime (Vercel) — without this,
  // extracting text from real PDFs throws "DOMMatrix is not defined".
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  // @napi-rs/canvas's native binary is only reached via a dynamic
  // require() (through pdf-parse/worker), so Next's build-time file
  // tracer can't follow it statically and silently drops it from the
  // deployed function unless force-included here.
  outputFileTracingIncludes: {
    "/api/resume/upload": ["./node_modules/@napi-rs/**/*"],
  },
};

export default nextConfig;
