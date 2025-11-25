import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const isAnalyze = process.env.ANALYZE === "true";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withBundleAnalyzer({
  enabled: isAnalyze,
})(nextConfig);
