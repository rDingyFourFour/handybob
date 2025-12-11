import { describe, expect, it, vi, beforeEach } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { runAskBobScheduleAppointmentAction } from "@/app/(app)/askbob/job-schedule-actions";

let supabaseState = setupSupabaseMock();

const jobRow = {
  id: "job-1",
  workspace_id: "workspace-1",
  title: "Fix faucet",
};

const defaultResponses = {
  jobs: { data: [jobRow], error: null },
  appointments: { data: { id: "appt-1" }, error: null },
};

beforeEach(() => {
  supabaseState = setupSupabaseMock(defaultResponses);
  createServerClientMock.mockReturnValue(supabaseState.supabase);
  mockGetCurrentWorkspace.mockResolvedValue({
    user: { id: "user-1" },
    workspace: { id: "workspace-1" },
    role: "owner",
  });
});

describe("runAskBobScheduleAppointmentAction", () => {
  it("creates the appointment and returns the id", async () => {
    const response = await runAskBobScheduleAppointmentAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
      startAt: "2025-01-08T09:00:00Z",
      endAt: "2025-01-08T10:00:00Z",
      title: "Visit for Test job",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) {
      return;
    }
    expect(response.appointmentId).toBe("appt-1");
    expect(supabaseState.queries.appointments.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        start_time: "2025-01-08T09:00:00.000Z",
        end_time: "2025-01-08T10:00:00.000Z",
        job_id: "job-1",
        title: "Visit for Test job",
      }),
    );
  });

  it("returns wrong_workspace when workspace mismatches", async () => {
    const response = await runAskBobScheduleAppointmentAction({
      workspaceId: "workspace-other",
      jobId: "job-1",
      startAt: "2025-01-08T09:00:00Z",
    });

    expect(response).toEqual({ ok: false, error: "wrong_workspace" });
  });

  it("returns job_not_found when the job is missing", async () => {
    supabaseState.responses.jobs = { data: [], error: null };

    const response = await runAskBobScheduleAppointmentAction({
      workspaceId: "workspace-1",
      jobId: "job-999",
      startAt: "2025-01-08T09:00:00Z",
    });

    expect(response).toEqual({ ok: false, error: "job_not_found" });
  });
});
