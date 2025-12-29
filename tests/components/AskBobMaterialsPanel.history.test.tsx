import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AskBobMaterialsSnapshotPayload,
  AskBobTaskSnapshotVersion,
} from "@/lib/domain/askbob/types";

vi.mock("@/app/(app)/askbob/materials-actions", () => ({
  runAskBobMaterialsGenerateAction: vi.fn(),
  regenerateAskBobMaterialsAction: vi.fn(),
}));

import { regenerateAskBobMaterialsAction } from "@/app/(app)/askbob/materials-actions";
import AskBobMaterialsPanel from "@/components/askbob/AskBobMaterialsPanel";

const mockRegenerate = regenerateAskBobMaterialsAction as unknown as ReturnType<typeof vi.fn>;

const latestSnapshot: AskBobMaterialsSnapshotPayload = {
  items: [
    {
      name: "Copper pipe",
      quantity: 2,
      unit: "pcs",
      estimatedUnitCost: 12.5,
      estimatedTotalCost: 25,
    },
  ],
  notes: "Use Type L pipe.",
};

const historyEntry: AskBobTaskSnapshotVersion<AskBobMaterialsSnapshotPayload> = {
  id: "version-1",
  task: "materials.generate",
  createdAt: "2024-12-30T10:00:00Z",
  createdAtLabel: "Dec 30, 2024 10:00",
  payload: {
    items: [
      {
        name: "Gasket",
        quantity: 1,
        unit: "pcs",
        estimatedUnitCost: 4.5,
        estimatedTotalCost: 4.5,
      },
    ],
    notes: "Check size on site.",
  },
};

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes(text),
  );
}

describe("AskBobMaterialsPanel history", () => {
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

  it("renders the latest materials and a history list with view toggle", async () => {
    await act(async () => {
      root?.render(
        <AskBobMaterialsPanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          initialMaterialsSnapshot={latestSnapshot}
          materialsSnapshotHistory={[historyEntry]}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Copper pipe");
    expect(container.textContent).toContain("Previous materials checklists");
    const historyItems = container.querySelectorAll('[data-testid="materials-history-item"]');
    expect(historyItems.length).toBe(1);
    expect(historyItems[0].textContent).toContain("Dec 30, 2024 10:00");

    const viewButton = findButton(historyItems[0] as HTMLElement, "View");
    expect(viewButton).toBeTruthy();

    await act(async () => {
      viewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(historyItems[0].textContent).toContain("Gasket");
    expect(historyItems[0].textContent).toContain("Qty: 1");
  });

  it("regenerates materials and moves the previous version into history", async () => {
    mockRegenerate.mockResolvedValue({
      ok: true,
      jobId: "job-1",
      suggestion: {
        scopeLines: [],
        materials: [
          {
            name: "PVC",
            quantity: 3,
            unit: "ft",
          },
        ],
        notes: "Confirm size.",
      },
      modelLatencyMs: 120,
      versionId: "version-2",
      createdAt: "2025-01-12T12:00:00Z",
      createdAtLabel: "Jan 12, 2025 12:00",
    });

    await act(async () => {
      root?.render(
        <AskBobMaterialsPanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          initialMaterialsSnapshot={latestSnapshot}
        />,
      );
      await Promise.resolve();
    });

    const regenButton = findButton(container, "Regenerate materials");
    expect(regenButton).toBeTruthy();

    await act(async () => {
      regenButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockRegenerate).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("PVC");
    expect(container.textContent).toContain("Previous materials checklists");
    const historyItems = container.querySelectorAll('[data-testid="materials-history-item"]');
    expect(historyItems.length).toBe(1);
    expect(historyItems[0].textContent).toContain("AskBob suggested 1 material");
  });

  it("shows an inline error when regeneration fails", async () => {
    mockRegenerate.mockResolvedValue({
      ok: false,
      code: "unknown",
      message: "AskBob could not regenerate materials.",
    });

    await act(async () => {
      root?.render(
        <AskBobMaterialsPanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          initialMaterialsSnapshot={latestSnapshot}
        />,
      );
      await Promise.resolve();
    });

    const regenButton = findButton(container, "Regenerate materials");
    expect(regenButton).toBeTruthy();

    await act(async () => {
      regenButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("AskBob could not regenerate materials.");
  });
});
