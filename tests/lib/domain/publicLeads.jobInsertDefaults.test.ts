import { beforeEach, describe, expect, it } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import { upsertPublicLeadJob } from "@/lib/domain/publicLeads";

describe("upsertPublicLeadJob insert payload defaults", () => {
  beforeEach(() => {
  });

  it("includes required fields on insert when missing", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: [
        { data: [], error: null },
        { data: [{ id: "job-1" }], error: null },
      ],
    });

    await upsertPublicLeadJob({
      supabase: supabaseState.supabase as never,
      workspace: { id: "workspace-1", owner_id: "user-1" },
      customerId: "customer-1",
      job: {
        description: "Need help fixing a door.",
        source: "public_form",
      },
    });

    const insertPayload = supabaseState.queries.jobs.insert?.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(insertPayload).toBeDefined();
    const requiredFields = [
      "user_id",
      "workspace_id",
      "customer_id",
      "title",
      "description_raw",
      "status",
      "attention_score",
      "source",
    ];
    for (const field of requiredFields) {
      expect(insertPayload?.[field]).not.toBeNull();
      expect(insertPayload?.[field]).not.toBeUndefined();
    }
    const requiredStringFields = ["title", "description_raw", "status", "source"];
    for (const field of requiredStringFields) {
      expect(typeof insertPayload?.[field]).toBe("string");
      expect((insertPayload?.[field] as string).trim().length).toBeGreaterThan(0);
    }
    expect(typeof insertPayload?.attention_score).toBe("number");
  });

  it("does not overwrite attention_score with null on update", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: [
        {
          data: [
            {
              id: "job-1",
              status: "lead",
              title: "Existing lead",
              customer_id: "customer-1",
            },
          ],
          error: null,
        },
        { data: [], error: null },
      ],
    });

    await upsertPublicLeadJob({
      supabase: supabaseState.supabase as never,
      workspace: { id: "workspace-1", owner_id: "user-1" },
      customerId: "customer-1",
      job: {
        description: "Updated description",
        source: "public_form",
        attentionScore: null,
      },
    });

    const updatePayload = supabaseState.queries.jobs.update?.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(updatePayload).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(updatePayload, "attention_score")).toBe(false);
  });

  it("throws a structured error when required fields are missing", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: [{ data: [], error: null }],
    });

    await expect(
      upsertPublicLeadJob({
        supabase: supabaseState.supabase as never,
        workspace: { id: "workspace-1", owner_id: "user-1" },
        customerId: null,
        job: {
          description: "Need help fixing a door.",
          source: "public_form",
        },
      }),
    ).rejects.toMatchObject({
      code: "missing_required_job_fields",
      missingFields: ["customer_id"],
    });
  });
});
