"use client";

import { useState } from "react";
import Link from "next/link";

type NavLink = { label: string; href: string };

type MobileNavProps = {
  navLinks: NavLink[];
  workspaceName?: string | null;
};

export function MobileNav({ navLinks, workspaceName }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  if (!navLinks.length) return null;

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="hb-button-ghost px-3 py-2 text-xs"
      >
        {open ? "Close" : "Menu"}
      </button>
      {open && (
        <div className="absolute inset-x-2 top-full z-30 mt-2 rounded-xl border border-slate-800 bg-slate-950/95 p-4 shadow-xl">
          {workspaceName && (
            <div className="mb-3 text-xs uppercase tracking-[0.3em] text-slate-500">
              Workspace: {workspaceName}
            </div>
          )}
          <div className="space-y-2 text-sm">
            {navLinks.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="block rounded-md px-3 py-2 text-slate-200 transition hover:bg-slate-900"
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
