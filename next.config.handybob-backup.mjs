// Temporary diagnostic to confirm Next.js actually loads this config during builds.
if (process.env.FORCE_FAIL_NEXT_CONFIG === "1") {
  throw new Error("FORCE_FAIL_NEXT_CONFIG: test crash from next.config");
}
import "./temp/build-log-test"; // TEMP: verify buildLog runs during Next.js loading; remove once confirmed.
import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

import { buildLog } from "@/utils/debug/buildLog";

const isAnalyze = process.env.ANALYZE === "true";

buildLog("next.config loaded");

const nextConfig: NextConfig = {
  /* config options here */
};

export default withBundleAnalyzer({
  enabled: isAnalyze,
})(nextConfig);
// HandyBob backup of original next.config for build debugging.
