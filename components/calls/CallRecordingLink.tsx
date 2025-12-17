"use client";

import { useCallback } from "react";

type Props = {
  callId: string;
  workspaceId: string;
  recordingUrl: string;
};

export default function CallRecordingLink({ callId, workspaceId, recordingUrl }: Props) {
  const handleClick = useCallback(() => {
    console.log("[calls-session-recording-open-click]", {
      callId,
      workspaceId,
    });
  }, [callId, workspaceId]);

  return (
    <a
      href={recordingUrl}
      target="_blank"
      rel="noreferrer noopener"
      onClick={handleClick}
      className="inline-flex items-center justify-center rounded-full border border-slate-700/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-100 transition hover:border-slate-600 hover:text-white"
    >
      Open recording
    </a>
  );
}
