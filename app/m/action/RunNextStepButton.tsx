"use client";

import * as React from "react";

import HbButton from "@/components/ui/hb-button";

type RunNextStepButtonProps = Omit<React.ComponentProps<typeof HbButton>, "children">;

export default function RunNextStepButton({
  className,
  disabled,
  ...props
}: RunNextStepButtonProps) {
  const formStatusHook = React.useFormStatus ?? (() => ({ pending: false }));
  const formStatus = formStatusHook();
  const pending = formStatus?.pending ?? false;
  return (
    <HbButton
      {...props}
      type="submit"
      variant="primary"
      size="md"
      className={className}
      disabled={pending || disabled}
    >
      {pending ? "Running…" : "Run next step"}
    </HbButton>
  );
}
