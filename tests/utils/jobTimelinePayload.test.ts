import { describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import { buildJobTimelinePayload } from "@/utils/ai/jobTimelinePayload";

const createServerClientMock = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

describe("buildJobTimelinePayload", () => {
  it("adds outcome/reached details to call events", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: {
        data: [
          {
            id: "job-1",
            workspace_id: "workspace-1",
            title: "Test job",
            description_raw: "Fix the thing",
            category: null,
            urgency: null,
            status: "open",
            customer_id: "customer-1",
            created_at: new Date().toISOString(),
            customers: { id: "customer-1", name: "Alice", phone: "+15550009999" },
          },
        ],
        error: null,
      },
      quotes: { data: [], error: null },
      appointments: { data: [], error: null },
      messages: { data: [], error: null },
      calls: {
        data: [
          {
            direction: "outbound",
            status: "completed",
            started_at: "2025-01-01T12:00:00Z",
            duration_seconds: 60,
            summary: "AskBob call script: test",
            ai_summary: null,
            transcript: null,
            reached_customer: true,
            outcome_code: "reached_scheduled",
            outcome_recorded_at: "2025-01-01T12:01:00Z",
          },
        ],
        error: null,
      },
      invoices: { data: [], error: null },
    });
    createServerClientMock.mockReturnValue(supabaseState.supabase);

    const payload = await buildJobTimelinePayload("job-1", "workspace-1");
    const callEvent = payload.events.find((event) => event.type === "call");
    expect(callEvent?.detail).toContain("Outcome: Reached · Scheduled");
    expect(callEvent?.detail).toContain("Reached: yes");
    expect(callEvent?.askBobScript).toBe(true);
  });
});
