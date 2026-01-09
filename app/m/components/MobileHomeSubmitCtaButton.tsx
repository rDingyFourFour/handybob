"use client";

import * as React from "react";

import HbButton from "@/components/ui/hb-button";

type MobileHomeSubmitCtaButtonProps = {
  label: string;
  pendingLabel?: string;
  eventName: string;
  eventPayloadJson?: string;
  dataTestId?: string;
};

const PRIMARY_CTA_CLASS = "hb-mobile-primary-cta justify-center";

export default function MobileHomeSubmitCtaButton({
  label,
  pendingLabel = "Running…",
  eventName,
  eventPayloadJson,
  dataTestId,
}: MobileHomeSubmitCtaButtonProps) {
  const formStatusHook = React.useFormStatus ?? (() => ({ pending: false }));
  const formStatus = formStatusHook();
  const pending = Boolean(formStatus?.pending);

  const telemetryPayload = React.useMemo(() => {
    if (!eventPayloadJson) {
      return {};
    }
    try {
      return JSON.parse(eventPayloadJson);
    } catch (error) {
      console.error("[home-recommendation-click] failed to parse telemetry payload", {
        payload: eventPayloadJson,
        error,
      });
      return {};
    }
  }, [eventPayloadJson]);

  const handleClick = () => {
    console.log(eventName, telemetryPayload);
  };

  return (
    <HbButton
      type="submit"
      variant="primary"
      size="md"
      className={PRIMARY_CTA_CLASS}
      data-testid={dataTestId}
      data-event-payload={eventPayloadJson ?? "{}"}
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? pendingLabel : label}
    </HbButton>
  );
}
