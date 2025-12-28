import { parseEnvConfig } from "@/schemas/env";

const appUrl = parseEnvConfig().appUrl;
const APP_BASE_URL = appUrl?.replace(/\/$/, "") ?? null;

export function publicBookingPath(slug: string): string {
  const normalizedSlug = slug.trim().toLowerCase();
  return `/public/bookings/${normalizedSlug}`;
}

export function publicBookingUrl(slug: string): string | null {
  if (!APP_BASE_URL) {
    return null;
  }
  return `${APP_BASE_URL}${publicBookingPath(slug)}`;
}
