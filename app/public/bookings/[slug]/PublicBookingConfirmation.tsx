type PublicBookingConfirmationProps = {
  jobId: string;
  customerId: string;
  ownerHandoff: {
    eligible: boolean;
    redirectPath?: string;
  };
  onOwnerHandoff?: () => void;
  onReset?: () => void;
};

export function PublicBookingConfirmation({
  jobId,
  customerId,
  ownerHandoff,
  onOwnerHandoff,
  onReset,
}: PublicBookingConfirmationProps) {
  const handleReset = onReset ?? (() => {});
  const showOwnerHandoff = ownerHandoff.eligible && Boolean(ownerHandoff.redirectPath);

  return (
    <div
      className="space-y-6"
      data-testid="public-booking-confirmation"
      data-job-id={jobId}
      data-customer-id={customerId}
    >
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold text-slate-50">Request received</h2>
        <p className="hb-muted">We&apos;ll review your request and reach out shortly.</p>
        <p className="hb-muted">Look out for a call, text, or email if you shared contact details.</p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h3 className="text-sm font-semibold text-slate-100">What happens next</h3>
        <p className="mt-2 text-sm text-slate-300">
          We&apos;ll confirm the details, timing, and next steps after reviewing your request.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="text-xs uppercase tracking-wide text-slate-400">Job reference</div>
        <div className="mt-1 text-sm font-semibold text-slate-100">{jobId}</div>
      </div>

      <div className="flex flex-wrap items-center gap-3" data-testid="public-booking-confirmation-actions">
        {showOwnerHandoff && onOwnerHandoff && (
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
