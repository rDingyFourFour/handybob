import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockSignOut = vi.fn(() => Promise.resolve({ error: null }));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/m"),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}));

import { usePathname } from "next/navigation";
import MobileAppShell from "@/components/layout/MobileAppShell";
import type { ComponentProps } from "react";

const mockedUsePathname = vi.mocked(usePathname);

type MobileAppShellProps = ComponentProps<typeof MobileAppShell>;

const EXPECTED_OFFICE_MENU_LABELS = [
  "Customers",
  "Quotes",
  "Invoices",
  "Appointments",
  "Settings",
  "Sign out",
];

const FORBIDDEN_OFFICE_MENU_LABELS = ["Dashboard", "AskBob", "Messages"];

describe("MobileAppShell office menu", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockedUsePathname.mockReset();
    mockedUsePathname.mockReturnValue("/m");
    mockPush.mockReset();
    mockReplace.mockReset();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    container.remove();
  });

  function renderShell(props: Partial<MobileAppShellProps> = {}) {
    act(() => {
      root?.render(
        <MobileAppShell {...props}>
          {props.children ?? <div>Mobile content</div>}
        </MobileAppShell>,
      );
    });
  }

  it("opens the office menu and lists the approved destinations", () => {
    renderShell();

    const officeButton = container.querySelector('button[aria-label="Office"]') as
      | HTMLButtonElement
      | null;
    expect(officeButton).toBeTruthy();

    act(() => {
      officeButton?.click();
    });

    const menu = container.querySelector('[data-testid="mobile-office-menu"]');
    expect(menu).toBeTruthy();
    const menuLabels = Array.from(menu?.querySelectorAll("button span:last-child") ?? []).map(
      (span) => span.textContent?.trim() ?? "",
    );
    expect(menuLabels).toEqual(EXPECTED_OFFICE_MENU_LABELS);
    expect(container.querySelector('[data-testid="office-menu-settings"]')).toBeTruthy();
  });

  it("never renders forbidden office destinations", () => {
    renderShell();

    const officeButton = container.querySelector('button[aria-label="Office"]') as
      | HTMLButtonElement
      | null;
    act(() => {
      officeButton?.click();
    });

    const menu = container.querySelector('[data-testid="mobile-office-menu"]');
    expect(menu).toBeTruthy();
    const menuText = menu?.textContent ?? "";
    for (const forbiddenLabel of FORBIDDEN_OFFICE_MENU_LABELS) {
      expect(menuText).not.toContain(forbiddenLabel);
    }
  });

  it("closes the menu when clicking outside", () => {
    renderShell();
    const officeButton = container.querySelector('button[aria-label="Office"]') as
      | HTMLButtonElement
      | null;
    act(() => {
      officeButton?.click();
    });

    expect(container.querySelector('[data-testid="mobile-office-menu"]')).toBeTruthy();

    act(() => {
      document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="mobile-office-menu"]')).toBeNull();
  });

  it("closes the menu when pressing Escape", () => {
    renderShell();
    const officeButton = container.querySelector('button[aria-label="Office"]') as
      | HTMLButtonElement
      | null;
    act(() => {
      officeButton?.click();
    });

    expect(container.querySelector('[data-testid="mobile-office-menu"]')).toBeTruthy();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(container.querySelector('[data-testid="mobile-office-menu"]')).toBeNull();
  });

  it("closes the menu when the pathname changes", () => {
    renderShell();
    const officeButton = container.querySelector('button[aria-label="Office"]') as
      | HTMLButtonElement
      | null;
    act(() => {
      officeButton?.click();
    });

    expect(container.querySelector('[data-testid="mobile-office-menu"]')).toBeTruthy();

    mockedUsePathname.mockReturnValue("/dashboard");
    renderShell();

    expect(container.querySelector('[data-testid="mobile-office-menu"]')).toBeNull();
  });

  it("navigates to Settings and closes the menu", () => {
    renderShell();
    const officeButton = container.querySelector('button[aria-label="Office"]') as
      | HTMLButtonElement
      | null;
    act(() => {
      officeButton?.click();
    });

    const settingsItem = container.querySelector('[data-testid="office-menu-settings"]') as
      | HTMLButtonElement
      | null;
    expect(settingsItem).toBeTruthy();

    act(() => {
      settingsItem?.click();
    });

    expect(mockPush).toHaveBeenCalledWith("/settings");
    expect(container.querySelector('[data-testid="mobile-office-menu"]')).toBeNull();
  });

  it("navigates to Customers and closes the menu", () => {
    renderShell();
    const officeButton = container.querySelector('button[aria-label="Office"]') as
      | HTMLButtonElement
      | null;
    act(() => {
      officeButton?.click();
    });

    const menu = container.querySelector('[data-testid="mobile-office-menu"]');
    expect(menu).toBeTruthy();

    const destinationButton = Array.from(menu?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent?.trim() === "Customers",
    ) as HTMLButtonElement | undefined;
    expect(destinationButton).toBeTruthy();

    act(() => {
      destinationButton?.click();
    });

    expect(mockPush).toHaveBeenCalledWith("/customers");
    expect(container.querySelector('[data-testid="mobile-office-menu"]')).toBeNull();
  });
});
