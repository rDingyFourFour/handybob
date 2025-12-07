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
  order: (...args: unknown[]) => SupabaseQuery;
  range: (...args: unknown[]) => SupabaseQuery;
  insert?: (...args: unknown[]) => SupabaseQuery;
  update?: (...args: unknown[]) => SupabaseQuery;
  delete?: (...args: unknown[]) => SupabaseQuery;
  limit: (size?: number, options?: unknown) => Promise<SupabaseQueryResponse>;
  maybeSingle: () => Promise<{ data: unknown | null; error: unknown | null }>;
  single: () => Promise<{ data: unknown | null; error: unknown | null }>;
};

/** Shared mock state exposed to tests so their assertions can inspect query usage. */
export type SupabaseMockState = {
  supabase: {
    from: ReturnType<typeof vi.fn>;
  };
  queries: Record<string, SupabaseQuery>;
  responses: Record<string, SupabaseQueryResponse>;
  limitErrors: Partial<Record<string, Error>>;
};

function ensureResponse(state: SupabaseMockState, table: string) {
  if (!state.responses[table]) {
    state.responses[table] = { data: [], error: null };
  }
  return state.responses[table];
}

function createQuery(table: string, state: SupabaseMockState): SupabaseQuery {
  const query: SupabaseQuery = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    in: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    limit: vi.fn(async () => {
      const error = state.limitErrors[table];
      if (error) {
        return Promise.reject(error);
      }
      return Promise.resolve(ensureResponse(state, table));
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

/**
 * Sets up a lightweight Supabase client mock used across domain tests. The
 * implementation simply returns chainable no-ops and allows tables to inject
 * custom responses/error conditions.
 */
export function setupSupabaseMock(
  initialResponses: Record<string, SupabaseQueryResponse> = {}
): SupabaseMockState {
  const responses: Record<string, SupabaseQueryResponse> = {};
  for (const [table, response] of Object.entries(initialResponses)) {
    responses[table] = { ...response };
  }

  const state: SupabaseMockState = {
    supabase: {
      from: vi.fn(),
    },
    queries: {},
    responses,
    limitErrors: {},
  };

  state.supabase.from.mockImplementation((table: string) => {
    const query = createQuery(table, state);
    state.queries[table] = query;
    return query;
  });

  return state;
}
