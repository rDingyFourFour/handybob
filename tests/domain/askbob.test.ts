import { describe, expect, it } from "vitest";

import { setupSupabaseMock } from "../setup/supabaseClientMock";
import {
  getJobAskBobSnapshotsForJob,
  recordAskBobJobTaskSnapshot,
} from "@/lib/domain/askbob/service";

type AskBobServiceClient = Parameters<typeof recordAskBobJobTaskSnapshot>[0];

describe("AskBob snapshots", () => {
  it("upserts snapshots for repeated job tasks", async () => {
    const state = setupSupabaseMock();
    const supabase = state.supabase as AskBobServiceClient;

    const diagnoseResult = {
      sessionId: "session-1",
      responseId: "response-1",
      createdAt: new Date().toISOString(),
      sections: [{ type: "steps", title: "Plan", items: ["Inspect"] }],
      materials: [],
      modelLatencyMs: 123,
    };

    await recordAskBobJobTaskSnapshot(supabase, {
      workspaceId: "workspace-1",
      jobId: "job-1",
      task: "job.diagnose",
      result: diagnoseResult,
    });

    const firstQuery = state.queries["askbob_job_task_snapshots"];

    await recordAskBobJobTaskSnapshot(supabase, {
      workspaceId: "workspace-1",
      jobId: "job-1",
      task: "job.diagnose",
      result: diagnoseResult,
    });

    const secondQuery = state.queries["askbob_job_task_snapshots"];
    expect(firstQuery.upsert).toHaveBeenCalledTimes(1);
    expect(secondQuery.upsert).toHaveBeenCalledTimes(1);
    const [firstCall] = firstQuery.upsert.mock.calls;
    expect(firstCall[0]).toMatchObject({
      workspace_id: "workspace-1",
      job_id: "job-1",
      task: "job.diagnose",
      payload: expect.objectContaining({
        sessionId: "session-1",
        responseId: "response-1",
      }),
    });
  });

  it("loads typed snapshots for each AskBob task", async () => {
    const rows = [
      {
        task: "job.diagnose",
        payload: {
          sessionId: "s-1",
          responseId: "r-1",
          createdAt: "2025-01-01T00:00:00Z",
          sections: [{ type: "steps", title: "Plan", items: ["Step 1"] }],
          materials: [{ name: "Filter", quantity: "2", notes: "Reusable" }],
        },
      },
      {
        task: "materials.generate",
        payload: {
          items: [
            {
              name: "Tape",
              sku: null,
              category: null,
              quantity: 1,
              unit: "roll",
              estimatedUnitCost: 5,
              estimatedTotalCost: 5,
              notes: "Waterproof",
            },
          ],
          notes: "Bring extra",
        },
      },
      {
        task: "quote.generate",
        payload: {
          lines: [
            {
              description: "Service",
              quantity: 1,
              unit: "job",
              unitPrice: 100,
              lineTotal: 100,
            },
          ],
          materials: [
            {
              name: "Sealant",
              quantity: 2,
              unit: "tube",
              estimatedUnitCost: 10,
              estimatedTotalCost: 20,
            },
          ],
          notes: "Quote note",
        },
      },
      {
        task: "job.followup",
        payload: {
          recommendedAction: "Follow up",
          rationale: "Need more info",
          steps: [{ label: "Call customer", detail: "Ask about access" }],
          shouldSendMessage: true,
          shouldScheduleVisit: false,
          shouldCall: true,
          shouldWait: false,
          suggestedChannel: "sms",
          suggestedDelayDays: 2,
          riskNotes: "High priority",
          modelLatencyMs: 250,
        },
      },
    ];

    const state = setupSupabaseMock({
      askbob_job_task_snapshots: { data: rows, error: null },
    });
    const supabase = state.supabase as AskBobServiceClient;

    const snapshots = await getJobAskBobSnapshotsForJob(supabase, {
      workspaceId: "workspace-1",
      jobId: "job-1",
    });

    expect(snapshots.diagnoseSnapshot).not.toBeNull();
    expect(snapshots.materialsSnapshot?.items?.length).toBe(1);
    expect(snapshots.quoteSnapshot?.lines?.[0]?.description).toBe("Service");
    expect(snapshots.followupSnapshot?.steps?.[0]?.label).toBe("Call customer");
  });
});
