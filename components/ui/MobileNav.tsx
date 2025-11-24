"use client";

import { useState } from "react";
import Link from "next/link";

type NavLink = { label: string; href };

type MobileNavProps = {
  navLinks: NavLink[];
  workspaceName?: string | null;
};

export function MobileNav({ navLinks, workspaceName }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  if (!navLinks.length) return null;

  return (
    <div className="lg:hidden relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="hb-button-ghost mr-1 flex h-10 w-10 flex-col items-center justify-center gap-[3px] rounded-full border border-slate-800 bg-slate-900 px-2 py-2 text-xs text-white"
        aria-label={open ? "Close menu" : "Open menu"}
      >
        <span
          className={`h-[2px] w-5 bg-white transition ${open ? "rotate-45 translate-y-[6px]" : ""}`}
        />
        <span
          className={`h-[2px] w-5 bg-white transition ${open ? "opacity-0" : ""}`}
        />
        <span
          className={`h-[2px] w-5 bg-white transition ${open ? "-rotate-45 -translate-y-[6px]" : ""}`}
        />
      </button>
      {open && (
        <div className="fixed inset-x-0 top-0 z-30 rounded-b-2xl border-b border-slate-800 bg-slate-950/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-4">
            {workspaceName && (
              <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Workspace: {workspaceName}
              </div>
            )}
            <div className="grid gap-2 text-sm">
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
        </div>
      )}
    </div>
  );
}
