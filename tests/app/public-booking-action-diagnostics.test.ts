import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createAdminClientMock = vi.fn();
const mockUpsertPublicLeadCustomer = vi.fn();
const mockUpsertPublicLeadJob = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  }),
}));

vi.mock("next/headers", () => ({
  headers: () =>
    new Headers({
      "x-forwarded-for": "203.0.113.10",
      "user-agent": "test-agent",
    }),
}));

vi.mock("@/lib/domain/publicLeads", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/publicLeads")>(
    "@/lib/domain/publicLeads",
  );
  return {
    ...actual,
    upsertPublicLeadCustomer: (...args: unknown[]) => mockUpsertPublicLeadCustomer(...args),
    upsertPublicLeadJob: (...args: unknown[]) => mockUpsertPublicLeadJob(...args),
  };
});

vi.mock("@/lib/domain/jobs", () => ({
  classifyJobWithAi: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/domain/automation", () => ({
  runLeadAutomations: vi.fn(),
}));

vi.mock("@/utils/email/sendCustomerMessage", () => ({
  sendCustomerMessageEmail: vi.fn(),
}));

import { submitPublicBooking } from "@/app/public/bookings/[slug]/actions";

describe("submitPublicBooking diagnostics", () => {
  beforeEach(() => {
    createAdminClientMock.mockReset();
    mockUpsertPublicLeadCustomer.mockReset();
    mockUpsertPublicLeadJob.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  function buildFormData() {
    const formData = new FormData();
    formData.set("name", "Jane Doe");
    formData.set("email", "jane@example.com");
    formData.set("description", "Need help with a leaky faucet.");
    formData.set("urgency", "this_week");
    return formData;
  }

  it("returns success when the shared helper succeeds", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: {
        data: [
          {
            id: "workspace-1",
            owner_id: "user-1",
            slug: "demo",
            name: "Demo Workspace",
            brand_name: "Demo",
            public_lead_form_enabled: true,
            auto_confirmation_email_enabled: false,
          },
        ],
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);
    mockUpsertPublicLeadCustomer.mockResolvedValue({
      id: "cust-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: null,
    });
    mockUpsertPublicLeadJob.mockResolvedValue({ jobId: "job-1", wasUpdated: false });

    const result = await submitPublicBooking("demo", { status: "idle" }, buildFormData());

    expect(result.status).toBe("success");
    expect(result.jobId).toBe("job-1");
    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[public-booking-submit]" &&
          payload.workspaceId === "workspace-1" &&
          payload.hasAttentionScore === true,
      ),
    ).toBe(true);
  });

  it("returns job_create_failed with safe diagnostics on constraint errors", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: {
        data: [
          {
            id: "workspace-1",
            owner_id: "user-1",
            slug: "demo",
            name: "Demo Workspace",
            brand_name: "Demo",
            public_lead_form_enabled: true,
            auto_confirmation_email_enabled: false,
          },
        ],
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);
    mockUpsertPublicLeadCustomer.mockResolvedValue({
      id: "cust-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: null,
    });
    mockUpsertPublicLeadJob.mockRejectedValue(
      new Error(
        "null value in column \"attention_score\" of relation \"jobs\" violates not-null constraint",
      ),
    );

    const result = await submitPublicBooking("demo", { status: "idle" }, buildFormData());

    expect(result.status).toBe("error");
    expect(result.errorCode).toBe("job_create_failed");
    const warnCalls = vi.mocked(console.warn).mock.calls;
    expect(
      warnCalls.some(
        ([label, payload]) =>
          label === "[public-booking-submit]" &&
          payload.workspaceId === "workspace-1" &&
          payload.customerId === "cust-1" &&
          payload.diagnostics === "db_constraint_violation",
      ),
    ).toBe(true);
  });
});
