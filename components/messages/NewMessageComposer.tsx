"use client";

import { useEffect, useState } from "react";

import HbButton from "@/components/ui/hb-button";

import NewMessageDialog, { CustomerOption, JobOption } from "./NewMessageDialog";

type NewMessageComposerProps = {
  workspaceId: string;
  customers: CustomerOption[];
  jobs: JobOption[];
  initialCustomerId?: string | null;
};

export default function NewMessageComposer({
  workspaceId,
  customers,
  jobs,
  initialCustomerId,
}: NewMessageComposerProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      console.log("[messages-compose-open]", { workspaceId });
    }
  }, [isOpen, workspaceId]);

  return (
    <>
      <HbButton type="button" size="sm" onClick={() => setIsOpen(true)}>
        New message
      </HbButton>
      {isOpen && (
        <NewMessageDialog
          open={isOpen}
          onOpenChange={setIsOpen}
          workspaceId={workspaceId}
          customers={customers}
          jobs={jobs}
          initialCustomerId={initialCustomerId}
        />
      )}
    </>
  );
}
