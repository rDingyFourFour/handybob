import { buildLog } from "@/utils/debug/buildLog";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HandyBob",
  description: "Full support office in an app for independent handypeople and small crews.",
};

buildLog("app/layout.tsx module loaded");

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
