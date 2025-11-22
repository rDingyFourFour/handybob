import { parseEnvConfig } from "@/schemas/env";

const appUrl = parseEnvConfig().appUrl;

const APP_BASE_URL = appUrl?.replace(/\/$/, "") ?? null;

function buildPublicPath(path: string) {
  if (!APP_BASE_URL) return path;
  return `${APP_BASE_URL}${path}`;
}

// Helpers for constructing shareable public URLs. Used by server actions and routes (quotes, invoices, bookings) that deliver links to customers.
// Assumes `NEXT_PUBLIC_APP_URL` points to the public app host; when missing it falls back to the relative `/public/...` path.
export function publicQuoteUrl(token: string) {
  return buildPublicPath(`/public/quotes/${token}`);
}

export function publicInvoiceUrl(token: string) {
  return buildPublicPath(`/public/invoices/${token}`);
}

export function publicBookingUrl(slug: string) {
  return buildPublicPath(`/public/bookings/${slug}`);
}
