import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createAdminClientMock = vi.fn();
const createServerClientMock = vi.fn();
const mockUpsertPublicLeadCustomer = vi.fn();
const mockCreatePublicBookingLeadJob = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
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

describe("submitPublicBooking owner handoff", () => {
  beforeEach(() => {
    createAdminClientMock.mockReset();
    createServerClientMock.mockReset();
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

  function mockWorkspace() {
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
  }

  it("returns a relative redirectPath when the owner is authenticated", async () => {
    mockWorkspace();
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
    createServerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
    });

    const result = await submitPublicBooking("demo", { status: "idle" }, buildFormData());

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.ownerHandoff.eligible).toBe(true);
      expect(result.ownerHandoff.redirectPath).toBe("/jobs/job-1");
      expect(result.ownerHandoff.redirectPath?.startsWith("/")).toBe(true);
    }
  });

  it("omits redirectPath when the viewer is not eligible", async () => {
    mockWorkspace();
    mockUpsertPublicLeadCustomer.mockResolvedValue({
      id: "cust-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: null,
    });
    mockCreatePublicBookingLeadJob.mockResolvedValue({
      jobId: "job-2",
      customerId: "cust-1",
      reusedExistingBookingJob: false,
    });
    createServerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-2" } } }),
      },
    });

    const result = await submitPublicBooking("demo", { status: "idle" }, buildFormData());

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.ownerHandoff.eligible).toBe(false);
      expect(result.ownerHandoff.redirectPath).toBeUndefined();
    }
  });

  it("keeps diagnostics safe strings on job create errors", async () => {
    mockWorkspace();
    mockUpsertPublicLeadCustomer.mockResolvedValue({
      id: "cust-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: null,
    });
    mockCreatePublicBookingLeadJob.mockRejectedValue({ message: "boom" });
    createServerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
    });

    const result = await submitPublicBooking("demo", { status: "idle" }, buildFormData());

    expect(result.status).toBe("error");
    const warnCalls = vi.mocked(console.warn).mock.calls;
    const diagnosticEntry = warnCalls.find(
      ([label]) => label === "[public-booking-submit-failure]",
    );
    expect(diagnosticEntry).toBeTruthy();
    if (diagnosticEntry) {
      const payload = diagnosticEntry[1] as { diagnostics?: unknown };
      expect(typeof payload.diagnostics).toBe("string");
    }
  });
});
