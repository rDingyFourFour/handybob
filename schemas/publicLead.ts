type RawForm = Record<string, string | null | undefined>;

export type PublicLeadSubmission = {
  workspaceSlug: string;
  name: string;
  email: string | null;
  phone: string | null;
  description: string;
  address: string | null;
  urgency: "today" | "this_week" | "next_week" | "flexible";
  preferredTime: string | null;
  specificDate: string | null;
  honeypot: string | null;
};

const VALID_URGENCY = new Set(["today", "this_week", "next_week", "flexible"]);

function normalizeString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function isValidEmail(value: string) {
  return value.includes("@") && value.includes(".");
}

export function validatePublicLeadSubmission(
  raw: RawForm & { workspaceSlug?: string | null },
): { success: true; data: PublicLeadSubmission } | { success: false; error: string } {
  const workspaceSlug = normalizeString(raw.workspaceSlug);
  if (!workspaceSlug) {
    return { success: false, error: "Workspace slug is required." };
  }

  const name = normalizeString(raw.name);
  if (!name) {
    return { success: false, error: "Name is required." };
  }

  const description = normalizeString(raw.description);
  if (!description) {
    return { success: false, error: "Please describe the work you need." };
  }

  const email = normalizeString(raw.email);
  if (email && !isValidEmail(email)) {
    return { success: false, error: "Email address is invalid." };
  }

  const phone = normalizeString(raw.phone);
  if (!email && !phone) {
    return { success: false, error: "Please provide an email or phone number." };
  }

  const urgencyRaw = normalizeString(raw.urgency) ?? "flexible";
  const urgency = VALID_URGENCY.has(urgencyRaw as string) ? (urgencyRaw as PublicLeadSubmission["urgency"]) : "flexible";

  const preferredTime = normalizeString(raw.preferredTime);
  const specificDate = normalizeString(raw.specificDate);
  const address = normalizeString(raw.address);
  const honeypot = normalizeString(raw.honeypot);

  return {
    success: true,
    data: {
      workspaceSlug,
      name,
      email,
      phone,
      description,
      address,
      urgency,
      preferredTime,
      specificDate,
      honeypot,
    },
  };
}
