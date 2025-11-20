"use client";

import { useActionState, useMemo, useState } from "react";

type CustomerCheckinDraftState = {
  subject?: string | null;
  body?: string | null;
  sms_body?: string | null;
  error?: string;
};

type SendState = {
  ok?: boolean;
  error?: string;
};

type GenerateAction = (
  prevState: CustomerCheckinDraftState | null,
  formData: FormData
) => Promise<CustomerCheckinDraftState>;

type SendAction = (
  prevState: SendState | null,
  formData: FormData
) => Promise<SendState>;

type Props = {
  customerId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  generateAction: GenerateAction;
  sendAction: SendAction;
};

export function CustomerCheckinHelper({
  customerId,
  customerEmail,
  customerPhone,
  generateAction,
  sendAction,
}: Props) {
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [toValue, setToValue] = useState(customerEmail || "");
  const [draftState, draftFormAction, drafting] = useActionState<CustomerCheckinDraftState, FormData>(
    generateAction,
    {} as CustomerCheckinDraftState,
  );
  const [sendState, sendFormAction, sending] = useActionState<SendState, FormData>(
    sendAction,
    {} as SendState,
  );

  const draftKey = useMemo(() => JSON.stringify(draftState ?? {}) + channel, [draftState, channel]);

  const handleChannelChange = (value: "email" | "sms") => {
    setChannel(value);
    if (value === "email" && customerEmail) {
      setToValue(customerEmail);
    }
    if (value === "sms" && customerPhone) {
      setToValue(customerPhone);
    }
  };

  return (
    <div className="hb-card space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="hb-label text-xs uppercase tracking-wide text-slate-400">
            Customer check-in (review before sending)
          </p>
          <h2 className="text-lg font-semibold">Draft intro / check-in</h2>
          <p className="hb-muted text-sm">
            Generate a friendly check-in message, edit it, then send manually. Nothing is auto-sent.
            </p>
        </div>
      </div>

      <form action={draftFormAction} className="space-y-3">
        <input type="hidden" name="customer_id" value={customerId} />
        <div className="grid gap-3 md:grid-cols-3">
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
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="hb-muted">Tone (optional)</span>
            <input
              name="tone"
              className="hb-input"
              placeholder="friendly, concise, formal"
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
        <input type="hidden" name="customer_id" value={customerId} />
        <input type="hidden" name="channel" value={channel} />
        <label className="space-y-1 text-sm">
          <span className="hb-muted">To</span>
          <input
            name="to"
            className="hb-input"
            placeholder={channel === "sms" ? "Customer phone" : "Customer email"}
            value={toValue}
            onChange={(e) => setToValue(e.target.value)}
          />
        </label>
        {channel === "email" && (
          <label className="space-y-1 text-sm" key={`subject-${draftKey}`}>
            <span className="hb-muted">Subject</span>
            <input
              name="subject"
              className="hb-input"
              defaultValue={draftState?.subject || ""}
            />
          </label>
        )}
        <label className="space-y-1 text-sm" key={`body-${draftKey}`}>
          <span className="hb-muted">{channel === "sms" ? "SMS body" : "Email body"}</span>
          <textarea
            name="body"
            className="hb-input min-h-[140px]"
            placeholder={channel === "sms" ? "Short SMS..." : "Email body..."}
            defaultValue={draftState?.sms_body || draftState?.body || ""}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button className="hb-button" disabled={sending || !toValue}>
            {sending ? "Sending..." : "Send"}
          </button>
          <p className="hb-muted text-xs">
            These are AI suggestions. Review and edit before sending—no automatic sending.
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
