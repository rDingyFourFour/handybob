import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const projectRoot = process.cwd();
const statusRoutePath = join(projectRoot, "app/api/twilio/calls/status/route.ts");
const inboundRoutePath = join(projectRoot, "app/(app)/twilio/voice/inbound/route.ts");

describe("Twilio route handler use server guard", () => {
  it("status callback route is routable and does not declare use server", () => {
    const statusRouteContents = readFileSync(statusRoutePath, "utf8");
    const signatureHeaderDeclarationMatches =
      statusRouteContents.match(/const\s+TWILIO_SIGNATURE_HEADER\s*=/g) ?? [];

    expect(statusRouteContents).not.toContain("use server");
    expect(statusRouteContents).toContain("export const runtime");
    expect(statusRouteContents).toContain("export const dynamic");
    expect(statusRouteContents).toContain("export async function POST");
    expect(signatureHeaderDeclarationMatches).toHaveLength(1);
  });

  it("inbound voice route does not declare use server", () => {
    if (!existsSync(inboundRoutePath)) {
      return;
    }

    const inboundRouteContents = readFileSync(inboundRoutePath, "utf8");
    expect(inboundRouteContents).not.toContain("use server");
  });
});
