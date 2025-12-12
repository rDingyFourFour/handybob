"use client";

import { useEffect, useState } from "react";

import HbButton from "@/components/ui/hb-button";
import GlobalComposer from "./GlobalComposer";
import type { CustomerOption, JobOption } from "./types";

type MessagesHeaderActionsProps = {
  workspaceId: string;
  customers: CustomerOption[];
  jobs: JobOption[];
  initialCustomerId?: string | null;
  initialJobId?: string | null;
  initialComposerOpen?: boolean;
  initialComposerOrigin?: string | null;
  initialComposerBody?: string | null;
  initialComposerBodyKey?: string | null;
};

export default function MessagesHeaderActions({
  workspaceId,
  customers,
  jobs,
  initialCustomerId,
  initialJobId,
  initialComposerOpen,
  initialComposerOrigin,
  initialComposerBody,
  initialComposerBodyKey,
}: MessagesHeaderActionsProps) {
  const [isGlobalComposerOpen, setIsGlobalComposerOpen] = useState(
    Boolean(initialComposerOpen),
  );
  const [composerKey, setComposerKey] = useState(0);

  useEffect(() => {
    if (isGlobalComposerOpen) {
      console.log("[messages-global-compose-open]", { workspaceId });
    }
  }, [isGlobalComposerOpen, workspaceId]);

  const handleClose = () => {
    setIsGlobalComposerOpen(false);
    setComposerKey((prev) => prev + 1);
  };

  return (
    <>
      <HbButton type="button" size="sm" onClick={() => setIsGlobalComposerOpen(true)}>
        New message
      </HbButton>
      <GlobalComposer
        key={composerKey}
        workspaceId={workspaceId}
        customers={customers}
        jobs={jobs}
        initialCustomerId={initialCustomerId}
        initialJobId={initialJobId}
        initialBody={initialComposerBody}
        initialOrigin={initialComposerOrigin}
        initialBodyKey={initialComposerBodyKey}
        open={isGlobalComposerOpen}
        onClose={handleClose}
      />
    </>
  );
}
