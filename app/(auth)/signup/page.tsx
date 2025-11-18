"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = (formData.get("email") as string)?.trim();
    const password = formData.get("password") as string;

    const supabase = createClient();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
          <p className="text-xs text-slate-400">
            Access your HandyBob workspace.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="hb-label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required className="hb-input" />
          </div>

          <div>
            <label className="hb-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={6}
              required
              className="hb-input"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button type="submit" disabled={loading} className="hb-button w-full">
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="hb-muted">
          Need an account?{" "}
          <a href="/signup" className="underline underline-offset-2">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}