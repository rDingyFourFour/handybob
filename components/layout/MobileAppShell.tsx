"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createClient } from "@/utils/supabase/client";

import { cn } from "@/lib/utils/cn";
import {
  CallOutlineIcon,
  HomeOutlineIcon,
  JobsOutlineIcon,
  MoreHorizontalIcon,
  SettingsOutlineIcon,
} from "@/components/ui/icons";
import {
  DesktopNavDestination,
  desktopNavDestinations,
} from "@/lib/domain/navigation/desktopNav";

type MobileTab = {
  label: string;
  href?: string;
  Icon: (props: React.SVGProps<SVGSVGElement>) => ReactElement;
  isButton?: boolean;
};

type OverflowMenuItem = {
  label: string;
  Icon?: (props: React.SVGProps<SVGSVGElement>) => ReactElement;
  onSelect: () => void;
  testId?: string;
};

const OFFICE_MENU_ORDER: DesktopNavDestination["href"][] = [
  "/customers",
  "/quotes",
  "/invoices",
  "/appointments",
  "/settings",
];

const MOBILE_TABS: MobileTab[] = [
  { label: "Home", href: "/m", Icon: HomeOutlineIcon },
  { label: "Jobs", href: "/jobs", Icon: JobsOutlineIcon },
  { label: "Calls", href: "/calls", Icon: CallOutlineIcon },
  { label: "Office", Icon: MoreHorizontalIcon, isButton: true },
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
  const router = useRouter();
  const safeAreaTop = "env(safe-area-inset-top, 0px)";

  const primaryTabs = MOBILE_TABS.filter(
    (tab): tab is MobileTab & { href: string } => typeof tab.href === "string",
  );
  const defaultTabHref = primaryTabs[0]?.href ?? "/";
  const activeTabHref =
    primaryTabs.find(({ href }) =>
      normalizedPath === href || normalizedPath.startsWith(`${href}/`),
    )?.href ?? defaultTabHref;

  const supabase = useMemo(() => createClient(), []);
  const [isOfficeMenuOpen, setIsOfficeMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const officeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousPathnameRef = useRef(pathname);

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
    console.error("[mobile-office-signout-failure]", error);
        return;
      }
      router.replace("/login");
    } catch (error) {
      console.error("[mobile-office-signout-failure]", error);
    } finally {
      setIsSigningOut(false);
    }
  }, [isSigningOut, router, supabase]);

  const handleSignOutSelect = useCallback(() => {
    setIsOfficeMenuOpen(false);
    void handleSignOut();
  }, [handleSignOut]);

  const handleNavigateSelect = useCallback(
    (href: string) => {
        setIsOfficeMenuOpen(false);
      void router.push(href);
    },
    [router],
  );

  const toggleOfficeMenu = useCallback(() => {
    setIsOfficeMenuOpen((prev) => {
      const nextState = !prev;
      if (nextState) {
        console.log("[mobile-office-menu-open]");
      }
      return nextState;
    });
  }, []);

  useEffect(() => {
    if (!isOfficeMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (
        menuRef.current?.contains(target) ||
        officeButtonRef.current?.contains(target)
      ) {
        return;
      }
      setIsOfficeMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOfficeMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOfficeMenuOpen]);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }
    previousPathnameRef.current = pathname;
    setIsOfficeMenuOpen(false);
  }, [pathname]);

  const officeMenuDestinations = OFFICE_MENU_ORDER.flatMap((href) => {
    const destination = desktopNavDestinations.find(
      (navDestination) => navDestination.href === href,
    );
    return destination ? [destination] : [];
  });
  const officeMenuNavItems = officeMenuDestinations.map((destination) => {
    const isSettingsDestination = destination.href === "/settings";
    return {
      label: destination.label,
      Icon: isSettingsDestination ? SettingsOutlineIcon : undefined,
      onSelect: () => handleNavigateSelect(destination.href),
      testId: isSettingsDestination ? "office-menu-settings" : undefined,
    };
  });
  const overflowMenuItems: OverflowMenuItem[] = [
    ...officeMenuNavItems,
    {
      label: "Sign out",
      onSelect: handleSignOutSelect,
      testId: "office-menu-sign-out",
    },
  ];
  // TODO: Add a "Help / Support" entry routing to /help once that route exists.
  // TODO: Add an "Account" entry pointing to /account when the desktop view is migrated.

  return (
    <div
      data-testid="mobile-shell"
      className="hb-mobile-shell hb-mobile-theme flex min-h-screen flex-col bg-[var(--theme-background)] text-[var(--color-text-primary)]"
    >
      <main
        className="flex-1 px-4 py-6 sm:px-6"
        style={{
          paddingTop: safeAreaTop,
          paddingBottom:
            "calc(var(--hb-mobile-bottom-nav-height) + env(safe-area-inset-bottom, 0px))",
        }}
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
          <div className="relative">
            <nav
              data-testid="mobile-tab-bar"
              aria-label="Primary mobile navigation"
              className="flex items-center gap-2 px-3"
            >
              {MOBILE_TABS.map(({ label, href, Icon, isButton }) => {
                if (isButton) {
                  return (
                <button
                  key={label}
                  ref={officeButtonRef}
                  type="button"
                  aria-label="Office"
                  aria-expanded={isOfficeMenuOpen}
                  aria-controls="mobile-office-menu"
                  className={cn(
                    "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.25em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background-paper)]",
                    "text-slate-500",
                  )}
                  data-testid="mobile-tab-office-button"
                  onClick={toggleOfficeMenu}
                >
                      <span className="relative flex h-6 w-6 items-center justify-center">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span>{label}</span>
                    </button>
                  );
                }

                const isActive = href ? activeTabHref === href : false;

                return (
                  <Link
                    key={href}
                    href={href ?? "#"}
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
            {isOfficeMenuOpen && (
              <div
                ref={menuRef}
                id="mobile-office-menu"
                data-testid="mobile-office-menu"
                role="menu"
                aria-label="Office options"
                className="absolute left-3 right-3 bottom-full mb-2 z-10 w-auto rounded-2xl border border-[var(--theme-divider)] bg-[var(--theme-card-elevated)] px-1 py-2 shadow-[var(--theme-shadow)]"
              >
                <div className="flex flex-col gap-1">
                  {overflowMenuItems.map(({ label, Icon, onSelect, testId }) => (
                    <button
                      key={label}
                      type="button"
                      role="menuitem"
                      data-testid={testId}
                      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-[var(--color-text-primary)] transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background-paper)]"
                      onClick={onSelect}
                    >
                      {Icon && (
                        <span className="flex h-5 w-5 items-center justify-center text-slate-400">
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                      )}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
