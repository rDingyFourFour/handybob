"use client";

import { useEffect } from "react";

type AskBobPageEntryLoggerProps = {
  workspaceId: string;
  origin?: string;
};

export default function AskBobPageEntryLogger({
  workspaceId,
  origin = "askbob-page",
}: AskBobPageEntryLoggerProps) {
  useEffect(() => {
    console.log("[askbob-ui-entry]", { workspaceId, origin });
  }, [workspaceId, origin]);

  return null;
}
