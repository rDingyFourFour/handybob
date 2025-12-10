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
    <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,320px)] lg:items-start lg:gap-6">
      <div>
        <JobFormShell
          customers={customers}
          createJobAction={createJobAction}
          selectedCustomer={selectedCustomer}
          initialTitle={titleSuggestion}
          initialDescription={descriptionSuggestion}
          askBobOrigin={askBobOrigin}
        />
      </div>
      <div className="lg:sticky lg:top-[5rem]">
        <JobNewAskBobHelper workspaceId={workspaceId} onApplySuggestion={handleApplySuggestion} />
      </div>
    </div>
  );
}
