import type { ReactNode } from "react";
import { vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

export const createServerClientMock = vi.fn();
export const mockGetCurrentWorkspace = vi.fn();
export const mockGetJobAskBobSnapshotsForJob = vi.fn();
export const mockLoadCallHistoryForJob = vi.fn();
export const mockGetLatestCallOutcomeForJob = vi.fn();
export const mockGetInvoiceForJob = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/workspaces")>(
    "@/lib/domain/workspaces",
  );
  return {
    ...actual,
    getCurrentWorkspace: () => mockGetCurrentWorkspace(),
  };
});

vi.mock("@/lib/domain/askbob/service", () => ({
  getJobAskBobSnapshotsForJob: (...args: unknown[]) =>
    mockGetJobAskBobSnapshotsForJob(...args),
}));

vi.mock("@/lib/domain/askbob/callHistory", () => ({
  loadCallHistoryForJob: (...args: unknown[]) =>
    mockLoadCallHistoryForJob(...args),
}));

vi.mock("@/lib/domain/calls/latestCallOutcome", () => ({
  getLatestCallOutcomeForJob: (...args: unknown[]) =>
    mockGetLatestCallOutcomeForJob(...args),
}));

vi.mock("@/lib/domain/invoices/getInvoiceForJob", () => ({
  getInvoiceForJob: (...args: unknown[]) => mockGetInvoiceForJob(...args),
}));

vi.mock("@/components/mobile/TrackedLinkButton", () => ({
  __esModule: true,
  default: (props: {
    children: ReactNode;
    eventName?: string;
    eventPayload?: Record<string, unknown>;
  }) => {
    const { children, eventName, eventPayload, ...rest } = props;
    void eventName;
    void eventPayload;
    const payloadString = JSON.stringify(eventPayload ?? {});
    return (
      <button {...rest} data-event-payload={payloadString}>
        {children}
      </button>
    );
  },
}));

export function createSupabaseState(
  initialResponses: Record<string, unknown> = {},
) {
  const supabaseState = setupSupabaseMock(initialResponses);
  createServerClientMock.mockReturnValue(supabaseState.supabase);
  return supabaseState;
}
