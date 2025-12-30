import type { ReactNode } from "react";

import MobileAppShell from "@/components/layout/MobileAppShell";

type MobileLayoutProps = {
  children: ReactNode;
};

export default function MobileLayout({ children }: MobileLayoutProps) {
  return <MobileAppShell>{children}</MobileAppShell>;
}
