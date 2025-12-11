// Test-only env scaffolding so Supabase helpers have the values they expect.
// These defaults are safe for offline/unit execution; real Supabase calls should never use them.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://example.supabase.test";
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
}
if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
}

class SimpleFormData implements Iterable<[string, string]> {
  private store = new Map<string, string[]>();

  append(key: string, value: string) {
    const entries = this.store.get(key) ?? [];
    entries.push(String(value));
    this.store.set(key, entries);
  }

  set(key: string, value: string) {
    this.store.set(key, [String(value)]);
  }

  get(key: string) {
    const entries = this.store.get(key);
    return entries ? entries[0] : null;
  }

  getAll(key: string) {
    return this.store.get(key) ?? [];
  }

  has(key: string) {
    return this.store.has(key);
  }

  delete(key: string) {
    this.store.delete(key);
  }

  *entries() {
    for (const [key, values] of this.store.entries()) {
      for (const value of values) {
        yield [key, value];
      }
    }
  }

  *keys() {
    for (const [key] of this.store.entries()) {
      yield key;
    }
  }

  *values() {
    for (const [, values] of this.store.entries()) {
      for (const value of values) {
        yield value;
      }
    }
  }

  forEach(callback: (value: string, key: string) => void) {
    for (const [key, values] of this.store.entries()) {
      values.forEach((value) => callback(value, key));
    }
  }

  [Symbol.iterator]() {
    return this.entries();
  }
}

if (typeof globalThis.FormData === "undefined") {
  globalThis.FormData = SimpleFormData as typeof FormData;
}

if (typeof globalThis.IS_REACT_ACT_ENVIRONMENT === "undefined") {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}
