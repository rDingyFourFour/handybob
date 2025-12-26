import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("public invoice server boundary guard", () => {
  it("keeps use server out of the public invoice domain helper", () => {
    const filePath = join(process.cwd(), "lib/domain/invoices/publicInvoice.ts");
    const contents = readFileSync(filePath, "utf8");
    expect(contents).not.toContain("use server");
  });

  it("keeps use server scoped to the send invoice action", () => {
    const filePath = join(process.cwd(), "app/(app)/invoices/actions/sendInvoiceAction.ts");
    const contents = readFileSync(filePath, "utf8");
    expect(contents).toContain("use server");
  });
});
