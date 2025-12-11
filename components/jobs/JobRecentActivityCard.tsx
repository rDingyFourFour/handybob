"use server";

import JobRecentActivityCardClient from "@/components/jobs/JobRecentActivityCardClient";
import { buildJobTimelinePayload } from "@/lib/domain/jobs";
import type { TimelineEvent } from "@/types/ai";

type Props = {
  jobId: string;
  workspaceId: string;
};

const MAX_EVENTS = 8;

export default async function JobRecentActivityCard({ jobId, workspaceId }: Props) {
  let events: TimelineEvent[] = [];
  let loadError = false;
  try {
    const payload = await buildJobTimelinePayload(jobId, workspaceId);
    events = payload.events.slice(0, MAX_EVENTS);
  } catch (error) {
    console.error("[job-recent-activity] Failed to load timeline", error);
    loadError = true;
  }

  return <JobRecentActivityCardClient events={events} loadError={loadError} />;
}
