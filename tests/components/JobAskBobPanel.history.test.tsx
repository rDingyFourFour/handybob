import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AskBobDiagnoseSnapshotPayload, AskBobTaskSnapshotVersion } from "@/lib/domain/askbob/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/app/(app)/askbob/actions", async () => {
  const actual = await vi.importActual<typeof import("@/app/(app)/askbob/actions")>(
    "@/app/(app)/askbob/actions",
  );
  return {
    ...actual,
    regenerateDiagnosisAction: vi.fn(),
  };
});

import { regenerateDiagnosisAction } from "@/app/(app)/askbob/actions";
import JobAskBobPanel from "@/components/askbob/JobAskBobPanel";

const mockRegenerate = regenerateDiagnosisAction as unknown as ReturnType<typeof vi.fn>;

const latestSnapshot: AskBobDiagnoseSnapshotPayload = {
  sessionId: "session-1",
  responseId: "response-1",
  createdAt: "2025-01-10T10:00:00Z",
  sections: [
    {
      type: "steps",
      title: "Diagnosis",
      items: ["Check gasket", "Inspect pipe"],
    },
  ],
  materials: [],
};

const historyEntry: AskBobTaskSnapshotVersion<AskBobDiagnoseSnapshotPayload> = {
  id: "version-1",
  task: "job.diagnose",
  createdAt: "2024-12-31T10:00:00Z",
  createdAtLabel: "Dec 31, 2024 10:00",
  payload: {
    sessionId: "session-0",
    responseId: "response-0",
    createdAt: "2024-12-31T10:00:00Z",
    sections: [
      {
        type: "steps",
        title: "Diagnosis",
        items: ["Replace cartridge"],
      },
    ],
    materials: [],
  },
};

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes(text),
  );
}

describe("JobAskBobPanel history", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockRegenerate.mockReset();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    container.remove();
  });

  it("renders the latest diagnosis and a history list with view toggle", async () => {
    await act(async () => {
      root?.render(
        <JobAskBobPanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          initialDiagnoseSnapshot={latestSnapshot}
          diagnosisSnapshotHistory={[historyEntry]}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Check gasket");
    expect(container.textContent).toContain("Previous diagnoses");
    const historyItems = container.querySelectorAll('[data-testid="diagnosis-history-item"]');
    expect(historyItems.length).toBe(1);
    expect(historyItems[0].textContent).toContain("Dec 31, 2024 10:00");

    const viewButton = findButton(historyItems[0] as HTMLElement, "View");
    expect(viewButton).toBeTruthy();

    await act(async () => {
      viewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(historyItems[0].textContent).toContain("- Replace cartridge");
  });

  it("regenerates diagnosis and moves the previous version into history", async () => {
    mockRegenerate.mockResolvedValue({
      ok: true,
      response: {
        sessionId: "session-2",
        responseId: "response-2",
        createdAt: "2025-01-12T10:00:00Z",
        sections: [
          {
            type: "steps",
            title: "Diagnosis",
            items: ["Replace valve"],
          },
        ],
        materials: [],
        modelLatencyMs: 120,
      },
      versionId: "version-2",
      createdAt: "2025-01-12T10:00:00Z",
      createdAtLabel: "Jan 12, 2025 10:00",
    });

    await act(async () => {
      root?.render(
        <JobAskBobPanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          initialDiagnoseSnapshot={latestSnapshot}
        />,
      );
      await Promise.resolve();
    });

    const regenButton = findButton(container, "Regenerate diagnosis");
    expect(regenButton).toBeTruthy();

    await act(async () => {
      regenButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockRegenerate).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Replace valve");
    expect(container.textContent).toContain("Previous diagnoses");
    const historyItems = container.querySelectorAll('[data-testid="diagnosis-history-item"]');
    expect(historyItems.length).toBe(1);
    expect(historyItems[0].textContent).toContain("Check gasket");
  });

  it("shows an inline error when regeneration fails", async () => {
    mockRegenerate.mockResolvedValue({
      ok: false,
      code: "unknown",
      message: "AskBob could not regenerate diagnosis.",
    });

    await act(async () => {
      root?.render(
        <JobAskBobPanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          initialDiagnoseSnapshot={latestSnapshot}
        />,
      );
      await Promise.resolve();
    });

    const regenButton = findButton(container, "Regenerate diagnosis");
    expect(regenButton).toBeTruthy();

    await act(async () => {
      regenButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("AskBob could not regenerate diagnosis.");
  });
});
