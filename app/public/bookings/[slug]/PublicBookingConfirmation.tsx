type PublicBookingConfirmationProps = {
  isOwnerHandoffEligible: boolean;
  onOwnerHandoff?: () => void;
  onReset?: () => void;
};

export const PUBLIC_BOOKING_WHAT_TO_EXPECT_LINES = [
  "We'll confirm the details and timing.",
  "We'll follow up if anything is unclear.",
  "You'll get a scheduling update soon.",
];

export function PublicBookingConfirmation({
  isOwnerHandoffEligible,
  onOwnerHandoff,
  onReset,
}: PublicBookingConfirmationProps) {
  const handleReset = onReset ?? (() => {});

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold text-slate-50">Request received</h2>
        <p className="hb-muted">We&apos;ll review your request and reach out to confirm details.</p>
        <p className="hb-muted">If you included a phone number, you may receive a call or text.</p>
        <p className="hb-muted">If you included an email, look for a confirmation message.</p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h3 className="text-sm font-semibold text-slate-100">What to expect next</h3>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {PUBLIC_BOOKING_WHAT_TO_EXPECT_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {isOwnerHandoffEligible && onOwnerHandoff && (
          <button type="button" className="hb-button min-w-[180px]" onClick={onOwnerHandoff}>
            Open in AskBob
          </button>
        )}
        <button
          type="button"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-100 hover:border-slate-500"
          onClick={handleReset}
        >
          Submit another request
        </button>
      </div>
    </div>
  );
}
