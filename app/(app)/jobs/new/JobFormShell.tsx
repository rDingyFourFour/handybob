"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";

import { requestSmartJobIntake } from "./jobIntakeAiActions";

type JobCustomer = {
  id: string;
  name: string | null;
};

type CreateJobAction = (formData: FormData) => Promise<unknown>;

type JobFormShellProps = {
  createJobAction: CreateJobAction;
  customers: JobCustomer[];
  workspaceId: string;
  selectedCustomer?: JobCustomer | null;
};

type AiStatus = "idle" | "loading" | "disabled" | "error" | "applied";

const aiBaseHints: Record<AiStatus, string> = {
  idle: "Optional: describe the job and we’ll suggest a title, notes, and status.",
  loading: "Generating job details…",
  disabled: "Smart Job Intake is currently disabled.",
  error: "We couldn’t suggest job details. Please try again or fill them in manually.",
  applied: "Smart Job Intake applied. Review and edit the fields below.",
};

export default function JobFormShell({
  createJobAction,
  customers,
  workspaceId,
  selectedCustomer,
}: JobFormShellProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("lead");
  const [userTouchedTitle, setUserTouchedTitle] = useState(false);
  const [userTouchedDescription, setUserTouchedDescription] = useState(false);
  const [userTouchedStatus, setUserTouchedStatus] = useState(false);

  const [hasAiTouchedTitle, setHasAiTouchedTitle] = useState(false);
  const [hasAiTouchedDescription, setHasAiTouchedDescription] = useState(false);
  const [hasAiTouchedStatus, setHasAiTouchedStatus] = useState(false);

  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [aiDescriptionInput, setAiDescriptionInput] = useState("");

  const aiHint =
    aiStatus === "error"
      ? aiErrorMessage?.trim() ?? aiBaseHints[aiStatus]
      : aiBaseHints[aiStatus];
  const hasAiAppliedAnyField =
    hasAiTouchedTitle || hasAiTouchedDescription || hasAiTouchedStatus;
  const isGenerateDisabled = !aiDescriptionInput.trim() || aiStatus === "loading";

  const handleSmartJobDetails = async () => {
    const trimmedDescription = aiDescriptionInput.trim();
    if (!trimmedDescription) {
      setAiStatus("error");
      setAiErrorMessage("Please describe the job first.");
      return;
    }

    setAiStatus("loading");
    setAiErrorMessage(null);

    try {
      const response = await requestSmartJobIntake({
        description: trimmedDescription,
        workspaceId,
      });

      if (!response.ok) {
        if (response.error === "ai_disabled") {
          setAiStatus("disabled");
          setAiErrorMessage(response.message);
          return;
        }
        setAiStatus("error");
        setAiErrorMessage(
          response.message ??
            "We couldn’t generate job details. Please try again or fill them in manually.",
        );
        return;
      }

      const data = response.data;
      if (!data) {
        setAiStatus("error");
        setAiErrorMessage("We couldn’t parse job details from the AI response.");
        return;
      }

      let appliedFields = 0;

      if (data.title && !userTouchedTitle) {
        setTitle(data.title);
        setHasAiTouchedTitle(true);
        appliedFields += 1;
      }

      if (data.notes && !userTouchedDescription) {
        setDescription(data.notes);
        setHasAiTouchedDescription(true);
        appliedFields += 1;
      }

      if (data.statusSuggestion && !userTouchedStatus) {
        setStatus(data.statusSuggestion);
        setHasAiTouchedStatus(true);
        appliedFields += 1;
      }

      if (appliedFields > 0) {
        setAiStatus("applied");
        setAiErrorMessage(null);
      } else {
        setAiStatus("idle");
        setAiErrorMessage("No fields were updated because you already customized them.");
      }
    } catch (error) {
      setAiStatus("error");
      setAiErrorMessage("We couldn’t suggest job details. Please try again or fill them in manually.");
      console.error("[jobs/new] smart intake failed", error);
    }
  };

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!userTouchedTitle) {
      setUserTouchedTitle(true);
    }
    setTitle(event.target.value);
  };

  const handleDescriptionChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (!userTouchedDescription) {
      setUserTouchedDescription(true);
    }
    setDescription(event.target.value);
  };

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (!userTouchedStatus) {
      setUserTouchedStatus(true);
    }
    setStatus(event.target.value);
  };

  return (
    <div className="space-y-5">
      <HbCard className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Smart Job Intake (optional)</p>
          <p className="text-sm font-semibold">Need a hand filling out the job?</p>
          <p className="text-[11px] text-slate-400">
            Paste or type what the customer told you and we’ll suggest a title and notes for the job.
          </p>
        </div>
        <textarea
          value={aiDescriptionInput}
          onChange={(event) => setAiDescriptionInput(event.target.value)}
          placeholder="Customer wants a new deck built, needs materials sourced, and prefers late afternoon visits."
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows={4}
        />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="w-full flex-grow text-[11px] md:text-left md:pr-3">
            <p className={`whitespace-pre-line ${aiStatus === "error" ? "text-rose-300" : "text-slate-400"}`}>
              {aiHint}
            </p>
            {aiStatus === "applied" && hasAiAppliedAnyField && (
              <p className="text-[11px] text-emerald-300">
                Smart Job Intake suggested values for the fields above.
              </p>
            )}
            {!aiDescriptionInput.trim() && (
              <p className="text-[11px] text-rose-300">Please describe the job first.</p>
            )}
          </div>
          <HbButton
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleSmartJobDetails}
            disabled={isGenerateDisabled}
          >
            {aiStatus === "loading" ? "Generating…" : "Generate job details"}
          </HbButton>
        </div>
      </HbCard>

      <HbCard className="space-y-4">
        <form action={createJobAction} className="space-y-5">
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
