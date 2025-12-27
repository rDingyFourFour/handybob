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
      successName: null,
      jobId: null,
      customerId: null,
      redirectTo: null,
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

  it("redirects after a successful submission", async () => {
    mockSubmitPublicBooking.mockResolvedValueOnce({
      status: "success",
      errors: {},
      message: null,
      successName: "Jamie",
      jobId: "job-1",
      customerId: "cust-1",
      redirectTo: "/public/bookings/demo/thanks",
      errorCode: null,
    });

    await renderForm();
    fillRequiredFields();

    await submitForm();
    await flushReactUpdates();

    expect(container.textContent).toContain("Thanks Jamie");
    expect(mockReplace).toHaveBeenCalledWith("/public/bookings/demo/thanks");
  });
});
