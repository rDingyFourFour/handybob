"use client";

import { FormEvent, useState } from "react";

type Props = {
  workspaceSlug: string;
  workspaceName: string;
  businessEmail: string | null;
  businessPhone: string | null;
};

type FormStatus = "idle" | "submitting" | "success" | "error";

export function PublicLeadForm({ workspaceSlug, workspaceName, businessEmail, businessPhone }: Props) {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          workspaceSlug,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Unable to send request right now.");
      }

      setStatus("success");
      setMessage("Request received. We’ll reach out with next steps.");
      event.currentTarget.reset();
    } catch (error) {
      const fallback = error instanceof Error ? error.message : "We could not submit your request.";
      setStatus("error");
      setMessage(fallback);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-slate-50">Tell {workspaceName} what you need</h2>
        <p className="hb-muted text-sm">
          Share a quick summary of the work. We screen submissions for spam and prioritize emergencies.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="hb-label" htmlFor="name">Your name *</label>
          <input id="name" name="name" required className="hb-input bg-slate-950/40 border-slate-800" placeholder="Jane Doe" />
        </div>
        <div>
          <label className="hb-label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" className="hb-input bg-slate-950/40 border-slate-800" placeholder="+1 (555) 123-4567" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="hb-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="hb-input bg-slate-950/40 border-slate-800" placeholder="you@example.com" />
        </div>
        <div>
          <label className="hb-label" htmlFor="address">Service address</label>
          <input id="address" name="address" className="hb-input bg-slate-950/40 border-slate-800" placeholder="Street, city" />
        </div>
      </div>

      <div>
        <label className="hb-label" htmlFor="description">What do you need help with? *</label>
        <textarea
          id="description"
          name="description"
          required
          className="hb-textarea bg-slate-950/40 border-slate-800"
          placeholder="Describe the issue, location (kitchen/bath/etc), and timing."
          rows={5}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="hb-label" htmlFor="preferred_time">Preferred time</label>
          <select id="preferred_time" name="preferred_time" className="hb-input bg-slate-950/40 border-slate-800" defaultValue="flexible">
            <option value="today">Today / ASAP</option>
            <option value="this_week">This week</option>
            <option value="next_week">Next week</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
        <div>
          <label className="hb-label">Urgency</label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "today", label: "Emergency" },
              { value: "this_week", label: "This week" },
              { value: "flexible", label: "Flexible" },
            ].map((option) => (
              <label key={option.value} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm">
                <input type="radio" name="urgency" value={option.value} defaultChecked={option.value === "this_week"} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden">
        <label htmlFor="website">Do not fill this field</label>
        <input id="website" name="website" autoComplete="off" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-400">
          We’ll contact you at the details provided{businessPhone || businessEmail ? ", or reach out directly:" : "."}
          {businessPhone && <span className="ml-1 font-semibold text-slate-200">{businessPhone}</span>}
          {businessEmail && <span className="ml-1 font-semibold text-slate-200">{businessEmail}</span>}
        </div>
        <button
          className="hb-button min-w-[180px]"
          disabled={status === "submitting"}
          type="submit"
        >
          {status === "submitting" ? "Sending..." : "Send request"}
        </button>
      </div>

      {message && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${
          status === "success" ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-100" : "border-rose-500/50 bg-rose-950/40 text-rose-100"
        }`}>
          {message}
        </div>
      )}
    </form>
  );
}
