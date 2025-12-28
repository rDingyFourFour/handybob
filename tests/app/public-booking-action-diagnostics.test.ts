import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createAdminClientMock = vi.fn();
const mockUpsertPublicLeadCustomer = vi.fn();
const mockCreatePublicBookingLeadJob = vi.fn();

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
    createPublicBookingLeadJob: (...args: unknown[]) => mockCreatePublicBookingLeadJob(...args),
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
    mockCreatePublicBookingLeadJob.mockReset();
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
    mockCreatePublicBookingLeadJob.mockResolvedValue({
      jobId: "job-1",
      customerId: "cust-1",
      reusedExistingBookingJob: false,
    });

    const result = await submitPublicBooking("demo", { status: "idle" }, buildFormData());

    expect(result.status).toBe("success");
    expect(result.jobId).toBe("job-1");
    expect(result.ownerHandoff.eligible).toBe(false);
    expect(result.ownerHandoff.redirectPath).toBeUndefined();
    expect(result.reusedExistingBookingJob).toBe(false);
    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[public-booking-submit]" &&
          payload.workspaceId === "workspace-1" &&
          payload.hasAttentionScore === true &&
          payload.reusedExistingBookingJob === false,
      ),
    ).toBe(true);
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[public-booking-submit-success]" &&
          payload.workspaceId === "workspace-1" &&
          payload.jobId === "job-1" &&
          payload.customerId === "cust-1" &&
          payload.ownerHandoffEligible === false &&
          payload.redirectPath === null,
      ),
    ).toBe(true);
  });

  it("blocks submissions when bookings are disabled", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: {
        data: [
          {
            id: "workspace-1",
            owner_id: "user-1",
            slug: "demo",
            name: "Demo Workspace",
            brand_name: "Demo",
            public_lead_form_enabled: false,
            auto_confirmation_email_enabled: false,
          },
        ],
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);

    const result = await submitPublicBooking("demo", { status: "idle" }, buildFormData());

    expect(result.status).toBe("error");
    expect(result.errorCode).toBe("bookings_disabled");
    expect(mockUpsertPublicLeadCustomer).not.toHaveBeenCalled();
    expect(mockCreatePublicBookingLeadJob).not.toHaveBeenCalled();

    const warnCalls = vi.mocked(console.warn).mock.calls;
    expect(
      warnCalls.some(
        ([label, payload]) =>
          label === "[public-booking-submit-blocked]" &&
          payload.workspaceId === "workspace-1" &&
          payload.slug === "demo" &&
          payload.code === "bookings_disabled",
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
    mockCreatePublicBookingLeadJob.mockRejectedValue(
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
    expect(
      warnCalls.some(
        ([label, payload]) =>
          label === "[public-booking-submit-failure]" &&
          payload.workspaceId === "workspace-1" &&
          payload.customerId === "cust-1" &&
          payload.errorCode === "job_create_failed" &&
          payload.diagnostics === "db_constraint_violation",
      ),
    ).toBe(true);
  });
});
