"use client";

import { FormEvent, useState, useTransition } from "react";

import HbButton from "@/components/ui/hb-button";
import { createCustomerAction } from "./actions";

export default function NewCustomerForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      try {
        await createCustomerAction(formData);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Unable to create a customer right now.");
        }
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1 text-sm">
        <label htmlFor="customer-name" className="font-semibold text-slate-200">
          Full name
        </label>
        <input
          id="customer-name"
          name="name"
          type="text"
          required
          minLength={2}
          placeholder="Jane Doe"
          className="w-full rounded-full border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        />
        <p className="text-xs text-slate-500">Name is required so we can link jobs and calls.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 text-sm">
          <label htmlFor="customer-email" className="font-semibold text-slate-200">
            Email
          </label>
          <input
            id="customer-email"
            name="email"
            type="email"
            placeholder="jane@example.com"
            className="w-full rounded-full border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          />
          <p className="text-xs text-slate-500">Optional, but helpful for sending quotes and messages.</p>
        </div>
        <div className="space-y-1 text-sm">
          <label htmlFor="customer-phone" className="font-semibold text-slate-200">
            Phone
          </label>
          <input
            id="customer-phone"
            name="phone"
            type="tel"
            placeholder="+1 (555) 123-4567"
            pattern="\\+?[0-9 ()-]{7,}"
            className="w-full rounded-full border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          />
          <p className="text-xs text-slate-500">Optional, but we’ll use it for calls and texts.</p>
        </div>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <HbButton type="submit" disabled={isPending} className="px-4 py-2 text-sm">
          {isPending ? "Creating…" : "Create customer"}
        </HbButton>
        <p className="text-xs text-slate-500">You’ll be redirected to their profile after saving.</p>
      </div>
    </form>
  );
}
