"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ComposeBarProps = {
  action: (formData: FormData) => Promise<{ ok?: boolean; error?: string | null; customerId?: string | null }>;
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
  const router = useRouter();
  const initialChannel = useMemo(() => (customerEmail ? "email" : "sms"), [customerEmail]);
  const [channel, setChannel] = useState<"email" | "sms">(initialChannel as "email" | "sms");
  const [toValue, setToValue] = useState(
    initialChannel === "email" ? customerEmail || "" : customerPhone || ""
  );
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | null>(null);

  const handleChannelChange = (value: "email" | "sms") => {
    setChannel(value);
    setToValue(value === "email" ? customerEmail || "" : customerPhone || "");
    setStatusMessage(null);
    setStatusType(null);
  };

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      setStatusMessage(null);
      setStatusType(null);
      const result = await action(formData);
      if (result?.ok) {
        setStatusMessage("Message sent.");
        setStatusType("success");
        router.refresh();
      } else {
        setStatusMessage(result?.error ?? "Couldn’t send the message — please check the recipient.");
        setStatusType("error");
      }
    });
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
      {statusMessage && (
        <p className={`text-[12px] ${statusType === "success" ? "text-emerald-400" : "text-amber-300"}`}>
          {statusMessage}
        </p>
      )}
    </form>
  );
}
