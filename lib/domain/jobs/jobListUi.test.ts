import { describe, expect, it } from "vitest";

import {
  buildJobRelatedSubtitle,
  getJobsEmptyStateVariant,
} from "./jobListUi";

describe("getJobsEmptyStateVariant", () => {
  it("returns brand-new for a workspace without jobs and no filters/search", () => {
    expect(
      getJobsEmptyStateVariant({
        hasAnyJobsInWorkspace: false,
        visibleJobsCount: 0,
        hasActiveFilters: false,
        isSearching: false,
      }),
    ).toBe("brand-new");
  });

  it("returns filters when filters hide all rows", () => {
    expect(
      getJobsEmptyStateVariant({
        hasAnyJobsInWorkspace: true,
        visibleJobsCount: 0,
        hasActiveFilters: true,
        isSearching: false,
      }),
    ).toBe("filters");
  });

  it("returns filters when search hides all rows", () => {
    expect(
      getJobsEmptyStateVariant({
        hasAnyJobsInWorkspace: true,
        visibleJobsCount: 0,
        hasActiveFilters: false,
        isSearching: true,
      }),
    ).toBe("filters");
  });

  it("returns none when there is at least one visible job", () => {
    expect(
      getJobsEmptyStateVariant({
        hasAnyJobsInWorkspace: true,
        visibleJobsCount: 5,
        hasActiveFilters: true,
        isSearching: true,
      }),
    ).toBe("none");
  });
});

describe("buildJobRelatedSubtitle", () => {
  const job = {
    customers: null,
  };

  it("includes customer name with updated timestamp", () => {
    const subtitle = buildJobRelatedSubtitle({
      customerName: "Jane Smith",
      job: { ...job, updated_at: "2024-01-01T00:00:00Z" },
    });

    expect(subtitle).toContain("Jane Smith");
    expect(subtitle).toContain("Updated");
  });

  it("includes customer name with created timestamp when updated is missing", () => {
    const subtitle = buildJobRelatedSubtitle({
      customerName: "Jane Smith",
      job: { ...job, created_at: "2024-02-01T00:00:00Z" },
    });

    expect(subtitle).toContain("Jane Smith");
    expect(subtitle).toContain("Updated");
  });

  it("shows a generic job line when no customer is present", () => {
    const subtitle = buildJobRelatedSubtitle({
      job: { ...job, created_at: "2024-03-01T00:00:00Z" },
    });

    expect(subtitle).toContain("Job");
    expect(subtitle).toContain("Created");
    expect(subtitle).not.toMatch(/undefined|null/);
  });

  it("returns a fallback when no timestamps or customer", () => {
    const subtitle = buildJobRelatedSubtitle({
      job,
    });

    expect(subtitle).toBe("Job");
  });
});
