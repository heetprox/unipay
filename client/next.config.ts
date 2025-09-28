import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Specify Bun.js as the package manager for Vercel deployment
  packageManager: "bun",
};

export default nextConfig;
