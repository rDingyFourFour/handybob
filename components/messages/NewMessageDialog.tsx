"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { sendCustomerSmsAction } from "@/app/actions/messages";

export type CustomerOption = {
  id: string;
  name: string | null;
  phone: string | null;
};

export type JobOption = {
  id: string;
  title: string | null;
  customer_id: string | null;
};

type NewMessageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  customers: CustomerOption[];
  jobs: JobOption[];
  initialCustomerId?: string | null;
};

const customerLabel = (customer: CustomerOption) => {
  const nameLabel = customer.name?.trim() || "(No name)";
  if (customer.phone?.trim()) {
    return `${nameLabel} · ${customer.phone}`;
  }
  return `${nameLabel} · (No phone)`;
};

export default function NewMessageDialog({
  open,
  onOpenChange,
  workspaceId,
  customers,
  jobs,
  initialCustomerId,
}: NewMessageDialogProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState(() => {
    if (
      initialCustomerId &&
      customers.some((customer) => customer.id === initialCustomerId && customer.phone?.trim())
    ) {
      return initialCustomerId;
    }
    return "";
  });
  const [selectedJobId, setSelectedJobId] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  const jobsForCustomer = useMemo(
    () =>
      selectedCustomerId
        ? jobs.filter((job) => job.customer_id === selectedCustomerId)
        : [],
    [jobs, selectedCustomerId],
  );

  const jobIsAvailable = jobsForCustomer.some((job) => job.id === selectedJobId);
  const jobSelectValue = jobIsAvailable ? selectedJobId : "";
  const jobIdForSubmission = jobIsAvailable ? selectedJobId : null;

  const isCustomerSelected = Boolean(selectedCustomerId);
  const trimmedBody = messageBody.trim();
  const canSubmit = isCustomerSelected && trimmedBody.length > 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isPending) {
      setErrorMessage("Please pick a customer and type a message.");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await sendCustomerSmsAction({
          workspaceId,
          customerId: selectedCustomerId,
          jobId: jobIdForSubmission,
          body: trimmedBody,
          origin: "dialog",
        });

        if (!result?.ok) {
          setErrorMessage(result?.error ?? "We couldn’t send this message. Please try again.");
          return;
        }

        onOpenChange(false);
        router.refresh();
      } catch (error) {
        console.error("[messages-compose-error] Client submit failed:", error);
        setErrorMessage("We couldn’t send this message. Please try again.");
      }
    });
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      const form = event.currentTarget.form;
      form?.requestSubmit();
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-message-title"
    >
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-xl" onClick={(event) => event.stopPropagation()}>
        <HbCard className="space-y-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Messages</p>
            <h2 id="new-message-title" className="hb-heading-1 text-2xl font-semibold">
              New message
            </h2>
            <p className="text-sm text-slate-400">Send a quick SMS to a customer.</p>
          </div>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                <label htmlFor="message-customer">Customer</label>
                <span className="text-slate-400 text-[11px]">Required</span>
              </div>
              <select
                id="message-customer"
                name="customerId"
                value={selectedCustomerId}
                onChange={(event) => setSelectedCustomerId(event.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                required
              >
                <option value="" disabled>
                  Select a customer…
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id} disabled={!customer.phone?.trim()}>
                    {customerLabel(customer)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                <label htmlFor="message-job">Related job (optional)</label>
                <span className="text-slate-400 text-[11px]">Optional</span>
              </div>
              <select
                id="message-job"
                name="jobId"
                value={jobSelectValue}
                onChange={(event) => setSelectedJobId(event.target.value)}
                disabled={!isCustomerSelected}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="">{isCustomerSelected ? "No job selected" : "Select a customer first"}</option>
                {jobsForCustomer.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title?.trim() || `Job ${job.id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Channel</div>
              <div className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-200">
                SMS
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                <label htmlFor="message-body">Message</label>
                <span className="text-slate-400 text-[11px]">Required</span>
              </div>
              <textarea
                id="message-body"
                name="body"
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                rows={4}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm placeholder:text-slate-500"
                placeholder="I’m checking in on your project—do you still need us to order the materials?"
                required
              />
              <p className="text-[11px] text-slate-400">
                We’ll send this as an SMS from your HandyBob number. {messageBody.length} characters
              </p>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-800 pt-4">
              {errorMessage && <p className="text-[11px] text-rose-300">{errorMessage}</p>}
              <div className="flex flex-wrap items-center gap-3 justify-end">
                <HbButton variant="ghost" size="sm" type="button" onClick={() => onOpenChange(false)}>
                  Cancel
                </HbButton>
                <HbButton type="submit" size="sm" disabled={!canSubmit || isPending}>
                  {isPending ? "Sending…" : "Send message"}
                </HbButton>
              </div>
            </div>
          </form>
        </HbCard>
      </div>
    </div>
  );
}
