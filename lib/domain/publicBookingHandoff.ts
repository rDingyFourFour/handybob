export const PUBLIC_BOOKING_HANDOFF_SESSION_KEY = "public-booking-owner-handoff";

export type PublicBookingHandoffSignal = {
  jobId: string;
  createdAt: number;
  source: "public_booking_owner_handoff";
  desiredStep: number;
};

export function parsePublicBookingHandoffSignal(
  raw: string | null,
): PublicBookingHandoffSignal | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PublicBookingHandoffSignal> | null;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (typeof parsed.jobId !== "string" || !parsed.jobId.trim()) {
      return null;
    }
    if (typeof parsed.createdAt !== "number" || !Number.isFinite(parsed.createdAt)) {
      return null;
    }
    if (typeof parsed.desiredStep !== "number" || !Number.isFinite(parsed.desiredStep)) {
      return null;
    }
    if (parsed.source !== "public_booking_owner_handoff") {
      return null;
    }
    return {
      jobId: parsed.jobId,
      createdAt: parsed.createdAt,
      source: parsed.source,
      desiredStep: parsed.desiredStep,
    };
  } catch {
    return null;
  }
}
