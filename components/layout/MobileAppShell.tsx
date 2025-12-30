"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import {
  HomeOutlineIcon,
  JobsOutlineIcon,
  CallOutlineIcon,
  SettingsOutlineIcon,
} from "@/components/ui/icons";

type MobileTab = {
  label: string;
  href: string;
  Icon: (props: React.SVGProps<SVGSVGElement>) => ReactElement;
};

const MOBILE_TABS: MobileTab[] = [
  { label: "Home", href: "/m", Icon: HomeOutlineIcon },
  { label: "Jobs", href: "/jobs", Icon: JobsOutlineIcon },
  { label: "Calls", href: "/calls", Icon: CallOutlineIcon },
  { label: "Settings", href: "/settings", Icon: SettingsOutlineIcon },
];

type MobileAppShellProps = {
  children: ReactNode;
  hideTabBar?: boolean;
};

export default function MobileAppShell({
  children,
  hideTabBar = false,
}: MobileAppShellProps) {
  const pathname = usePathname() ?? "/";
  const normalizedPath = pathname.replace(/\/$/, "") || "/";

  const activeTab = MOBILE_TABS.find(({ href }) =>
    normalizedPath === href || normalizedPath.startsWith(`${href}/`),
  )?.href;

  return (
    <div
      data-testid="mobile-shell"
      className="hb-mobile-theme flex min-h-screen flex-col bg-[var(--theme-background)] text-[var(--color-text-primary)]"
    >
      <main
        className="flex-1 px-4 py-6 sm:px-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      >
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">{children}</div>
      </main>
      {!hideTabBar && (
        <div
          data-testid="mobile-tab-bar-wrapper"
          className="border-t border-[var(--theme-divider)] bg-[var(--theme-card-elevated)] shadow-[var(--theme-shadow)]"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
            paddingTop: "0.75rem",
          }}
        >
          <nav
            data-testid="mobile-tab-bar"
            aria-label="Primary mobile navigation"
            className="flex items-center gap-2 px-3"
          >
            {MOBILE_TABS.map(({ label, href, Icon }) => {
              const isActive = activeTab ? activeTab === href : href === MOBILE_TABS[0].href;

              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.25em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background-paper)]",
                    isActive ? "text-[var(--theme-primary)]" : "text-slate-500",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="relative flex h-6 w-6 items-center justify-center">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
