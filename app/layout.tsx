// Temporary build debugging code; remove once the diagnostic is complete.
if (process.env.FORCE_FAIL_LAYOUT === "1") {
  throw new Error("FORCE_FAIL_LAYOUT: test crash from app/layout.tsx");
}
// Root layout: resolves Supabase session/workspace on the server once and chooses marketing vs app chrome based on auth state.
import { buildLog } from "@/utils/debug/buildLog";
import type { Metadata } from "next";
// import "./globals.css";
// TEMP: use minimized CSS for Turbopack debug.
import "./globals.css";
import Link from "next/link";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { MobileNav } from "@/components/ui/MobileNav";
import HbButton from "@/components/ui/hb-button";
import { cn } from "@/lib/utils/cn";

// Temporary: disable static pre-generation while debugging the next build hang locally; remove once resolved.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HandyBob",
  description: "Full support office in an app for independent handypeople and small crews.",
};

buildLog("app/layout.tsx module loaded");

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    console.warn("[layout] Failed to resolve user/workspace context:", error);
  }

  const navLinks = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Inbox", href: "/inbox" },
    { label: "Calls", href: "/calls" },
    { label: "Jobs", href: "/jobs" },
    { label: "Customers", href: "/customers" },
    { label: "Appointments", href: "/appointments" },
    { label: "Quotes", href: "/quotes" },
    { label: "Invoices", href: "/invoices" },
    { label: "Settings", href: "/settings" },
  ];

  // Derived from Supabase auth (user resolved via supabase.auth.getUser); true whenever we have a signed-in user/session.
  const isAuthenticated = Boolean(user);
  const brandHref = isAuthenticated ? "/dashboard" : "/";

  const userInitial = user?.email?.[0]?.toUpperCase() || user?.id?.[0]?.toUpperCase() || "?";

  const headerBaseClass =
    "h-14 flex items-center justify-between border-b border-slate-800/60 bg-slate-950/70 backdrop-blur px-4 md:px-6";

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <div className="flex min-h-screen">
          <main className="flex-1 flex flex-col">
            {/* TEMP: force app header to render to verify navbar styling */}
            {true ? (
              <header className={cn(headerBaseClass, "border-b-4 border-yellow-400 bg-red-900 text-yellow-300 px-4")}>
                <div className="flex items-center justify-between gap-4">
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
                    <MobileNav
                      navLinks={navLinks}
                      workspaceName={workspaceContext?.workspace.name ?? ""}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-sm font-semibold text-white">
                      {userInitial}
                    </div>
                  </div>
                </div>
              </header>
            ) : (
              <header className={headerBaseClass}>
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
              </header>
            )}
            <div className="hb-shell flex-1">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
