import { parseEnvConfig } from "@/schemas/env";

const appUrl = parseEnvConfig().appUrl;
const APP_BASE_URL = appUrl?.replace(/\/$/, "") ?? null;

function buildPublicPath(path: string) {
  if (!APP_BASE_URL) return path;
  return `${APP_BASE_URL}${path}`;
}

export function getPublicBookingUrlForSlug(slug: string): string {
  const normalizedSlug = slug.trim().toLowerCase();
  return buildPublicPath(`/public/bookings/${normalizedSlug}`);
}
