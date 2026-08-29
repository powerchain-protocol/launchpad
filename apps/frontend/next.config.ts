import type { NextConfig } from "next";

function apiOrigin(): string {
  const value = process.env.POWERCHAIN_API_INTERNAL_URL?.trim() || "http://127.0.0.1:3001";
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("POWERCHAIN_API_INTERNAL_URL must use http or https.");
  return url.origin;
}

const proxiedReadRoutes = [
  "/api/v1/rpc/health",
  "/api/v1/programs/verify",
  "/api/v1/token/market",
  "/api/v1/token/mint/:mint",
  "/api/v1/solana/overview",
  "/api/v1/solana/programs",
  "/api/v1/solana/market",
  "/api/v1/solana/assets/:mint",
  "/api/v1/powerpay/overview",
  "/api/v1/powerpay/rpc",
  "/api/v1/powerpay/programs",
  "/api/v1/powerpay/market",
  "/api/v1/powerpay/mint/:mint",
  "/api/v1/creator/:wallet",
  "/api/v1/sui/overview",
  "/api/v1/sui/packages",
  "/api/v1/sui/market",
  "/api/v1/sui/assets/:coinType",
  "/api/solana/overview",
  "/api/token/market",
  "/api/assets/:mint",
  "/api/sui/overview",
  "/api/sui/packages",
  "/api/sui/market",
  "/api/sui/assets/:coinType",
] as const;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const origin = apiOrigin();
    return proxiedReadRoutes.map((source) => ({ source, destination: `${origin}${source}` }));
  },
  async headers() {
    return [{ source: "/(launch|powerpay|claims|wallet|dashboard)/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }];
  },
};
export default nextConfig;
