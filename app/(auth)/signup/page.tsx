"use client";

"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { createClient } from "@/utils/supabase/client";

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = (formData.get("email") as string)?.trim();
    const password = formData.get("password") as string;

    const supabase = createClient();

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setSuccess(
      "Check your inbox to confirm your email and finish creating your account."
    );
    (event.currentTarget as HTMLFormElement).reset();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl shadow-black/40">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Create your HandyBob access</h1>
          <p className="text-sm text-slate-400">
            Set up an account to organize leads, jobs, and invoices with our AI copilots.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="hb-label" htmlFor="email">
              Email address
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

          <div className="space-y-1">
            {error && <p className="text-xs text-red-400">{error}</p>}
            {success && <p className="text-xs text-emerald-400">{success}</p>}
          </div>

          <button type="submit" disabled={loading} className="hb-button w-full">
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
