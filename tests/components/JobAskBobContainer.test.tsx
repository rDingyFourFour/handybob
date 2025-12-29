import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import JobAskBobContainer from "@/components/askbob/JobAskBobContainer";

const stageStatusItems = [
  { id: "diagnose", label: "Diagnose", status: "not_started" as const, order: 1 },
  { id: "materials", label: "Materials", status: "drafted" as const, order: 2 },
  { id: "quote", label: "Quote", status: "completed" as const, order: 3 },
];

describe("JobAskBobContainer", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
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

  it("renders a compact status list with minimal stage labels", async () => {
    await act(async () => {
      root?.render(
        <JobAskBobContainer
          workspaceId="workspace-1"
          jobId="job-1"
          stageStatusItems={stageStatusItems}
          nextActionLabel="Review follow-up guidance"
          nextActionMessage="Run follow-up guidance to decide the next move."
        />,
      );
      await Promise.resolve();
    });

    const compactList = container.querySelector('[data-testid="askbob-stage-status-compact"]');
    expect(compactList).toBeTruthy();
    const rows = compactList?.querySelectorAll("div") ?? [];
    expect(rows.length).toBe(stageStatusItems.length);
    expect(compactList?.textContent).toContain("Diagnose");
    expect(compactList?.textContent).toContain("Materials");
    expect(compactList?.textContent).toContain("Quote");
    expect(compactList?.textContent).toContain("Not started");
    expect(compactList?.textContent).toContain("Drafted");
    expect(compactList?.textContent).toContain("Completed");
  });
});
