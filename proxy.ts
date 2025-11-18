// proxy.ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
