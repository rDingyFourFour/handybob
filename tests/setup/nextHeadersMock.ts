import { vi } from "vitest";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";

let nextHeadersUserAgent = DEFAULT_USER_AGENT;

export function setNextHeadersUserAgent(userAgent: string) {
  nextHeadersUserAgent = userAgent;
}

export function resetNextHeadersUserAgent() {
  nextHeadersUserAgent = DEFAULT_USER_AGENT;
}

const createHeadersResult = () => ({
  get: (key: string) =>
    key.toLowerCase() === "user-agent" ? nextHeadersUserAgent : null,
});

vi.mock("next/headers", () => ({
  headers: async () => createHeadersResult(),
}));
