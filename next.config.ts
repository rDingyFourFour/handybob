import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

import { buildLog } from "@/utils/buildLog";

const isAnalyze = process.env.ANALYZE === "true";

buildLog("next.config loaded");

const nextConfig: NextConfig = {
  /* config options here */
};

export default withBundleAnalyzer({
  enabled: isAnalyze,
})(nextConfig);
