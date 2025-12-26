import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import GlobalComposer from "@/app/(app)/messages/GlobalComposer";

const customers = [{ id: "cust-1", name: "Customer", phone: "+15550001111" }];
const jobs = [{ id: "job-1", title: "Follow-up job", customer_id: "cust-1" }];
const baseProps = {
  workspaceId: "workspace-1",
  customers,
  jobs,
  initialCustomerId: "cust-1",
  initialJobId: "job-1",
  onClose: vi.fn(),
  open: true,
};
const DRAFT_KEY_HINT = "AskBob’s draft couldn’t be loaded. You can still write a message here.";

describe("GlobalComposer draftKey hydration", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  function renderComposer(props: Partial<typeof baseProps> & { initialBody?: string | null; initialOrigin?: string | null }) {
    act(() => {
      root?.render(
        <GlobalComposer
          {...baseProps}
          {...props}
        />,
      );
    });
  }

  it("hydrates from cache and clears the stored draft", () => {
    const key = "abc-key";
    const payload = {
      body: "Hi there",
      createdAtIso: new Date().toISOString(),
      origin: "askbob-after-call",
      jobId: "job-1",
      customerId: "cust-1",
    };
    window.sessionStorage.setItem(key, JSON.stringify(payload));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderComposer({ initialBodyKey: key, initialOrigin: "askbob-after-call" });

    const textarea = container.querySelector("textarea");
    expect(textarea?.textContent?.length).toBeGreaterThanOrEqual(0);
    expect((textarea as HTMLTextAreaElement).value).toBe("Hi there");
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      "[messages-compose-draftkey-cache-hit]",
      expect.objectContaining({
        origin: "askbob-after-call",
        hasDraftKey: true,
        bodyLength: payload.body.length,
      }),
    );
  });

  it("shows fallback hint when cache is missing", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderComposer({ initialBodyKey: "missing-key" });

    expect(container.textContent).toContain(DRAFT_KEY_HINT);
    expect(logSpy).toHaveBeenCalledWith(
      "[messages-compose-draftkey-cache-miss]",
      expect.objectContaining({
        reason: "not_found",
        hasDraftKey: true,
      }),
    );
  });

  it("clears expired cache and shows hint", () => {
    const key = "expired-key";
    const payload = {
      body: "Old draft",
      createdAtIso: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      origin: "askbob-after-call",
    };
    window.sessionStorage.setItem(key, JSON.stringify(payload));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderComposer({ initialBodyKey: key });

    expect(container.textContent).toContain(DRAFT_KEY_HINT);
    expect(logSpy).toHaveBeenCalledWith(
      "[messages-compose-draftkey-cache-miss]",
      expect.objectContaining({
        reason: "expired",
      }),
    );
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it("treats malformed storage as parse error and hints", () => {
    const key = "bad-key";
    window.sessionStorage.setItem(key, "not-a-json");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderComposer({ initialBodyKey: key });

    expect(container.textContent).toContain(DRAFT_KEY_HINT);
    expect(logSpy).toHaveBeenCalledWith(
      "[messages-compose-draftkey-cache-miss]",
      expect.objectContaining({
        reason: "parse_error",
      }),
    );
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it("skips hydration when body already initialized or typed", () => {
    const key = "skip-key";
    const payload = {
      body: "New draft",
      createdAtIso: new Date().toISOString(),
      origin: "askbob-after-call",
    };
    window.sessionStorage.setItem(key, JSON.stringify(payload));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderComposer({ initialBodyKey: key, initialBody: "Already typed" });

    const textarea = container.querySelector("textarea");
    expect((textarea as HTMLTextAreaElement).value).toBe("Already typed");
    expect(container.textContent).not.toContain(DRAFT_KEY_HINT);
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      "[messages-compose-draftkey-cache-miss]",
      expect.objectContaining({
        reason: "skipped_overwrite",
      }),
    );
  });

  it("hydrates call-session drafts when the composer is empty", () => {
    const key = "call-session-key";
    const payload = {
      body: "Call session draft",
      createdAtIso: new Date().toISOString(),
      origin: "call_session_after_call",
      jobId: "job-1",
      customerId: "cust-1",
      workspaceId: "workspace-1",
      callId: "call-1",
    };
    window.sessionStorage.setItem(key, JSON.stringify(payload));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderComposer({ initialBodyKey: key, initialOrigin: "call_session_after_call" });

    const textarea = container.querySelector("textarea");
    expect((textarea as HTMLTextAreaElement).value).toBe("Call session draft");
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      "[messages-compose-draftkey-origin-call-session]",
      expect.objectContaining({ applied: true }),
    );
    logSpy.mockRestore();
  });

  it("does not overwrite call-session drafts when the composer already has text", () => {
    const key = "call-session-skip-key";
    const payload = {
      body: "Call session draft",
      createdAtIso: new Date().toISOString(),
      origin: "call_session_after_call",
      jobId: "job-1",
      customerId: "cust-1",
      workspaceId: "workspace-1",
      callId: "call-1",
    };
    window.sessionStorage.setItem(key, JSON.stringify(payload));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderComposer({
      initialBodyKey: key,
      initialOrigin: "call_session_after_call",
      initialBody: "Existing text",
    });

    const textarea = container.querySelector("textarea");
    expect((textarea as HTMLTextAreaElement).value).toBe("Existing text");
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      "[messages-compose-draftkey-origin-call-session]",
      expect.objectContaining({ applied: false }),
    );
    logSpy.mockRestore();
  });
});
