import { describe, expect, it } from "vitest";

import type { AskBobResponseDTO } from "@/lib/domain/askbob/types";
import {
  formatAskBobCustomerDraft,
  formatAskBobJobNote,
} from "@/lib/domain/askbob/formatters";

const sampleDto: AskBobResponseDTO = {
  sessionId: "session-example",
  responseId: "response-example",
  createdAt: "2023-06-01T12:00:00Z",
  sections: [
    {
      type: "steps",
      title: "Steps to resolve",
      items: ["Turn off the main", "Replace the filter"],
    },
    {
      type: "safety",
      title: "Safety cautions",
      items: ["Wear gloves", "Mind the loose debris"],
    },
  ],
  materials: [
    {
      name: "Air filter",
      quantity: "1",
      notes: "20x20x1",
    },
  ],
};

describe("AskBob formatter surface", () => {
  it("exports the required helpers", () => {
    expect(typeof formatAskBobJobNote).toBe("function");
    expect(typeof formatAskBobCustomerDraft).toBe("function");
  });

  it("builds a job note with context and sections", () => {
    const note = formatAskBobJobNote(sampleDto, {
      jobId: "job-123",
      quoteId: "quote-456",
    });
    expect(note).toContain("Job job-123");
    expect(note).toContain("Quote quote-456");
    expect(note).toContain("Steps to resolve");
    expect(note).toContain("1. Turn off the main");
    expect(note).toContain("Materials");
    expect(note).toContain("Air filter");
  });

  it("builds a customer draft that highlights AskBob insights", () => {
    const draft = formatAskBobCustomerDraft(sampleDto);
    expect(draft).toContain("Hi,");
    expect(draft).toContain("Here's a quick recap");
    expect(draft).toContain("Steps to resolve");
    expect(draft).toContain("1. Turn off the main");
    expect(draft).toContain("Materials");
    expect(draft).toContain("Air filter");
    expect(draft).toContain("Let me know if you have any questions");
  });
});
