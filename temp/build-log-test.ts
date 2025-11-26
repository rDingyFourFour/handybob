// Temporary helper to ensure `buildLog` emits during Next.js module loading; remove once diagnostics are confirmed.
import { buildLog } from "../utils/debug/buildLog";

buildLog("TEST: buildLog test file loaded");

export default function BuildLogTest() {
  return "ok";
}
