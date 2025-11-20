"use client";

import { useMemo, useState, useTransition } from "react";

type ComposeBarProps = {
  action: (formData: FormData) => Promise<void>;
  customerId: string | null;
  jobId: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
};

export function ComposeBar({
  action,
  customerId,
  jobId,
  customerName,
  customerEmail,
  customerPhone,
}: ComposeBarProps) {
  const initialChannel = useMemo(() => (customerEmail ? "email" : "sms"), [customerEmail]);
  const [channel, setChannel] = useState<"email" | "sms">(initialChannel as "email" | "sms");
  const [toValue, setToValue] = useState(
    initialChannel === "email" ? customerEmail || "" : customerPhone || ""
  );
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleChannelChange = (value: "email" | "sms") => {
    setChannel(value);
    setToValue(value === "email" ? customerEmail || "" : customerPhone || "");
  };

  const handleSubmit = (formData: FormData) => {
    startTransition(() => action(formData));
  };

  return (
    <form action={handleSubmit} className="space-y-2">
      <input type="hidden" name="customer_id" value={customerId ?? ""} />
      <input type="hidden" name="job_id" value={jobId ?? ""} />
      <div className="grid gap-2 md:grid-cols-[140px,1fr]">
        <label className="text-xs text-slate-400">
          Channel
          <select
            name="channel"
            value={channel}
            onChange={(e) => handleChannelChange(e.target.value as "email" | "sms")}
            className="hb-input mt-1"
            disabled={isPending}
          >
            {customerEmail && <option value="email">Email</option>}
            {customerPhone && <option value="sms">SMS</option>}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          To
          <input
            name="to"
            value={toValue}
            onChange={(e) => setToValue(e.target.value)}
            className="hb-input mt-1"
            placeholder={channel === "email" ? "customer@email.com" : "+15551234567"}
            required
            disabled={isPending}
          />
        </label>
      </div>

      {channel === "email" && (
        <label className="text-xs text-slate-400 block">
          Subject
          <input
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="hb-input mt-1"
            placeholder={`Message to ${customerName}`}
            disabled={isPending}
          />
        </label>
      )}

      <label className="text-xs text-slate-400 block">
        Message
        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="hb-input mt-1"
          rows={4}
          placeholder="Type your message..."
          required
          disabled={isPending}
        />
      </label>

      <div className="flex items-center justify-between gap-2">
        <p className="hb-muted text-xs">
          Sending as outbound {channel}.
        </p>
        <button
          type="submit"
          className="hb-button"
          disabled={isPending}
        >
          {isPending ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
