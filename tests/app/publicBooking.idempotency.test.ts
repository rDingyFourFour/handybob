import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createAdminClientMock = vi.fn();

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

describe("submitPublicBooking idempotency", () => {
  beforeEach(() => {
    createAdminClientMock.mockReset();
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

  it("returns the same job on retries and skips duplicate inserts", async () => {
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
      customers: [
        { data: [], error: null },
        {
          data: [
            {
              id: "cust-1",
              name: "Jane Doe",
              email: "jane@example.com",
              phone: null,
              address: null,
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: "cust-1",
              name: "Jane Doe",
              email: "jane@example.com",
              phone: null,
              address: null,
            },
          ],
          error: null,
        },
        { data: [], error: null },
      ],
      jobs: [
        { data: [], error: null },
        { data: [{ id: "job-1", customer_id: "cust-1" }], error: null },
        { data: [{ id: "job-1", customer_id: "cust-1" }], error: null },
      ],
    });

    createAdminClientMock.mockReturnValue(supabaseState.supabase);

    const first = await submitPublicBooking("demo", {
      status: "idle",
      message: null,
      errorCode: null,
    }, buildFormData());

    const insertSpy = supabaseState.queries.jobs.insert;

    const second = await submitPublicBooking("demo", {
      status: "idle",
      message: null,
      errorCode: null,
    }, buildFormData());

    expect(first.status).toBe("success");
    expect(second.status).toBe("success");
    if (first.status === "success" && second.status === "success") {
      expect(second.jobId).toBe(first.jobId);
      expect(second.customerId).toBe(first.customerId);
      expect(second.reusedExistingBookingJob).toBe(true);
      expect(second.ownerHandoff.redirectPath).toBeUndefined();
    }

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[public-booking-submit]" &&
          payload.workspaceId === "workspace-1" &&
          payload.reusedExistingBookingJob === true,
      ),
    ).toBe(true);
  });
});
