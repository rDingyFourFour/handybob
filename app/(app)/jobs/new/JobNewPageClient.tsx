"use client";

import { useState } from "react";

import JobFormShell from "./JobFormShell";
import JobNewAskBobHelper from "@/components/askbob/JobNewAskBobHelper";

type JobCustomer = {
  id: string;
  name: string | null;
};

type JobNewPageClientProps = {
  customers: JobCustomer[];
  workspaceId: string;
  createJobAction: (formData: FormData) => Promise<unknown>;
  selectedCustomer?: JobCustomer | null;
  askBobOrigin?: string | null;
  initialTitle?: string;
  initialDescription?: string;
};

export default function JobNewPageClient({
  customers,
  workspaceId,
  createJobAction,
  selectedCustomer,
  askBobOrigin,
  initialTitle,
  initialDescription,
}: JobNewPageClientProps) {
  const [titleSuggestion, setTitleSuggestion] = useState(initialTitle?.trim() ?? "");
  const [descriptionSuggestion, setDescriptionSuggestion] = useState(initialDescription?.trim() ?? "");

  const handleApplySuggestion = (payload: { title: string; description: string }) => {
    setTitleSuggestion(payload.title.trim());
    setDescriptionSuggestion(payload.description.trim());
  };

  return (
    <div className="space-y-6">
      <JobNewAskBobHelper workspaceId={workspaceId} onApplySuggestion={handleApplySuggestion} />
      <JobFormShell
        customers={customers}
        createJobAction={createJobAction}
        selectedCustomer={selectedCustomer}
        initialTitle={titleSuggestion}
        initialDescription={descriptionSuggestion}
        askBobOrigin={askBobOrigin}
      />
    </div>
  );
}
