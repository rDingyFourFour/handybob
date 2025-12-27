import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const bookingPagePath = "app/public/bookings/[slug]/page.tsx";

describe("public booking page async params guard", () => {
  it("unwraps params before accessing slug", async () => {
    const contents = await readFile(bookingPagePath, "utf8");

    expect(contents).not.toContain("params.slug");
    expect(contents).toContain("await params");
    expect(contents).toContain("const { slug");
  });
});
