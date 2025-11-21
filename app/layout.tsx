import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";

export const metadata: Metadata = {
  title: "HandyBob",
  description: "Full support office in an app for independent handypeople and small crews.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerClient();
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

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="hidden md:block w-64 border-r border-slate-800 bg-slate-900/80 p-4">
            <div className="mb-6">
              <h1 className="text-xl font-semibold tracking-tight">HandyBob</h1>
              <p className="text-xs text-slate-400">
                Full support office in an app
              </p>
            </div>
            <nav className="space-y-1 text-sm">
              <div className="font-semibold text-slate-300 mb-2">Main</div>
              <ul className="space-y-1">
                <li className="rounded-lg px-2 py-1 bg-slate-800/80">
                  <Link href="/">Dashboard</Link>
                </li>
                <li className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800/60">
                  <Link href="/inbox">Inbox</Link>
                </li>
                <li className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800/60">
                  <Link href="/calls">Calls</Link>
                </li>
                <li className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800/60">
                  <Link href="/jobs">Jobs</Link>
                </li>
                <li className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800/60">
                  <Link href="/customers">Customers</Link>
                </li>
                <li className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800/60">
                  <Link href="/appointments">Appointments</Link>
                </li>
                <li className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800/60">
                  <Link href="/invoices">Invoices</Link>
                </li>
              </ul>
            </nav>
          </aside>

          {/* Main area */}
          <main className="flex-1 flex flex-col">
            <header className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  HandyBob Dashboard
                </h2>
                <p className="text-xs text-slate-400">
                  Workspace: {workspaceContext?.workspace.name || "—"}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-300">
                {workspaceContext ? (
                  <Link href="/settings/workspace" className="hb-button-ghost text-xs">
                    Settings
                  </Link>
                ) : null}
                <div className="rounded border border-slate-800 px-2 py-1">
                  {user ? (
                    <span className="text-slate-200">
                      {user.email || "Signed in"} • {workspaceContext?.workspace.name || "Workspace"}
                    </span>
                  ) : (
                    <Link href="/login" className="text-slate-400 hover:text-slate-200">Sign in</Link>
                  )}
                </div>
              </div>
            </header>
            <div className="flex-1 p-4">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
