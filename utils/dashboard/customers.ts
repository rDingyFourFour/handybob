export type DashboardCustomer = { id?: string | null; name: string | null };

export function normalizeCustomer(
  customer: DashboardCustomer | DashboardCustomer[] | null | undefined
) {
  if (!customer) return null;
  return Array.isArray(customer) ? customer[0] ?? null : customer;
}
