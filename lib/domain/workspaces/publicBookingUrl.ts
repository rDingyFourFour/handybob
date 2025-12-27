export function getPublicBookingUrlForSlug(slug: string): string {
  const normalizedSlug = slug.trim().toLowerCase();
  return `/public/bookings/${normalizedSlug}`;
}
