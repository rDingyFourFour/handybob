"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import { createClient } from "@/utils/supabase/client";

type SignOutButtonProps = {
  userId: string;
  workspaceId?: string | null;
};

const SIGN_OUT_ERROR_MESSAGE = "We couldn't sign you out. Please try again.";

function getSafeErrorCode(error: unknown): string {
  if (!error) {
    return "unknown_error";
  }
  if (typeof error === "object" && "name" in error) {
    const value = (error as { name?: unknown }).name;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return "signout_failed";
}

export default function SignOutButton({ userId, workspaceId }: SignOutButtonProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const logPayload = {
    userId,
    workspaceId: workspaceId ?? null,
  };

  const handleSignOut = async () => {
    if (isSubmitting) {
      return;
    }
    setErrorMessage(null);
    console.log("[settings-signout-click]", logPayload);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        const errorCode = getSafeErrorCode(error);
        console.error("[settings-signout-failure]", {
          ...logPayload,
          errorCode,
        });
        setErrorMessage(SIGN_OUT_ERROR_MESSAGE);
        setIsSubmitting(false);
        return;
      }
      console.log("[settings-signout-success]", logPayload);
      router.replace("/login");
    } catch (error) {
      const errorCode = getSafeErrorCode(error);
      console.error("[settings-signout-failure]", {
        ...logPayload,
        errorCode,
      });
      setErrorMessage(SIGN_OUT_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <HbButton
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleSignOut}
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className="border-red-500/60 text-red-200 hover:border-red-400 hover:text-red-100 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Signing out..." : "Sign out"}
      </HbButton>
      {errorMessage && (
        <p className="text-sm text-red-400" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
