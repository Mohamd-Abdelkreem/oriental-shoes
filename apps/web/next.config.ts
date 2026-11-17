import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env["ORIENTAL_DEPLOYMENT_BUILD"] === "standalone"
    ? {
        output: "standalone" as const,
        outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
      }
    : {}),
  poweredByHeader: false,
  typedRoutes: true,
  reactCompiler: true,
  transpilePackages: ["@template/contracts"],
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
};

export default nextConfig;
