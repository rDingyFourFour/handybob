import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import QuotesListClient, { type QuoteRowType } from "@/components/quotes/QuotesListClient";

const buildQuote = (overrides: Partial<QuoteRowType> = {}): QuoteRowType => ({
  id: "quote-1",
  status: "sent",
  totalLabel: "$120.00",
  createdLabel: "Jan 10, 2024",
  jobId: "job-1",
  clientMessageTemplate: "Hello there",
  smartQuoteUsed: false,
  ...overrides,
});

describe("QuotesListClient hydration structure", () => {
  it("keeps a stable list wrapper and article rows when quotes exist", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(<QuotesListClient initialQuotes={[buildQuote()]} />);
    });

    const listWrapper = container.querySelector("[data-testid=\"quotes-list\"]");
    expect(listWrapper).not.toBeNull();
    expect(listWrapper?.tagName).toBe("DIV");
    expect(listWrapper?.className).toContain("space-y-2");

    const rowWrapper = container.querySelector("article");
    expect(rowWrapper).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("uses the same list wrapper element when empty", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(<QuotesListClient initialQuotes={[]} />);
    });

    const listWrapper = container.querySelector("[data-testid=\"quotes-list\"]");
    expect(listWrapper).not.toBeNull();
    expect(listWrapper?.tagName).toBe("DIV");
    expect(listWrapper?.className).toContain("space-y-2");

    const rowWrapper = container.querySelector("article");
    expect(rowWrapper).toBeNull();
    expect(container.textContent).toContain("No quotes yet");

    act(() => {
      root.unmount();
    });
  });
});
