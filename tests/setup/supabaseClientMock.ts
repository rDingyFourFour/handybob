import { vi } from "vitest";

/** Minimal response shape that mirrors Supabase's PostgREST result set. */
export type SupabaseQueryResponse = {
  data: unknown[] | null;
  error: unknown | null;
};

/** Chainable stub for PostgREST queries. Supports the methods tests trigger. */
export type SupabaseQuery = {
  select: (...args: unknown[]) => SupabaseQuery;
  eq: (...args: unknown[]) => SupabaseQuery;
  gte: (...args: unknown[]) => SupabaseQuery;
  lt: (...args: unknown[]) => SupabaseQuery;
  in: (...args: unknown[]) => SupabaseQuery;
  or: (...args: unknown[]) => SupabaseQuery;
  not: (...args: unknown[]) => SupabaseQuery;
  order: (...args: unknown[]) => SupabaseQuery;
  range: (...args: unknown[]) => SupabaseQuery;
  insert?: (...args: unknown[]) => SupabaseQuery;
  update?: (...args: unknown[]) => SupabaseQuery;
  delete?: (...args: unknown[]) => SupabaseQuery;
  upsert?: (...args: unknown[]) => Promise<SupabaseQueryResponse>;
  then?: (...args: unknown[]) => Promise<SupabaseQueryResponse>;
  limit: (size?: number, options?: unknown) => Promise<SupabaseQueryResponse>;
  maybeSingle: () => Promise<{ data: unknown | null; error: unknown | null }>;
  single: () => Promise<{ data: unknown | null; error: unknown | null }>;
};

/** Shared mock state exposed to tests so their assertions can inspect query usage. */
export type SupabaseMockState = {
  supabase: {
    from: ReturnType<typeof vi.fn>;
    rpc: ReturnType<typeof vi.fn>;
  };
  queries: Record<string, SupabaseQuery>;
  responses: Record<string, SupabaseQueryResponse | SupabaseQueryResponse[]>;
  rpcResponses: Record<string, SupabaseQueryResponse | SupabaseQueryResponse[]>;
  limitErrors: Partial<Record<string, Error>>;
};

function ensureResponse(state: SupabaseMockState, table: string): SupabaseQueryResponse {
  const response = state.responses[table];
  if (!response) {
    const fallback = { data: [], error: null };
    state.responses[table] = fallback;
    return fallback;
  }
  if (Array.isArray(response)) {
    if (!response.length) {
      const fallback = { data: [], error: null };
      state.responses[table] = fallback;
      return fallback;
    }
    const next = response.shift()!;
    if (!response.length) {
      state.responses[table] = { data: [], error: null };
    }
    return next;
  }
  return response;
}

function createQuery(table: string, state: SupabaseMockState): SupabaseQuery {
  const query: SupabaseQuery = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    in: vi.fn(() => query),
    or: vi.fn(() => query),
    not: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    upsert: vi.fn(async () => {
      const response = ensureResponse(state, table);
      return Promise.resolve(response);
    }),
    limit: vi.fn(() => query),
    then: vi.fn((onFulfilled, onRejected) => {
      const error = state.limitErrors[table];
      const response = ensureResponse(state, table);
      const promise = error ? Promise.reject(error) : Promise.resolve(response);
      return promise.then(onFulfilled, onRejected);
    }),
    maybeSingle: vi.fn(async () => {
      const response = ensureResponse(state, table);
      const value = Array.isArray(response.data) ? response.data[0] ?? null : response.data;
      return { data: value, error: response.error };
    }),
    single: vi.fn(async () => {
      const response = ensureResponse(state, table);
      const value = Array.isArray(response.data) ? response.data[0] ?? null : response.data;
      return { data: value, error: response.error };
    }),
  };
  return query;
}

function ensureRpcResponse(
  state: SupabaseMockState,
  functionName: string,
): SupabaseQueryResponse {
  const response = state.rpcResponses[functionName];
  if (!response) {
    const fallback = { data: [], error: null };
    state.rpcResponses[functionName] = fallback;
    return fallback;
  }
  if (Array.isArray(response)) {
    if (!response.length) {
      const fallback = { data: [], error: null };
      state.rpcResponses[functionName] = fallback;
      return fallback;
    }
    const next = response.shift()!;
    if (!response.length) {
      state.rpcResponses[functionName] = { data: [], error: null };
    }
    return next;
  }
  return response;
}

/**
 * Sets up a lightweight Supabase client mock used across domain tests. The
 * implementation simply returns chainable no-ops and allows tables to inject
 * custom responses/error conditions.
 */
export function setupSupabaseMock(
  initialResponses: Record<string, SupabaseQueryResponse | SupabaseQueryResponse[]> = {}
): SupabaseMockState {
  const responses: Record<string, SupabaseQueryResponse | SupabaseQueryResponse[]> = {};
  for (const [table, response] of Object.entries(initialResponses)) {
    responses[table] = Array.isArray(response)
      ? response.map((entry) => ({ ...entry }))
      : { ...response };
  }

  const state: SupabaseMockState = {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
    queries: {},
    responses,
    rpcResponses: {},
    limitErrors: {},
  };

  state.supabase.from.mockImplementation((table: string) => {
    const query = createQuery(table, state);
    state.queries[table] = query;
    return query;
  });

  state.supabase.rpc.mockImplementation(async (functionName: string) => {
    return Promise.resolve(ensureRpcResponse(state, functionName));
  });

  return state;
}
