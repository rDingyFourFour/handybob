import Link from "next/link";

import { buildLog } from "@/utils/debug/buildLog";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { MobileNav } from "@/components/ui/MobileNav";
import HbButton from "@/components/ui/hb-button";
import { createServerClient } from "@/utils/supabase/server";
import type { ReactNode } from "react";

const HEADER_CLASS =
  "sticky top-0 z-50 flex h-16 items-center justify-between border-b border-slate-800/60 bg-slate-950/80 px-4 md:px-6 backdrop-blur";

type AppShellHeaderProps = {
  brandHref: string;
  isAuthenticated: boolean;
  navLinks: { label: string; href: string }[];
  workspaceName: string;
  userInitial: string;
  hideHeader?: boolean;
};

export function AppShellHeader({
  hideHeader,
  brandHref,
  isAuthenticated,
  navLinks,
  workspaceName,
  userInitial,
}: AppShellHeaderProps) {
  if (hideHeader) {
    return null;
  }

  return (
    <header data-testid="app-shell-header" className={HEADER_CLASS}>
      {isAuthenticated ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4">
              <Link href={brandHref} className="text-lg font-semibold tracking-tight">
                HandyBob
              </Link>
              <nav className="hidden lg:flex items-center gap-2 text-sm text-slate-300">
                {navLinks.map(({ label, href }) => (
                  <Link
                    key={label}
                    href={href}
                    className="rounded-md px-2 py-1 text-slate-300 transition hover:bg-slate-800 hover:text-white"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
              <MobileNav navLinks={navLinks} workspaceName={workspaceName} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-sm font-semibold text-white">
              {userInitial}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link href={brandHref} className="text-lg font-semibold tracking-tight">
              HandyBob
            </Link>
            <p className="text-xs text-slate-400">
              Full support office in an app for independent handypeople and crews.
            </p>
          </div>
          <div className="flex gap-2">
            <HbButton as={Link} href="/signup" size="sm" variant="primary">
              Create account
            </HbButton>
            <HbButton as={Link} href="/login" size="sm" variant="ghost">
              Sign in
            </HbButton>
          </div>
        </div>
      )}
    </header>
  );
}

export default async function AppShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  buildLog("app/(app)/layout.tsx module loaded");
  const supabase = await createServerClient();
  let workspaceContext: Awaited<ReturnType<typeof getCurrentWorkspace>> | null = null;
  let user = null as Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null;

  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
    if (user) {
      workspaceContext = await getCurrentWorkspace({ supabase });
    }
  } catch (error) {
    console.warn("[app-shell layout] Failed to resolve user/workspace context:", error);
  }

  const navLinks = [
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

  const isAuthenticated = Boolean(user);
  const brandHref = isAuthenticated ? "/dashboard" : "/";

  const userInitial = user?.email?.[0]?.toUpperCase() || user?.id?.[0]?.toUpperCase() || "?";

  return (
    <div className="flex min-h-screen">
      <main className="flex-1 flex flex-col pt-16">
        <AppShellHeader
          brandHref={brandHref}
          isAuthenticated={isAuthenticated}
          navLinks={navLinks}
          workspaceName={workspaceContext?.workspace.name ?? ""}
          userInitial={userInitial}
        />
        <div className="hb-shell flex-1">{children}</div>
      </main>
    </div>
  );
}
