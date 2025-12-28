import { describe, expect, it } from "vitest";

import {
  buildPublicBookingIdempotencyKey,
  buildPublicBookingIdempotencyMarker,
  buildPublicBookingNormalizedContactKey,
  findExistingPublicBookingJobByIdempotencyKey,
} from "@/lib/domain/publicLeads";
import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

describe("public booking idempotency helpers", () => {
  it("builds a stable key for identical inputs", () => {
    const normalizedContactKey = buildPublicBookingNormalizedContactKey({
      email: "Taylor@example.com",
      phone: "+15551234567",
    });
    const params = {
      workspaceId: "workspace-1",
      normalizedContactKey,
      title: "Fix a leak",
      description: "Kitchen sink is dripping.",
      dayBucket: "2025-03-12",
    };

    const first = buildPublicBookingIdempotencyKey(params);
    const second = buildPublicBookingIdempotencyKey(params);

    expect(first).toBe(second);
  });

  it("changes the key across day buckets", () => {
    const normalizedContactKey = buildPublicBookingNormalizedContactKey({
      email: "taylor@example.com",
    });
    const base = {
      workspaceId: "workspace-1",
      normalizedContactKey,
      title: "Fix a leak",
      description: "Kitchen sink is dripping.",
    };

    const dayOne = buildPublicBookingIdempotencyKey({ ...base, dayBucket: "2025-03-12" });
    const dayTwo = buildPublicBookingIdempotencyKey({ ...base, dayBucket: "2025-03-13" });

    expect(dayOne).not.toBe(dayTwo);
  });

  it("uses email, then phone, then fallback for contact selection", () => {
    expect(
      buildPublicBookingNormalizedContactKey({
        email: "  TAYLOR@EXAMPLE.COM ",
        phone: "+15550001111",
      }),
    ).toBe("taylor@example.com");

    expect(
      buildPublicBookingNormalizedContactKey({
        email: null,
        phone: " +15550002222 ",
      }),
    ).toBe("+15550002222");

    expect(
      buildPublicBookingNormalizedContactKey({
        email: "  ",
        phone: null,
      }),
    ).toBe("unknown_contact");
  });

  it("finds an existing job by the stored marker format", async () => {
    const key = "abc123";
    const marker = buildPublicBookingIdempotencyMarker(key);
    const supabaseState = setupSupabaseMock({
      jobs: [{ data: [{ id: "job-1", customer_id: "cust-1" }], error: null }],
    });

    const existing = await findExistingPublicBookingJobByIdempotencyKey({
      supabase: supabaseState.supabase as never,
      workspaceId: "workspace-1",
      idempotencyKey: key,
    });

    expect(existing).toEqual({ jobId: "job-1", customerId: "cust-1" });
    const eqCalls = supabaseState.queries.jobs.eq.mock.calls;
    expect(eqCalls.some(([field, value]) => field === "description_ai_summary" && value === marker))
      .toBe(true);
  });
});
