"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";
import {
  CallOutlineIcon,
  HomeOutlineIcon,
  JobsOutlineIcon,
  MoreHorizontalIcon,
} from "@/components/ui/icons";

type MobileMenuItem = {
  label: string;
  href: string;
};

type MobileTab = {
  label: string;
  href?: string;
  Icon: (props: React.SVGProps<SVGSVGElement>) => ReactElement;
  menuItems?: MobileMenuItem[];
};

const OFFICE_MENU_ITEMS: MobileMenuItem[] = [
  { label: "Messages", href: "/messages" },
  { label: "Customers", href: "/customers" },
  { label: "Settings", href: "/settings" },
  { label: "Billing", href: "/billing" },
];

const MOBILE_TABS: MobileTab[] = [
  { label: "Home", href: "/m", Icon: HomeOutlineIcon },
  { label: "Jobs", href: "/jobs", Icon: JobsOutlineIcon },
  { label: "Calls", href: "/calls", Icon: CallOutlineIcon },
  { label: "Office", href: "/dashboard", Icon: MoreHorizontalIcon, menuItems: OFFICE_MENU_ITEMS },
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
  const safeAreaTop = "env(safe-area-inset-top, 0px)";
  const [isOfficeMenuOpen, setIsOfficeMenuOpen] = useState(false);
  const officeButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstMenuItemRef = useRef<HTMLAnchorElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const wasOfficeMenuOpen = useRef(false);

  const officeMenuTab = MOBILE_TABS.find((tab) => Array.isArray(tab.menuItems) && tab.menuItems.length > 0);
  const officeMenuItems = officeMenuTab?.menuItems ?? [];

  const primaryTabs = MOBILE_TABS.filter(
    (tab): tab is MobileTab & { href: string } =>
      typeof tab.href === "string" && !tab.menuItems?.length,
  );
  const defaultTabHref = primaryTabs[0]?.href ?? "/";
  const activeTabHref =
    primaryTabs.find(({ href }) =>
      normalizedPath === href || normalizedPath.startsWith(`${href}/`),
    )?.href ?? defaultTabHref;

  const tabBaseClass =
    "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.25em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background-paper)]";
  const activeTabClass = "text-[var(--theme-primary)]";
  const inactiveTabClass = "text-slate-500";

  useEffect(() => {
    if (isOfficeMenuOpen) {
      firstMenuItemRef.current?.focus();
    } else if (wasOfficeMenuOpen.current) {
      officeButtonRef.current?.focus();
    }
    wasOfficeMenuOpen.current = isOfficeMenuOpen;
  }, [isOfficeMenuOpen]);

  useEffect(() => {
    if (!isOfficeMenuOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (
        officeButtonRef.current?.contains(target as Node) ||
        menuRef.current?.contains(target as Node)
      ) {
        return;
      }
      setIsOfficeMenuOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOfficeMenuOpen]);

  return (
    <div
      data-testid="mobile-shell"
      className="hb-mobile-shell hb-mobile-theme flex flex-col bg-[var(--theme-background)] text-[var(--color-text-primary)]"
    >
      <main
        className="hb-mobile-shell-content px-4 sm:px-6"
        style={{
          paddingTop: safeAreaTop,
        }}
      >
        <div className="mx-auto flex w-full max-w-[640px] flex-col">{children}</div>
      </main>
      {!hideTabBar && (
        <div
          data-testid="mobile-tab-bar-wrapper"
          className="border-t border-[var(--theme-divider)] bg-[var(--theme-card-elevated)] shadow-[var(--theme-shadow)]"
        >
          <div className="relative">
            <nav
              data-testid="mobile-tab-bar"
              aria-label="Primary mobile navigation"
              className="flex items-center gap-2"
            >
              {MOBILE_TABS.map(({ label, href, Icon, menuItems }) => {
                const isMenuTab = Boolean(menuItems?.length);
                const isActive = href && !isMenuTab ? activeTabHref === href : false;

                if (isMenuTab) {
                  return (
                    <button
                      key={label}
                      type="button"
                      data-testid="mobile-tab-office-button"
                      className={cn(tabBaseClass, inactiveTabClass)}
                      aria-haspopup="menu"
                      aria-expanded={isOfficeMenuOpen}
                      ref={officeButtonRef}
                      onClick={() => setIsOfficeMenuOpen((prev) => !prev)}
                    >
                      <span className="relative flex h-6 w-6 items-center justify-center">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span>{label}</span>
                    </button>
                  );
                }

                return (
                  <Link
                    key={href ?? label}
                    href={href ?? "#"}
                    className={cn(tabBaseClass, isActive ? activeTabClass : inactiveTabClass)}
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
        </div>
      )}
      {isOfficeMenuOpen && officeMenuItems.length > 0 && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Office menu"
          data-testid="mobile-tab-office-menu"
          className="rounded-2xl bg-[var(--theme-card)] p-2 shadow-[var(--theme-shadow)]"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setIsOfficeMenuOpen(false);
            }
          }}
        >
          <div className="flex flex-col gap-1">
            {officeMenuItems.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-xl px-3 py-2 text-left text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-text-primary)] transition hover:bg-[var(--theme-card-elevated)]"
                role="menuitem"
                onClick={() => setIsOfficeMenuOpen(false)}
                ref={index === 0 ? firstMenuItemRef : undefined}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
