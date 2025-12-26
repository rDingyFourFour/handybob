import { publicInvoiceUrl } from "@/utils/urls/public";

export type PublicInvoiceLineItem = {
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
};

export type PublicInvoicePayload = {
  id: string;
  invoice_number: number | null;
  invoice_status: string | null;
  snapshot_subtotal_cents: number | null;
  snapshot_tax_cents: number | null;
  snapshot_total_cents: number | null;
  snapshot_summary: string | null;
  currency: string | null;
  line_items: PublicInvoiceLineItem[] | null;
  created_at: string | null;
  workspaces:
    | {
        name: string | null;
        brand_name: string | null;
        brand_tagline: string | null;
        business_email: string | null;
        business_phone: string | null;
        business_address: string | null;
      }
    | null;
};

export function getInvoicePublicLink(token: string) {
  return publicInvoiceUrl(token);
}
