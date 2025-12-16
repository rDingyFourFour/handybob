"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import {
  linkInboundCallToContextAction,
  type LinkInboundCallToContextResponse,
} from "../actions/linkInboundCallToContext";

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

export async function linkCallContextFormAction(
  _prevState: LinkInboundCallToContextResponse | null,
  formData?: FormData | null,
): Promise<LinkInboundCallToContextResponse> {
  return linkInboundCallToContextAction(formData ?? null);
}

type LinkCallContextCardProps = {
  workspaceId: string;
  callId: string;
  direction: string;
  fromNumber: string | null;
  toNumber: string | null;
  customerId: string | null;
  jobId: string | null;
  customerOptions: CustomerOption[];
  jobOptions: JobOption[];
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_form_data: "Please pick a customer and try again.",
  not_inbound: "This call is not inbound.",
  not_found: "Call not found.",
  cross_workspace: "Call belongs to a different workspace.",
  job_customer_mismatch: "Pick a job that belongs to the selected customer.",
  customer_not_found: "We couldn’t find that customer yet.",
  customer_mismatch: "The selected customer does not match this call.",
};

export default function LinkCallContextCard({
  workspaceId,
  callId,
  direction,
  customerId,
  jobId,
  customerOptions,
  jobOptions,
}: LinkCallContextCardProps) {
  const normalizedDirection = (direction ?? "outbound").toLowerCase();

  const router = useRouter();
  const [collapsed, setCollapsed] = useState(Boolean(customerId));
  const [isEditing, setIsEditing] = useState(!customerId);
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(customerId);
  const [linkedJobId, setLinkedJobId] = useState<string | null>(jobId);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId ?? "");
  const [selectedJobId, setSelectedJobId] = useState(jobId ?? "");

  const [actionState, formAction, pending] = useActionState<
    LinkInboundCallToContextResponse,
    FormData | null | undefined
  >(linkCallContextFormAction, null);

  const lastActionStateRef = useRef<LinkInboundCallToContextResponse | null>(null);
  useEffect(() => {
    if (!actionState || actionState === lastActionStateRef.current) {
      return;
    }
    lastActionStateRef.current = actionState;
    if (actionState.success) {
      console.log("[calls-inbound-link-ui-success]", {
        callId,
        workspaceId,
        customerId: actionState.payload.customerId,
        jobId: actionState.payload.jobId,
      });
      startTransition(() => {
        setLinkedCustomerId(actionState.payload.customerId);
        setLinkedJobId(actionState.payload.jobId);
        setSelectedCustomerId(actionState.payload.customerId);
        setSelectedJobId(actionState.payload.jobId ?? "");
        setIsEditing(false);
        router.refresh();
      });
    } else {
      console.log("[calls-inbound-link-ui-failure]", {
        callId,
        workspaceId,
        code: actionState.code,
        message: actionState.message,
      });
    }
  }, [actionState, callId, workspaceId, router]);

  const availableJobs = useMemo(
    () =>
      jobOptions.filter(
        (job) => job.customer_id && job.customer_id === selectedCustomerId,
      ),
    [jobOptions, selectedCustomerId],
  );

  const selectedCustomer = customerOptions.find((customer) => customer.id === linkedCustomerId);
  const selectedJob = jobOptions.find((job) => job.id === linkedJobId);
  const customerLabel =
    selectedCustomer?.name?.trim() ??
    (linkedCustomerId ? `Customer ${linkedCustomerId.slice(0, 8)}…` : "Unlinked customer");
  const jobLabel =
    selectedJob?.title?.trim() ??
    (linkedJobId ? `Job ${linkedJobId.slice(0, 8)}…` : "Unlinked job");

  const actionErrorMessage =
    actionState && !actionState.success
      ? ERROR_MESSAGES[actionState.code] ?? actionState.message ?? "Unable to link call."
      : null;

  const handleEditClick = () => {
    setCollapsed(false);
    setIsEditing(true);
  };

  const handleToggleCollapse = () => {
    setCollapsed((value) => !value);
  };

  const logUiRequest = () => {
    console.log("[calls-inbound-link-ui-request]", {
      callId,
      workspaceId,
      selectedCustomerId,
      selectedJobId: selectedJobId || null,
    });
  };

  if (normalizedDirection !== "inbound") {
    return null;
  }

  return (
    <HbCard className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Inbound link</p>
          <h3 className="hb-heading-3 text-xl font-semibold text-white">Link call context</h3>
          <p className="text-sm text-slate-400">
            Attach this call to a customer and optionally a job so AskBob can surface accurate context.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {linkedCustomerId && !isEditing && (
            <HbButton size="sm" variant="secondary" onClick={handleEditClick}>
              Edit
            </HbButton>
          )}
          <button
            type="button"
            onClick={handleToggleCollapse}
            className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400"
            aria-expanded={!collapsed}
          >
            {collapsed ? "Show details ▼" : "Hide details ▲"}
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="space-y-4">
          {isEditing ? (
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="callId" value={callId} />
              <div className="space-y-2">
                <label htmlFor="link-customer" className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Customer
                </label>
                <select
                  id="link-customer"
                  name="customerId"
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                  value={selectedCustomerId}
                  onChange={(event) => {
                    setSelectedCustomerId(event.target.value);
                    setSelectedJobId("");
                  }}
                  disabled={pending}
                >
                  <option value="">Select a customer</option>
                  {customerOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name?.trim() || `Customer ${option.id.slice(0, 8)}…`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="link-job" className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Job (optional)
                </label>
                <select
                  id="link-job"
                  name="jobId"
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                  value={selectedJobId}
                  onChange={(event) => setSelectedJobId(event.target.value)}
                  disabled={pending || !selectedCustomerId}
                >
                  <option value="">No job selected</option>
                  {availableJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title?.trim() || `Job ${job.id.slice(0, 8)}…`}
                    </option>
                  ))}
                </select>
                {!selectedCustomerId && (
                  <p className="text-xs text-slate-500">Select a customer to browse jobs.</p>
                )}
              </div>
              {actionErrorMessage && <p className="text-sm text-rose-400">{actionErrorMessage}</p>}
              <div className="flex justify-end">
                <HbButton
                  size="sm"
                  variant="primary"
                  type="submit"
                  disabled={pending || !selectedCustomerId}
                  onClick={logUiRequest}
                >
                  {pending ? "Linking…" : "Link call"}
                </HbButton>
              </div>
            </form>
          ) : (
            <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Linked context</p>
                <p className="text-sm text-slate-100">Customer: {customerLabel}</p>
                <p className="text-sm text-slate-100">Job: {jobLabel}</p>
              </div>
              <p className="text-xs text-slate-400">
                Call data will now use this customer and job for AskBob guidance and follow-ups.
              </p>
            </div>
          )}
        </div>
      )}
    </HbCard>
  );
}
