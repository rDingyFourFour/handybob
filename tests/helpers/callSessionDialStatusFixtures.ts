import type { GetCallSessionDialStatusResult } from "@/app/(app)/calls/actions/getCallSessionDialStatus";

const BASE_STATUS: GetCallSessionDialStatusResult = {
  callId: "call-123",
  twilioCallSid: "sid-123",
  twilioStatus: "queued",
  twilioStatusUpdatedAt: "2024-01-01T00:00:00Z",
  isTerminal: false,
  hasRecording: false,
  recordingDurationSeconds: null,
  automatedCallNotes: null,
};

export function buildDialStatusSnapshot(
  overrides: Partial<GetCallSessionDialStatusResult> = {},
): GetCallSessionDialStatusResult {
  return {
    ...BASE_STATUS,
    ...overrides,
  };
}

export function buildNonTerminalDialStatus(
  overrides: Partial<GetCallSessionDialStatusResult> = {},
): GetCallSessionDialStatusResult {
  return buildDialStatusSnapshot({
    twilioStatus: "ringing",
    isTerminal: false,
    hasRecording: false,
    recordingDurationSeconds: null,
    ...overrides,
  });
}

export function buildTerminalCompletedDialStatus(
  overrides: Partial<GetCallSessionDialStatusResult> = {},
): GetCallSessionDialStatusResult {
  return buildDialStatusSnapshot({
    twilioStatus: "completed",
    isTerminal: true,
    ...overrides,
  });
}

export function buildTerminalFailedDialStatus(
  overrides: Partial<GetCallSessionDialStatusResult> = {},
): GetCallSessionDialStatusResult {
  return buildDialStatusSnapshot({
    twilioStatus: "failed",
    isTerminal: true,
    ...overrides,
  });
}

export function buildRecordingPendingDialStatus(
  overrides: Partial<GetCallSessionDialStatusResult> = {},
): GetCallSessionDialStatusResult {
  return buildTerminalCompletedDialStatus({
    hasRecording: false,
    recordingDurationSeconds: null,
    ...overrides,
  });
}

export function buildRecordingReadyDialStatus(
  overrides: Partial<GetCallSessionDialStatusResult> = {},
): GetCallSessionDialStatusResult {
  return buildTerminalCompletedDialStatus({
    hasRecording: true,
    recordingDurationSeconds: 45,
    ...overrides,
  });
}

export function buildMissingOutcomeDialStatus(
  overrides: Partial<GetCallSessionDialStatusResult> = {},
): GetCallSessionDialStatusResult {
  return buildRecordingReadyDialStatus({
    automatedCallNotes: null,
    ...overrides,
  });
}

export function buildReadyForAfterCallDialStatus(
  overrides: Partial<GetCallSessionDialStatusResult> = {},
): GetCallSessionDialStatusResult {
  return buildRecordingReadyDialStatus({
    automatedCallNotes: "Notes saved",
    ...overrides,
  });
}
