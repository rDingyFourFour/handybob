type RawTwilioPayload = Record<string, string | null | undefined>;

export type TwilioRecordingPayload = {
  CallSid: string;
  RecordingUrl: string;
  RecordingDuration?: number | null;
  Timestamp?: string | null;
  From?: string | null;
  To?: string | null;
};

function normalizeString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function validateTwilioRecordingPayload(
  raw: RawTwilioPayload,
): { success: true; data: TwilioRecordingPayload } | { success: false; error: string } {
  const callSid = normalizeString(raw.CallSid);
  const recordingUrl = normalizeString(raw.RecordingUrl);

  if (!callSid || !recordingUrl) {
    return { success: false, error: "Recording callback missing CallSid or RecordingUrl." };
  }

  const timestamp = normalizeString(raw.Timestamp);
  const fromNumber = normalizeString(raw.From);
  const toNumber = normalizeString(raw.To);
  const durationRaw = normalizeString(raw.RecordingDuration);
  const duration = durationRaw ? Number(durationRaw) : null;

  return {
    success: true,
    data: {
      CallSid: callSid,
      RecordingUrl: recordingUrl,
      RecordingDuration: Number.isFinite(duration ?? NaN) ? duration : null,
      Timestamp: timestamp,
      From: fromNumber,
      To: toNumber,
    },
  };
}
