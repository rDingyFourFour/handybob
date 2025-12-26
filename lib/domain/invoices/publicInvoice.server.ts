import crypto from "crypto";

import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { PublicInvoicePayload } from "@/lib/domain/invoices/publicInvoice";

type EnsureInvoicePublicTokenResult =
  | { success: true; token: string }
  | { success: false; code: "not_found" | "workspace_mismatch" | "db_error" };

type InvoiceTokenRow = {
  id: string;
  workspace_id: string | null;
  invoice_public_token: string | null;
};

export async function ensureInvoicePublicToken(args: {
  workspaceId: string;
  invoiceId: string;
}): Promise<EnsureInvoicePublicTokenResult> {
  const { workspaceId, invoiceId } = args;
  const supabase = await createServerClient();

  const { data: invoice, error } = await supabase
    .from<InvoiceTokenRow>("invoices")
    .select("id, workspace_id, invoice_public_token")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    console.error("[invoice-public-token] Lookup failed", { workspaceId, invoiceId, reason: "db_error" });
    return { success: false, code: "db_error" };
  }

  if (!invoice) {
    return { success: false, code: "not_found" };
  }

  if (invoice.workspace_id !== workspaceId) {
    return { success: false, code: "workspace_mismatch" };
  }

  if (invoice.invoice_public_token) {
    return { success: true, token: invoice.invoice_public_token };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      invoice_public_token: token,
      invoice_public_token_created_at: now,
    })
    .eq("id", invoiceId);

  if (updateError) {
    console.error("[invoice-public-token] Token update failed", {
      workspaceId,
      invoiceId,
      reason: "db_error",
    });
    return { success: false, code: "db_error" };
  }

  return { success: true, token };
}

export async function getPublicInvoiceByToken(token: string): Promise<PublicInvoicePayload | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from<PublicInvoicePayload>("invoices")
    .select(
      `
        id,
        invoice_number,
        invoice_status,
        snapshot_subtotal_cents,
        snapshot_tax_cents,
        snapshot_total_cents,
        snapshot_summary,
        currency,
        line_items,
        created_at,
        workspaces (
          name,
          brand_name,
          brand_tagline,
          business_email,
          business_phone,
          business_address
        )
      `,
    )
    .eq("invoice_public_token", token)
    .maybeSingle();

  if (error) {
    console.error("[public-invoice-lookup] Failed to resolve invoice", { reason: error.message });
    return null;
  }

  return data ?? null;
}
