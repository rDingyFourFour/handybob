export type FollowupMessageRef = {
  id: string;
  job_id: string | null;
  quote_id: string | null;
  channel: string | null;
  via: string | null;
  created_at: string | null;
};

type FindMatchingFollowupMessageArgs = {
  messages: FollowupMessageRef[];
  jobId: string | null;
  quoteId: string | null;
  recommendedChannel: string | null | undefined;
};

export function findMatchingFollowupMessage({
  messages,
  recommendedChannel,
  jobId,
  quoteId,
}: FindMatchingFollowupMessageArgs): FollowupMessageRef | null {
  if (!jobId || !recommendedChannel) {
    return null;
  }
  const normalizedRecommendationChannel = recommendedChannel.toLowerCase();

  return (
    messages.find((message) => {
      if (!message.channel) {
        return false;
      }
      if (message.job_id !== jobId) {
        return false;
      }
      if (quoteId && message.quote_id !== quoteId) {
        return false;
      }
      if (!message.via) {
        return false;
      }
      return message.channel.toLowerCase() === normalizedRecommendationChannel;
    }) ?? null
  );
}
