import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseState, mockGetCurrentWorkspace } from "@/tests/app/mobile/test-helpers";
import MobileHomePage from "@/app/m/page";
import MobileAppShell from "@/components/layout/MobileAppShell";
import { usePathname } from "next/navigation";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/m"),
}));

const mockedUsePathname = vi.mocked(usePathname);

describe("Mobile home layout", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockedUsePathname.mockReset();
    mockedUsePathname.mockReturnValue("/m");
    mockGetCurrentWorkspace.mockReset();
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      workspace: { id: "workspace-1", name: "Test Workspace", owner_id: "owner-1" },
      role: "owner",
    });
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = null;
    }
    container.remove();
  });

  it("renders the mobile home content without the mobile top navbar while keeping the tab bar", async () => {
    const supabaseState = createSupabaseState({
      jobs: {
        data: [
          {
            id: "job-1",
            title: "Home instruction job",
            status: "open",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      },
      askbob_job_task_snapshots: { data: [], error: null },
      quotes: { data: [], error: null },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "owner@example.com", user_metadata: {} } },
      }),
    };

    const element = await MobileHomePage();

    act(() => {
      root?.render(<MobileAppShell>{element}</MobileAppShell>);
    });

    expect(container.querySelector('[data-testid="app-shell-header"]')).toBeNull();
    expect(container.querySelector('[data-testid="mobile-tab-bar"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="mobile-home-header"]')).toBeTruthy();
  });
});
