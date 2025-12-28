import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionState } from "@/app/public/bookings/[slug]/actions";
import { BookingForm } from "@/app/public/bookings/[slug]/BookingForm";

const mockReplace = vi.fn();
const mockSubmitPublicBooking = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: (...args: unknown[]) => mockReplace(...args),
  }),
}));

vi.mock("@/app/public/bookings/[slug]/actions", () => ({
  submitPublicBooking: (...args: unknown[]) => mockSubmitPublicBooking(...args),
}));

function createDeferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

describe("BookingForm", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockReplace.mockReset();
    mockSubmitPublicBooking.mockReset();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderForm() {
    if (!root) {
      throw new Error("missing root");
    }
    await act(async () => {
      root?.render(<BookingForm workspaceSlug="demo" workspaceName="Demo Co" />);
    });
  }

  async function flushReactUpdates(iterations = 5) {
    await act(async () => {
      await Promise.resolve();
    });
    for (let i = 0; i < iterations; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    await act(async () => {
      await Promise.resolve();
    });
  }

  function fillRequiredFields() {
    const nameInput = container.querySelector<HTMLInputElement>("#name");
    const emailInput = container.querySelector<HTMLInputElement>("#email");
    const descriptionInput = container.querySelector<HTMLTextAreaElement>("#description");
    if (!nameInput || !emailInput || !descriptionInput) {
      throw new Error("missing required inputs");
    }
    nameInput.value = "Taylor Example";
    emailInput.value = "taylor@example.com";
    descriptionInput.value = "Need help with a broken window.";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    descriptionInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function submitForm() {
    const form = container.querySelector("form");
    if (!form) {
      throw new Error("missing form");
    }
    await act(async () => {
      if (typeof (form as HTMLFormElement).requestSubmit === "function") {
        (form as HTMLFormElement).requestSubmit();
      } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    });
  }

  it("shows pending state, surfaces errors, and avoids useFormState warnings", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const deferred = createDeferred<ActionState>();
    mockSubmitPublicBooking.mockImplementationOnce(() => deferred.promise);

    await renderForm();
    fillRequiredFields();

    await submitForm();
    await flushReactUpdates(1);

    expect(container.textContent).toContain("Sending...");

    deferred.resolve({
      status: "error",
      errors: { name: "Name is required." },
      message: "We could not save your request. Please try again.",
      errorCode: "invalid_input",
    });

    await flushReactUpdates();

    expect(container.textContent).toContain("We could not save your request. Please try again.");
    expect(container.textContent).toContain("Name is required.");

    const errorMessages = errorSpy.mock.calls.map((call) => call.join(" "));
    expect(
      errorMessages.some((message) =>
        message.includes("ReactDOM.useFormState has been renamed to React.useActionState"),
      ),
    ).toBe(false);
  });

  it("renders confirmation content and resets the form", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockSubmitPublicBooking.mockResolvedValueOnce({
      status: "success",
      workspaceId: "workspace-1",
      jobId: "job-1",
      customerId: "cust-1",
      isOwnerHandoffEligible: false,
      redirectTo: null,
      reusedExistingBookingJob: false,
    });

    await renderForm();
    fillRequiredFields();

    await submitForm();
    await flushReactUpdates();

    expect(container.textContent).toContain("Request received");
    expect(container.textContent).toContain("What to expect next");
    expect(container.textContent).toContain("We'll confirm the details and timing.");
    expect(container.textContent).toContain("We'll follow up if anything is unclear.");
    expect(container.textContent).toContain("You'll get a scheduling update soon.");

    const confirmationLogs = logSpy.mock.calls.filter(
      ([label]) => label === "[public-booking-confirmation-visible]",
    );
    expect(confirmationLogs).toHaveLength(1);

    const resetButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Submit another request"),
    );
    expect(resetButton).toBeTruthy();
    await act(async () => {
      resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReactUpdates();

    expect(container.querySelector("form")).not.toBeNull();
  });

  it("shows the owner handoff CTA and routes on click", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockSubmitPublicBooking.mockResolvedValueOnce({
      status: "success",
      workspaceId: "workspace-1",
      jobId: "job-2",
      customerId: "cust-2",
      isOwnerHandoffEligible: true,
      redirectTo: "/jobs/job-2",
      reusedExistingBookingJob: false,
    });

    await renderForm();
    fillRequiredFields();

    await submitForm();
    await flushReactUpdates();

    const handoffButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Open in AskBob"),
    );
    expect(handoffButton).toBeTruthy();

    await act(async () => {
      handoffButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockReplace).toHaveBeenCalledWith("/jobs/job-2");
    expect(
      logSpy.mock.calls.some(
        ([label, payload]) =>
          label === "[public-booking-owner-handoff-click]" &&
          payload.workspaceId === "workspace-1" &&
          payload.jobId === "job-2",
      ),
    ).toBe(true);
  });

  it("ignores rapid double submits and keeps confirmation stable", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const deferred = createDeferred<ActionState>();
    mockSubmitPublicBooking.mockImplementationOnce(() => deferred.promise);

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    nowSpy.mockReturnValueOnce(1_000);
    await renderForm();
    fillRequiredFields();

    await submitForm();
    nowSpy.mockReturnValueOnce(1_100);
    await submitForm();

    expect(mockSubmitPublicBooking).toHaveBeenCalledTimes(1);
    expect(
      logSpy.mock.calls.some(([label]) => label === "[public-booking-submit-rapid-click-ignored]"),
    ).toBe(true);

    deferred.resolve({
      status: "success",
      workspaceId: "workspace-1",
      jobId: "job-rapid",
      customerId: "cust-rapid",
      isOwnerHandoffEligible: false,
      redirectTo: null,
      reusedExistingBookingJob: false,
    });

    await flushReactUpdates();

    const confirmation = container.querySelector<HTMLElement>(
      "[data-testid=\"public-booking-confirmation\"]",
    );
    expect(confirmation).toBeTruthy();
    expect(confirmation?.getAttribute("data-job-id")).toBe("job-rapid");
    expect(confirmation?.textContent).toContain("Request received");

    const confirmationText = confirmation?.textContent;
    await flushReactUpdates();
    const confirmationAfter = container.querySelector<HTMLElement>(
      "[data-testid=\"public-booking-confirmation\"]",
    );
    expect(confirmationAfter).toBe(confirmation);
    expect(confirmationAfter?.textContent).toBe(confirmationText);
  });
});
