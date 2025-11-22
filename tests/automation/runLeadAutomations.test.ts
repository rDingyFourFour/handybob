import { beforeEach, describe, expect, it, vi } from "vitest";

import { runLeadAutomations } from "@/utils/automation/runLeadAutomations";

type SupabaseState = {
  automation_events: any[];
};

function makeSupabaseMock(initial?: Partial<SupabaseState>) {
  const state: SupabaseState = {
    automation_events: [],
    ...initial,
  };

  const supabase = {
    state,
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({ data: { user: { email: "owner@example.com" } } })),
      },
    },
    from(table: string) {
      switch (table) {
        case "automation_settings":
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    email_new_urgent_lead: true,
                    sms_new_urgent_lead: true,
                    sms_alert_number: "+15555550123",
                  },
                }),
              }),
            }),
          };
        case "automation_events":
          return {
            insert: async (payload: any) => {
              state.automation_events.push(payload);
              return { data: payload };
            },
          };
        default:
          return { select: () => ({}) };
      }
    },
  };

  return supabase;
}

let supabaseMock = makeSupabaseMock();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => supabaseMock,
}));

const sendEmail = vi.fn();
const sendSms = vi.fn();

vi.mock("@/utils/email/sendCustomerMessage", () => ({
  sendCustomerMessageEmail: (...args: any[]) => sendEmail(...args),
}));

vi.mock("@/utils/sms/sendCustomerSms", () => ({
  sendCustomerSms: (...args: any[]) => sendSms(...args),
}));

describe("runLeadAutomations", () => {
  beforeEach(() => {
    supabaseMock = makeSupabaseMock();
    sendEmail.mockReset();
    sendSms.mockReset();
  });

  it("logs an automation event for an urgent lead", async () => {
    await runLeadAutomations({
      userId: "user_1",
      workspaceId: "ws_1",
      jobId: "job_1",
      title: "Leaking roof",
      customerName: "Alex",
      summary: "Water coming through the ceiling",
      aiUrgency: "emergency",
    });

    expect(sendEmail).toHaveBeenCalled();
    expect(sendSms).toHaveBeenCalled();
    expect(supabaseMock.state.automation_events).toHaveLength(2);
    expect(
      supabaseMock.state.automation_events.some(
        (e) => e.type === "urgent_lead_alert" && e.status === "success",
      ),
    ).toBe(true);
  });
});
