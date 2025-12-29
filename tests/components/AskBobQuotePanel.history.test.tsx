import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AskBobQuoteSnapshotPayload,
  AskBobTaskSnapshotVersion,
} from "@/lib/domain/askbob/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/app/(app)/askbob/quote-actions", () => ({
  runAskBobQuoteGenerateAction: vi.fn(),
  regenerateAskBobQuoteAction: vi.fn(),
}));

import { regenerateAskBobQuoteAction } from "@/app/(app)/askbob/quote-actions";
import AskBobQuotePanel from "@/components/askbob/AskBobQuotePanel";

const mockRegenerate = regenerateAskBobQuoteAction as unknown as ReturnType<typeof vi.fn>;

const latestSnapshot: AskBobQuoteSnapshotPayload = {
  lines: [
    {
      description: "Replace valve",
      quantity: 1,
      unit: "job",
      unitPrice: 120,
      lineTotal: 120,
    },
  ],
  materials: [
    {
      name: "Sealant",
      quantity: 1,
      unit: "tube",
      estimatedUnitCost: 6,
      estimatedTotalCost: 6,
    },
  ],
  notes: "Confirm access before finalizing.",
};

const historyEntry: AskBobTaskSnapshotVersion<AskBobQuoteSnapshotPayload> = {
  id: "version-1",
  task: "quote.generate",
  createdAt: "2024-12-29T10:00:00Z",
  createdAtLabel: "Dec 29, 2024 10:00",
  payload: {
    lines: [
      {
        description: "Flush line",
        quantity: 1,
        unit: "job",
        unitPrice: 80,
        lineTotal: 80,
      },
    ],
    materials: null,
    notes: "Customer to supply access.",
  },
};

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes(text),
  );
}

describe("AskBobQuotePanel history", () => {
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

  it("renders the latest quote and a history list with view toggle", async () => {
    await act(async () => {
      root?.render(
        <AskBobQuotePanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          initialQuoteSnapshot={latestSnapshot}
          quoteSnapshotHistory={[historyEntry]}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Replace valve");
    expect(container.textContent).toContain("Previous quote drafts");
    const historyItems = container.querySelectorAll('[data-testid="quote-history-item"]');
    expect(historyItems.length).toBe(1);
    expect(historyItems[0].textContent).toContain("Dec 29, 2024 10:00");

    const viewButton = findButton(historyItems[0] as HTMLElement, "View");
    expect(viewButton).toBeTruthy();

    await act(async () => {
      viewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(historyItems[0].textContent).toContain("Flush line");
    expect(historyItems[0].textContent).toContain("Qty 1");
  });

  it("regenerates the quote and moves the previous version into history", async () => {
    mockRegenerate.mockResolvedValue({
      ok: true,
      jobId: "job-1",
      suggestion: {
        scopeLines: [
          {
            description: "Install new cartridge",
            quantity: 1,
            unit: "job",
          },
        ],
        materials: [],
        notes: "Confirm pricing.",
      },
      modelLatencyMs: 140,
      versionId: "version-2",
      createdAt: "2025-01-12T14:00:00Z",
      createdAtLabel: "Jan 12, 2025 14:00",
    });

    await act(async () => {
      root?.render(
        <AskBobQuotePanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          initialQuoteSnapshot={latestSnapshot}
        />,
      );
      await Promise.resolve();
    });

    const regenButton = findButton(container, "Regenerate quote draft");
    expect(regenButton).toBeTruthy();

    await act(async () => {
      regenButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockRegenerate).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Install new cartridge");
    expect(container.textContent).toContain("Previous quote drafts");
    const historyItems = container.querySelectorAll('[data-testid="quote-history-item"]');
    expect(historyItems.length).toBe(1);
    expect(historyItems[0].textContent).toContain("AskBob drafted 1 quote line");
  });

  it("shows an inline error when regeneration fails", async () => {
    mockRegenerate.mockResolvedValue({
      ok: false,
      code: "unknown",
      message: "AskBob could not regenerate a quote.",
    });

    await act(async () => {
      root?.render(
        <AskBobQuotePanel
          workspaceId="workspace-1"
          jobId="job-1"
          jobTitle="Fix sink"
          jobDescription="Leaking pipe"
          initialQuoteSnapshot={latestSnapshot}
        />,
      );
      await Promise.resolve();
    });

    const regenButton = findButton(container, "Regenerate quote draft");
    expect(regenButton).toBeTruthy();

    await act(async () => {
      regenButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("AskBob could not regenerate a quote.");
  });
});
