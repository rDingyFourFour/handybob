import { vi } from "vitest";

type HeaderStore = {
  get: (key: string) => string | null;
};

const DEFAULT_HEADER_VALUES: Record<string, string | null> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
};

const headerValues: Record<string, string | null> = { ...DEFAULT_HEADER_VALUES };

export function setNextHeadersUserAgent(userAgent: string) {
  headerValues["user-agent"] = userAgent;
}

export function resetNextHeadersUserAgent() {
  headerValues["user-agent"] = DEFAULT_HEADER_VALUES["user-agent"];
}

function createHeaderStore(values: Record<string, string | null>): HeaderStore {
  return {
    get: (key: string) => values[key.toLowerCase()] ?? null,
  };
}

function createHeaderPromise(): Promise<HeaderStore> & { get: HeaderStore["get"] } {
  const capturedValues = { ...headerValues };
  let resolved = false;
  let store: HeaderStore | null = null;

  const promise = new Promise<HeaderStore>((resolve) => {
    queueMicrotask(() => {
      store = createHeaderStore(capturedValues);
      resolved = true;
      resolve(store);
    });
  }) as Promise<HeaderStore> & { get: HeaderStore["get"] };

  promise.get = (key: string) => {
    if (!resolved || !store) {
      throw new Error("headers().get must be called after awaiting headers()");
    }
    return store.get(key);
  };

  return promise;
}

const createCookiesResult = () => ({
  get: vi.fn().mockReturnValue(null),
  getAll: vi.fn().mockReturnValue([]),
  has: vi.fn().mockReturnValue(false),
});

vi.mock("next/headers", () => ({
  headers: () => createHeaderPromise(),
  cookies: () => createCookiesResult(),
}));
