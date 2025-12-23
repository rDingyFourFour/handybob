import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateInvoiceFromAcceptedQuoteAction = vi.fn();
const mockUpdateInvoiceStatusAction = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/app/(app)/invoices/actions/createInvoiceFromAcceptedQuoteAction", () => ({
  createInvoiceFromAcceptedQuoteAction: (...args: unknown[]) =>
    mockCreateInvoiceFromAcceptedQuoteAction(...args),
}));

vi.mock("@/app/(app)/invoices/actions/updateInvoiceStatusAction", () => ({
  updateInvoiceStatusAction: (...args: unknown[]) => mockUpdateInvoiceStatusAction(...args),
}));

import JobInvoiceSection from "@/app/(app)/jobs/[id]/JobInvoiceSection";

const BASE_INVOICE = {
  id: "invoice-1",
  quote_id: "quote-1",
  created_at: "2025-01-01T00:00:00.000Z",
  invoice_status: "draft",
  sent_at: null,
  paid_at: null,
  voided_at: null,
  snapshot_total_cents: 9900,
  snapshot_tax_cents: 900,
  snapshot_subtotal_cents: 9000,
  currency: "USD",
};

describe("JobInvoiceSection lifecycle controls", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockCreateInvoiceFromAcceptedQuoteAction.mockReset();
    mockUpdateInvoiceStatusAction.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    if (root) {
      root.unmount();
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderSection(params?: {
    invoiceOverride?: Partial<typeof BASE_INVOICE>;
    invoice?: typeof BASE_INVOICE | null;
    acceptedQuoteId?: string | null;
  }) {
    if (!root) {
      throw new Error("missing root");
    }
    const invoice =
      params && "invoice" in params
        ? params.invoice
        : { ...BASE_INVOICE, ...(params?.invoiceOverride ?? {}) };
    const acceptedQuoteId =
      params && "acceptedQuoteId" in params ? params.acceptedQuoteId ?? null : "quote-1";
    await act(async () => {
      root?.render(
        <JobInvoiceSection
          workspaceId="workspace-1"
          jobId="job-1"
          acceptedQuoteId={acceptedQuoteId}
          invoice={invoice}
          invoiceCreatedLabel="Jan 1, 2025"
        />,
      );
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

  function findButton(label: string) {
    return Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === label,
    );
  }

  async function submitButton(label: string) {
    const button = findButton(label);
    if (!button) {
      throw new Error(`missing button: ${label}`);
    }
    const form = button.closest("form");
    if (!form) {
      throw new Error(`missing form for button: ${label}`);
    }
    await act(async () => {
      if (typeof (form as HTMLFormElement).requestSubmit === "function") {
        (form as HTMLFormElement).requestSubmit(button);
      } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    });
  }

  it("shows draft controls and updates to sent", async () => {
    mockUpdateInvoiceStatusAction.mockResolvedValueOnce({
      success: true,
      code: "ok",
      invoiceId: "invoice-1",
      jobId: "job-1",
      newStatus: "sent",
      sentAt: "2025-01-02T00:00:00.000Z",
      paidAt: null,
      voidedAt: null,
    });

    await renderSection({ invoiceOverride: { invoice_status: "draft" } });
    await flushReactUpdates();

    expect(container.innerHTML).toContain("Mark as sent");
    expect(container.innerHTML).toContain("Void invoice");
    expect(container.innerHTML).not.toContain("Mark as paid");

    await submitButton("Mark as sent");
    await flushReactUpdates();

    expect(container.innerHTML).toContain("Invoice marked as Sent.");
    expect(container.innerHTML).toContain("Sent");
    expect(container.innerHTML).toContain("$99.00");
  });

  it("shows sent controls and updates to paid", async () => {
    mockUpdateInvoiceStatusAction.mockResolvedValueOnce({
      success: true,
      code: "ok",
      invoiceId: "invoice-1",
      jobId: "job-1",
      newStatus: "paid",
      sentAt: "2025-01-02T00:00:00.000Z",
      paidAt: "2025-01-03T00:00:00.000Z",
      voidedAt: null,
    });

    await renderSection({
      invoiceOverride: {
        invoice_status: "sent",
        sent_at: "2025-01-02T00:00:00.000Z",
      },
    });
    await flushReactUpdates();

    expect(container.innerHTML).toContain("Mark as paid");
    expect(container.innerHTML).toContain("Void invoice");

    await submitButton("Mark as paid");
    await flushReactUpdates();

    expect(container.innerHTML).toContain("Invoice marked as Paid.");
    expect(container.innerHTML).toContain("Paid");
    expect(container.innerHTML).toContain("$99.00");
  });

  it("shows terminal hint for paid invoices", async () => {
    await renderSection({
      invoiceOverride: {
        invoice_status: "paid",
        paid_at: "2025-01-03T00:00:00.000Z",
      },
    });
    await flushReactUpdates();

    expect(container.innerHTML).toContain("Invoice is paid and cannot be changed.");
    expect(container.innerHTML).not.toContain("Mark as sent");
    expect(container.innerHTML).not.toContain("Mark as paid");
    expect(container.innerHTML).not.toContain("Void invoice");
  });

  it("shows terminal hint for void invoices and updates to void", async () => {
    mockUpdateInvoiceStatusAction.mockResolvedValueOnce({
      success: true,
      code: "ok",
      invoiceId: "invoice-1",
      jobId: "job-1",
      newStatus: "void",
      sentAt: null,
      paidAt: null,
      voidedAt: "2025-01-04T00:00:00.000Z",
    });

    await renderSection({ invoiceOverride: { invoice_status: "draft" } });
    await flushReactUpdates();

    await submitButton("Void invoice");
    await flushReactUpdates();

    expect(container.innerHTML).toContain("Invoice marked as Void.");
    expect(container.innerHTML).toContain("Void");
    expect(container.innerHTML).toContain("Invoice is void and cannot be changed.");
    expect(container.innerHTML).toContain("$99.00");
  });

  it("disables invoice creation when no accepted quote exists", async () => {
    await renderSection({ invoice: null, acceptedQuoteId: null });
    await flushReactUpdates();

    expect(container.innerHTML).toContain("Accept a quote to create an invoice.");
    const button = findButton("Create invoice from accepted quote");
    expect(button).toBeDefined();
    expect(button?.hasAttribute("disabled")).toBe(true);
  });

  it("enables invoice creation when an accepted quote exists", async () => {
    await renderSection({ invoice: null, acceptedQuoteId: "quote-1" });
    await flushReactUpdates();

    const button = findButton("Create invoice from accepted quote");
    expect(button).toBeDefined();
    expect(button?.hasAttribute("disabled")).toBe(false);
  });
});
