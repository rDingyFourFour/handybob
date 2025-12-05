export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import HbCard from "@/components/ui/hb-card";
import { createServerClient } from "@/utils/supabase/server";

async function saveOwnerProfile(formData: FormData) {
  "use server";

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = (formData.get("display_name") as string | null)?.trim() || null;
  const contactEmail = (formData.get("contact_email") as string | null)?.trim() || null;
  const contactPhone = (formData.get("contact_phone") as string | null)?.trim() || null;

  const metadataUpdate: Record<string, string | null> = {
    full_name: displayName,
    name: displayName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
  };

  const { error } = await supabase.auth.updateUser({
    data: metadataUpdate,
  });

  if (error) {
    console.error("[profile-settings] Failed to save profile metadata", error);
    throw error;
  }

  revalidatePath("/settings/profile");
}

export default async function ProfileSettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const metadata = (user.user_metadata as
    | {
        full_name?: string | null;
        name?: string | null;
        contact_email?: string | null;
        contact_phone?: string | null;
      }
    | undefined) ?? {};

  const initialDisplayName = metadata.full_name ?? metadata.name ?? "";
  const initialContactEmail = metadata.contact_email ?? user.email ?? "";
  const initialContactPhone = metadata.contact_phone ?? user.phone ?? "";

  return (
    <div className="hb-shell pt-20 pb-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <h1 className="hb-heading-2 text-2xl font-semibold text-slate-100">Owner profile</h1>
          <p className="text-sm text-slate-400">
            Control how customers see your responses and messages.
          </p>
        </div>

        <HbCard className="space-y-4">
          <p className="text-sm text-slate-300">
            We’ll use these details in call summaries and follow-up drafts so the tone and contact info feel human.
          </p>
          <form action={saveOwnerProfile} className="space-y-4">
            <div>
              <label className="hb-label" htmlFor="display_name">
                Display name
              </label>
              <input
                id="display_name"
                name="display_name"
                className="hb-input"
                defaultValue={initialDisplayName}
                placeholder="Your name as customers see it"
              />
              <p className="text-xs text-slate-500">
                Used in call summaries, follow-up drafts, and message signatures.
              </p>
            </div>

            <div>
              <label className="hb-label" htmlFor="contact_email">
                Contact email
              </label>
              <input
                id="contact_email"
                name="contact_email"
                type="email"
                className="hb-input"
                defaultValue={initialContactEmail}
                placeholder="reply@yourbusiness.com"
              />
              <p className="text-xs text-slate-500">
                We’ll use this address as a reply-to or signature mention in follow-ups and emails.
              </p>
            </div>

            <div>
              <label className="hb-label" htmlFor="contact_phone">
                Phone number (optional)
              </label>
              <input
                id="contact_phone"
                name="contact_phone"
                className="hb-input"
                defaultValue={initialContactPhone}
                placeholder="+1 (555) 123-4567"
              />
              <p className="text-xs text-slate-500">
                Optional—add a number to mention in call summaries or outbound follow-ups.
              </p>
            </div>

            <div className="flex justify-end">
              <button className="hb-button" type="submit">
                Save profile
              </button>
            </div>
          </form>
        </HbCard>
      </div>
    </div>
  );
}
