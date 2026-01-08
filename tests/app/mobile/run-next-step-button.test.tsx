import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const useFormStatusMock = vi.hoisted(() =>
  vi.fn(() => ({ pending: false }))
);
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useFormStatus: useFormStatusMock,
  };
});

import RunNextStepButton from "@/app/m/action/RunNextStepButton";

describe("RunNextStepButton", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
    useFormStatusMock.mockReset();
  });

  it("renders the default label when idle", () => {
    useFormStatusMock.mockReturnValue({ pending: false });

    act(() => {
      root?.render(<RunNextStepButton data-testid="run-button" />);
    });
    const button = container.querySelector('[data-testid="run-button"]') as
      | HTMLButtonElement
      | null;
    expect(button?.textContent).toBe("Run next step");
    expect(button?.hasAttribute("disabled")).toBe(false);
  });

  it("renders the pending label and disables while pending", () => {
    useFormStatusMock.mockReturnValue({ pending: true });

    act(() => {
      root?.render(<RunNextStepButton data-testid="run-button" />);
    });
    const button = container.querySelector('[data-testid="run-button"]') as
      | HTMLButtonElement
      | null;
    expect(button?.textContent).toBe("Running…");
    expect(button?.hasAttribute("disabled")).toBe(true);
  });
});
