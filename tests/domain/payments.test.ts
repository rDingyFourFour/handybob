import { describe, expect, it } from "vitest";

import { handleStripeEvent } from "@/lib/domain/payments";

describe("handleStripeEvent", () => {
  it("skips unknown event types without throwing", async () => {
    type HandlerArgs = Parameters<typeof handleStripeEvent>[0];
    const supabaseMock: HandlerArgs["supabase"] = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };

    const result = await handleStripeEvent({
      supabase: supabaseMock,
      event: { type: "unknown", payload: {} },
    });

    expect(result).toBeUndefined();
  });
});
