"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";

type JobCustomer = {
  id: string;
  name: string | null;
};

type CreateJobAction = (formData: FormData) => Promise<unknown>;

type JobFormShellProps = {
  createJobAction: CreateJobAction;
  customers: JobCustomer[];
  selectedCustomer?: JobCustomer | null;
  initialTitle?: string;
  initialDescription?: string;
  askBobOrigin?: string | null;
};

export default function JobFormShell({
  createJobAction,
  customers,
  selectedCustomer,
  initialTitle,
  initialDescription,
  askBobOrigin,
}: JobFormShellProps) {
  const normalizedInitialTitle = initialTitle?.trim() ?? "";
  const normalizedInitialDescription = initialDescription?.trim() ?? "";
  const hasAskBobPrefill = Boolean(normalizedInitialTitle || normalizedInitialDescription);

  const [title, setTitle] = useState(normalizedInitialTitle);
  const [description, setDescription] = useState(normalizedInitialDescription);
  const [status, setStatus] = useState("lead");

  const lastAppliedTitleRef = useRef(normalizedInitialTitle);
  const lastAppliedDescriptionRef = useRef(normalizedInitialDescription);

  useEffect(() => {
    const normalized = initialTitle?.trim() ?? "";
    if (normalized !== lastAppliedTitleRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(normalized);
      lastAppliedTitleRef.current = normalized;
    }
  }, [initialTitle]);

  useEffect(() => {
    const normalized = initialDescription?.trim() ?? "";
    if (normalized !== lastAppliedDescriptionRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDescription(normalized);
      lastAppliedDescriptionRef.current = normalized;
    }
  }, [initialDescription]);

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value);
  };

  const handleDescriptionChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(event.target.value);
  };

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setStatus(event.target.value);
  };

  return (
    <div className="space-y-5">
      <HbCard className="space-y-4">
        <form action={createJobAction} className="space-y-5">
          {askBobOrigin === "askbob" && hasAskBobPrefill && (
            <p className="text-xs text-slate-400">
              This job was prefilled from an AskBob suggestion. You can edit any field before saving.
            </p>
          )}
          {customers.length === 0 && (
            <div className="text-sm text-rose-400">
              No customers in this workspace. Create a customer first to assign a job.
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
              <label htmlFor="title">Job title</label>
              <span className="text-slate-400">Required</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Something you’ll recognize in your schedule or billing.
            </p>
            <input
              id="title"
              name="title"
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Fix irrigation leak"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="customerId" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Customer
            </label>
            <select
              id="customerId"
              name="customerId"
              required
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              defaultValue={selectedCustomer?.id ?? ""}
            >
              <option value="" disabled>
                Select a customer…
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name ?? "(No name)"}
                </option>
              ))}
            </select>
            {selectedCustomer && (
              <p className="text-[11px] text-slate-400">
                You’re creating a job for {selectedCustomer.name ?? "this customer"}.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Job description
            </label>
            <p className="text-[11px] text-slate-500">
              Optional notes about the scope, location, or special considerations.
            </p>
            <textarea
              id="description"
              name="description"
              value={description}
              onChange={handleDescriptionChange}
              placeholder="Example: needs a new valve, customer prefers mornings"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="status" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Status
            </label>
            <select
              id="status"
              name="status"
              value={status}
              onChange={handleStatusChange}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="lead">Lead</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In progress</option>
              <option value="complete">Complete</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
            <HbButton type="submit">Create job</HbButton>
            <Link
              href="/jobs"
              className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100"
            >
              Cancel
            </Link>
          </div>
        </form>
      </HbCard>
    </div>
  );
}
