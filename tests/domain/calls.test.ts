import { describe, expect, it, vi } from "vitest";

import { handleTwilioVoiceEvent } from "@/lib/domain/calls";
import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import { getLatestCallOutcomeForJob } from "@/lib/domain/calls/latestCallOutcome";

describe("handleTwilioVoiceEvent", () => {
  it("returns TwiML that instructs recording", async () => {
    const response = await handleTwilioVoiceEvent({
      from: "+15555550123",
      to: "+15555550000",
      callSid: "CA123",
    });

    expect(response).toContain("<Record");
    expect(response).toContain("Thanks for calling HandyBob");
  });
});

describe("getLatestCallOutcomeForJob", () => {
  it("queries calls using all columns and returns sanitized outcome", async () => {
    const outcomeDate = new Date().toISOString();
    const createdDate = new Date(Date.now() - 1000).toISOString();
    const supabaseState = setupSupabaseMock({
      calls: {
        data: [
          {
            id: "call-123",
            job_id: "job-1",
            workspace_id: "workspace-1",
            created_at: createdDate,
            started_at: createdDate,
            reached_customer: true,
            outcome_code: "reached_needs_followup",
            outcome_notes: "  Follow-up needed  ",
            outcome_recorded_at: outcomeDate,
            summary: null,
            ai_summary: "AskBob call script: test",
          },
        ],
        error: null,
      },
    });

    const result = await getLatestCallOutcomeForJob(supabaseState.supabase, "workspace-1", "job-1");

    expect(result).toMatchObject({
      callId: "call-123",
      reachedCustomer: true,
      outcomeCode: "reached_needs_followup",
      isAskBobAssisted: true,
    });
    expect(result?.outcomeNotes).toBe("Follow-up needed");
    const orderCalls = supabaseState.queries.calls.order.mock.calls;
    expect(supabaseState.queries.calls.select).toHaveBeenCalledWith("*");
    expect(orderCalls).toEqual([["created_at", { ascending: false }]]);
  });

  it("returns null when the calls query errors (permission/network/etc.)", async () => {
    const supabaseState = setupSupabaseMock({
      calls: {
        data: null,
        error: new Error("permission denied"),
      },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getLatestCallOutcomeForJob(supabaseState.supabase, "workspace-1", "job-1");

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("handles legacy rows without outcome columns gracefully", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const createdDate = new Date().toISOString();
    const supabaseState = setupSupabaseMock({
      calls: {
        data: [
          {
            id: "legacy-call",
            job_id: "job-legacy",
            workspace_id: "workspace-legacy",
            created_at: createdDate,
            started_at: null,
            summary: "Manual summary",
            ai_summary: null,
          },
        ],
        error: null,
      },
    });

    const result = await getLatestCallOutcomeForJob(
      supabaseState.supabase,
      "workspace-legacy",
      "job-legacy",
    );

    expect(result).toEqual({
      callId: "legacy-call",
      occurredAt: createdDate,
      reachedCustomer: null,
      outcomeCode: null,
      outcomeNotes: null,
      isAskBobAssisted: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[latest-call-outcome] Outcome columns not found; using legacy fields",
      { workspaceId: "workspace-legacy", jobId: "job-legacy" },
    );
    warnSpy.mockRestore();
  });
});
