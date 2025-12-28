"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import HbCard from "@/components/ui/hb-card";

type WorkspaceTab = "prepare" | "during" | "after";

type GuidedCallWorkspaceCardProps = {
  initialTab?: WorkspaceTab;
  prepare: React.ReactNode;
  during: React.ReactNode;
  after: React.ReactNode;
};

const WORKSPACE_NAV_EVENT = "calls-session-workspace-navigate";

function resolveTabFromHash(hash: string): WorkspaceTab | null {
  if (!hash) {
    return null;
  }
  const normalized = hash.startsWith("#") ? hash : `#${hash}`;
  if (normalized === "#call-outcome-capture" || normalized === "#askbob-after-call") {
    return "after";
  }
  if (normalized === "#phone-call-script-section") {
    return "prepare";
  }
  return null;
}

export default function GuidedCallWorkspaceCard({
  initialTab = "prepare",
  prepare,
  during,
  after,
}: GuidedCallWorkspaceCardProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);

  const tabs = useMemo(
    () => [
      { key: "prepare" as const, label: "Prepare" },
      { key: "during" as const, label: "During" },
      { key: "after" as const, label: "After" },
    ],
    [],
  );

  const scrollToHash = useCallback((hash: string | null) => {
    if (!hash || typeof window === "undefined") {
      return;
    }
    const id = hash.startsWith("#") ? hash.slice(1) : hash;
    const target = document.getElementById(id);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleNavigate = useCallback(
    (tab: WorkspaceTab | null, hash: string | null) => {
      if (tab) {
        setActiveTab(tab);
      }
      if (!hash) {
        return;
      }
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          scrollToHash(hash);
        });
      });
    },
    [scrollToHash],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleWorkspaceNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: WorkspaceTab; hash?: string }>).detail;
      handleNavigate(detail?.tab ?? null, detail?.hash ?? null);
    };
    const handleHashChange = () => {
      const hash = window.location.hash;
      const tab = resolveTabFromHash(hash);
      handleNavigate(tab, hash || null);
    };
    window.addEventListener(WORKSPACE_NAV_EVENT, handleWorkspaceNavigate);
    window.addEventListener("hashchange", handleHashChange);
    const initialHash = window.location.hash;
    if (initialHash) {
      const tab = resolveTabFromHash(initialHash);
      if (tab) {
        window.requestAnimationFrame(() => {
          handleNavigate(tab, initialHash);
        });
      }
    }
    return () => {
      window.removeEventListener(WORKSPACE_NAV_EVENT, handleWorkspaceNavigate);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [handleNavigate]);

  return (
    <HbCard data-testid="guided-call-workspace" className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Guided workspace</p>
        <h2 className="hb-heading-3 text-xl font-semibold text-white">Guided call workspace</h2>
        <p className="text-sm text-slate-400">
          Use the tabs to prep, guide the call, and finalize follow-up outcomes.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Guided call workspace">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`guided-call-workspace-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`guided-call-workspace-${tab.key}`}
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                isActive
                  ? "border-amber-400 bg-amber-500/20 text-amber-100"
                  : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-600"
              }`}
              onClick={() => setActiveTab(tab.key)}
              data-testid={`guided-call-workspace-tab-${tab.key}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id="guided-call-workspace-prepare"
        role="tabpanel"
        aria-labelledby="guided-call-workspace-tab-prepare"
        hidden={activeTab !== "prepare"}
        data-testid="guided-call-workspace-prepare"
      >
        {prepare}
      </div>
      <div
        id="guided-call-workspace-during"
        role="tabpanel"
        aria-labelledby="guided-call-workspace-tab-during"
        hidden={activeTab !== "during"}
        data-testid="guided-call-workspace-during"
      >
        {during}
      </div>
      <div
        id="guided-call-workspace-after"
        role="tabpanel"
        aria-labelledby="guided-call-workspace-tab-after"
        hidden={activeTab !== "after"}
        data-testid="guided-call-workspace-after"
      >
        {after}
      </div>
    </HbCard>
  );
}
