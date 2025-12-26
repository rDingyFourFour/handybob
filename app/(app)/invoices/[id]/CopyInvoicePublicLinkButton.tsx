"use client";

import { useState } from "react";

import HbButton from "@/components/ui/hb-button";

type CopyStatus = "idle" | "success" | "failure";

export default function CopyInvoicePublicLinkButton({ url }: { url: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  const handleCopy = async () => {
    console.log("[invoice-public-link-copy-click]");
    try {
      await navigator.clipboard.writeText(url);
      setStatus("success");
      console.log("[invoice-public-link-copy-success]");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("failure");
      console.log("[invoice-public-link-copy-failure]");
      window.setTimeout(() => setStatus("idle"), 2000);
    }
  };

  const label =
    status === "success" ? "Copied" : status === "failure" ? "Copy failed" : "Copy link";

  return (
    <HbButton type="button" size="sm" variant="secondary" onClick={handleCopy}>
      {label}
    </HbButton>
  );
}
