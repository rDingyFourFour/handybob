"use client";

import Link from "next/link";
import { KeyboardEvent, MouseEvent } from "react";
import { useRouter } from "next/navigation";

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
};

type CustomerListRowProps = {
  customer: CustomerRow;
};

const formatCustomerSince = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "Unknown";

export default function CustomerListRow({ customer }: CustomerListRowProps) {
  const router = useRouter();
  const handleNavigate = () => router.push(`/customers/${customer.id}`);

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>) => {
    if ((event.target as HTMLElement).closest("a")) return;
    handleNavigate();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNavigate();
    }
  };

  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={`View details for ${customer.name ?? "Unnamed customer"}`}
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      className="border-t border-slate-800/60 cursor-pointer hover:bg-slate-800/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
    >
      <td className="py-3 font-medium text-slate-100">
        <Link
          href={`/customers/${customer.id}`}
          className="inline-flex w-full text-slate-100 hover:text-slate-50 focus:outline-none"
        >
          {customer.name || "Unnamed customer"}
        </Link>
      </td>
      <td className="py-3 hidden md:table-cell text-slate-400">{customer.email || "—"}</td>
      <td className="py-3 hidden md:table-cell text-slate-400">{customer.phone || "—"}</td>
      <td className="py-3 text-right text-slate-400">{formatCustomerSince(customer.created_at)}</td>
    </tr>
  );
}
