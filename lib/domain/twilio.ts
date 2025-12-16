// No dialing/network calls here; helpers only.
export const TWILIO_STATUS_CALLBACK_EVENTS = ["initiated", "ringing", "answered", "completed"] as const;

export type MachineDetectionConfig = {
  enabled?: boolean;
};

export type DialTwilioCallArgs = {
  toPhone: string;
  fromPhone: string;
  callbackUrl: string;
  metadata: {
    callId: string;
    workspaceId: string;
  };
  machineDetection?: MachineDetectionConfig;
};

export type TwilioDialSuccess = {
  success: true;
  twilioCallSid: string;
  initialStatus: string;
};

export type TwilioDialFailureCode = "twilio_not_configured" | "twilio_provider_error";

export type TwilioDialFailure = {
  success: false;
  code: TwilioDialFailureCode;
  message: string;
  twilioErrorCode?: string;
  twilioErrorMessage?: string;
};

export type TwilioDialResult = TwilioDialSuccess | TwilioDialFailure;
