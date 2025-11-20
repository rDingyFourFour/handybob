import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "HandyBob",
  description: "Full support office in an app for independent handypeople and small crews.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
                  Your full support office in an app.
                </p>
              </div>
              <div className="text-xs text-slate-400">
                {/* Placeholder for user menu / account */}
                Not signed in
              </div>
            </header>
            <div className="flex-1 p-4">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
