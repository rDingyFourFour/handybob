import { describe, expect, it } from "vitest";

import { getPublicBookingUrlForSlug } from "@/lib/domain/workspaces/publicBookingUrl";

describe("getPublicBookingUrlForSlug", () => {
  it("returns the canonical booking path", () => {
    expect(getPublicBookingUrlForSlug("workspace-slug")).toBe("/public/bookings/workspace-slug");
  });

  it("trims and lowercases the slug", () => {
    expect(getPublicBookingUrlForSlug("  My-Slug  ")).toBe("/public/bookings/my-slug");
  });
});
