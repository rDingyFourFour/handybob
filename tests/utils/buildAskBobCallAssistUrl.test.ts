import { describe, expect, it } from "vitest";

import { buildAskBobCallAssistUrl } from "@/components/askbob/JobAskBobFlow";

describe("buildAskBobCallAssistUrl", () => {
  it("creates a call compose link with AskBob origin and optional summary", () => {
    const url = buildAskBobCallAssistUrl({
      jobId: "job-1",
      customerId: "customer-1",
      origin: "askbob-call-assist",
      scriptBody: "AskBob script body for the call",
      scriptSummary: "Summary text",
    });

    expect(url).toContain("origin=askbob-call-assist");
    expect(url).toContain("jobId=job-1");
    expect(url).toContain("customerId=customer-1");
    expect(url).toContain("scriptBody=AskBob+script+body+for+the+call");
    expect(url).toContain("scriptSummary=Summary+text");
  });
});
