import { vi } from "vitest";

export const supabaseAuthMock = { getUser: vi.fn() };
export const supabaseClientMock = { auth: supabaseAuthMock };
export const mockCreateServerClient = vi.fn(() => supabaseClientMock);

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => mockCreateServerClient(),
}));

export const mockGetCurrentWorkspace = vi.fn();
vi.mock("@/lib/domain/workspaces", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/workspaces")>(
    "@/lib/domain/workspaces",
  );
  return {
    ...actual,
    getCurrentWorkspace: () => mockGetCurrentWorkspace(),
  };
});

export function resetAppShellMocks() {
  mockCreateServerClient.mockReset();
  mockCreateServerClient.mockReturnValue(supabaseClientMock);
  supabaseAuthMock.getUser.mockReset();
  mockGetCurrentWorkspace.mockReset();
}

export function isMobileRoute(route: string): boolean {
  return route === "/m" || route.startsWith("/m/");
}

export function isDesktopShellRequiredRoute(route: string): boolean {
  return !isMobileRoute(route);
}

export const confusingDesktopRoutes: string[] = ["/mobile", "/migrate", "/marketing"];
