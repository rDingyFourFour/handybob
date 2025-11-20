"use client";

import { useActionState, useMemo, useState } from "react";

type FollowupDraftState = {
  subject?: string | null;
  body?: string | null;
  sms_body?: string | null;
  error?: string;
};

type SendFollowupState = {
  ok?: boolean;
  error?: string;
};

type GenerateAction = (
  prevState: FollowupDraftState | null,
  formData: FormData
) => Promise<FollowupDraftState>;

type SendAction = (
  prevState: SendFollowupState | null,
  formData: FormData
) => Promise<SendFollowupState>;

type Props = {
  jobId: string;
  customerId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  generateAction: GenerateAction;
  sendAction: SendAction;
};

const GOAL_OPTIONS = [
  { value: "follow_up_after_sending_quote", label: "Follow up after sending a quote" },
  { value: "follow_up_on_unanswered_message", label: "Follow up on unanswered message" },
  { value: "confirm_upcoming_appointment", label: "Confirm upcoming appointment" },
  { value: "follow_up_after_completion", label: "Follow up after work is complete" },
];

export function JobFollowupHelper({
  jobId,
  customerId,
  customerEmail,
  customerPhone,
  generateAction,
  sendAction,
}: Props) {
  const [goal, setGoal] = useState(GOAL_OPTIONS[0]?.value ?? "follow_up_after_sending_quote");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [tone, setTone] = useState("");
  const [to, setTo] = useState(customerEmail || "");

  const [draftState, draftFormAction, drafting] = useActionState<FollowupDraftState, FormData>(
    generateAction,
    null,
  );
  const [sendState, sendFormAction, sending] = useActionState<SendFollowupState, FormData>(
    sendAction,
    null,
  );

  const placeholder = useMemo(() => {
    if (channel === "sms") return "Short SMS body...";
    return "Email body...";
  }, [channel]);

  const draftKey = useMemo(
    () => `${channel}-${draftState?.subject ?? ""}-${draftState?.body ?? ""}-${draftState?.sms_body ?? ""}`,
    [channel, draftState],
  );

  const handleChannelChange = (value: "email" | "sms") => {
    setChannel(value);
    if (value === "email" && customerEmail) {
      setTo(customerEmail);
    }
    if (value === "sms" && customerPhone) {
      setTo(customerPhone);
    }
  };

  return (
    <div className="hb-card space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="hb-label text-xs uppercase tracking-wide text-slate-400">
            AI follow-up helper (review before sending)
          </p>
          <h2 className="text-lg font-semibold">Draft a follow-up</h2>
          <p className="hb-muted text-sm">
            Generate a draft, edit it, then send manually. Messages are never auto-sent.
          </p>
        </div>
      </div>

      <form action={draftFormAction} className="space-y-3">
        <input type="hidden" name="job_id" value={jobId} />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="hb-muted">Goal</span>
            <select
              name="goal"
              className="hb-input"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            >
              {GOAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="hb-muted">Channel</span>
            <select
              name="channel"
              className="hb-input"
              value={channel}
              onChange={(e) => handleChannelChange(e.target.value as "email" | "sms")}
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="hb-muted">Tone (optional)</span>
            <input
              name="tone"
              className="hb-input"
              placeholder="friendly, concise, formal"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            />
          </label>
        </div>
        <button className="hb-button" disabled={drafting}>
          {drafting ? "Generating..." : "Generate draft"}
        </button>
        {draftState?.error && (
          <p className="text-sm text-red-400">Could not generate draft. {draftState.error}</p>
        )}
      </form>

      <form action={sendFormAction} className="space-y-3">
        <input type="hidden" name="job_id" value={jobId} />
        <input type="hidden" name="customer_id" value={customerId || ""} />
        <input type="hidden" name="channel" value={channel} />
        <label className="space-y-1 text-sm">
          <span className="hb-muted">To</span>
          <input
            name="to"
            className="hb-input"
            placeholder={channel === "sms" ? "Customer phone" : "Customer email"}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {channel === "email" && (
          <label className="space-y-1 text-sm">
            <span className="hb-muted">Subject</span>
            <input
              name="subject"
              className="hb-input"
              key={`subject-${draftKey}`}
              defaultValue={draftState?.subject || ""}
            />
          </label>
        )}
        <label className="space-y-1 text-sm">
          <span className="hb-muted">{channel === "sms" ? "SMS body" : "Email body"}</span>
          <textarea
            name="body"
            className="hb-input min-h-[140px]"
            placeholder={placeholder}
            key={`body-${draftKey}`}
            defaultValue={
              channel === "sms"
                ? draftState?.sms_body || draftState?.body || ""
                : draftState?.body || draftState?.sms_body || ""
            }
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button className="hb-button" disabled={sending || !to}>
            {sending ? "Sending..." : "Send"}
          </button>
          <p className="hb-muted text-xs">
            These are AI suggestions. Review and edit before sending—nothing is auto-sent.
          </p>
        </div>
        {sendState?.error && (
          <p className="text-sm text-red-400">Could not send. {sendState.error}</p>
        )}
        {sendState?.ok && !sendState.error && (
          <p className="text-sm text-green-400">Message sent.</p>
        )}
      </form>
    </div>
  );
}
