export type DesktopNavDestination = {
  label: string;
  href: string;
};

export const desktopNavDestinations: DesktopNavDestination[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Jobs", href: "/jobs" },
  { label: "Customers", href: "/customers" },
  { label: "Quotes", href: "/quotes" },
  { label: "Invoices", href: "/invoices" },
  { label: "Appointments", href: "/appointments" },
  { label: "Calls", href: "/calls" },
  { label: "Messages", href: "/messages" },
  { label: "AskBob", href: "/askbob" },
  { label: "Settings", href: "/settings" },
];

export function getDesktopNavDestinationsForMoreMenu(
  excludedHrefs: ReadonlySet<string>,
): DesktopNavDestination[] {
  return desktopNavDestinations.filter(({ href }) => !excludedHrefs.has(href));
}
