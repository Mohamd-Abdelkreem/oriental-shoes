import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MvpStoreProvider } from "@/features/prototype/state/mvp-store";

import { WorkspaceShell } from "./workspace-shell";

const mocks = vi.hoisted(() => ({
  getApiError: vi.fn(),
  isPending: false,
  mutate: vi.fn(),
  push: vi.fn(),
  role: "ADMIN",
  replaceWithLogin: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/dashboard",
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/components/auth/session-loader", () => ({
  SessionLoader: () => <div>Loading session</div>,
}));
vi.mock("@/features/auth/hooks/auth.hooks", () => ({
  useLogout: () => ({
    isPending: mocks.isPending,
    mutate: mocks.mutate,
  }),
  useSession: () => ({
    data: {
      user: { fullName: "Oriental Shoes Admin", role: mocks.role },
    },
  }),
}));
vi.mock("@/features/auth/utils/session-navigation", () => ({
  replaceWithLogin: mocks.replaceWithLogin,
}));
vi.mock("@/services/api/api-client", () => ({
  getApiError: mocks.getApiError,
}));

describe("WorkspaceShell session control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApiError.mockReturnValue({ message: "Logout failed." });
    mocks.isPending = false;
    mocks.role = "ADMIN";
  });

  it("replaces the page with login only after server logout succeeds", () => {
    render(
      <MvpStoreProvider>
        <WorkspaceShell>
          <main>Workspace</main>
        </WorkspaceShell>
      </MvpStoreProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c",
      }),
    );
    const options = mocks.mutate.mock.calls[0]?.[1] as
      | { onError?: (error: unknown) => void; onSuccess?: () => void }
      | undefined;
    act(() => {
      options?.onSuccess?.();
    });
    expect(mocks.replaceWithLogin).toHaveBeenCalledOnce();
  });

  it("shows an actionable failure without navigating and permits retry", () => {
    render(
      <MvpStoreProvider>
        <WorkspaceShell>
          <main>Workspace</main>
        </WorkspaceShell>
      </MvpStoreProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c",
      }),
    );
    const options = mocks.mutate.mock.calls[0]?.[1] as
      | { onError?: (error: unknown) => void; onSuccess?: () => void }
      | undefined;
    act(() => {
      options?.onError?.(new Error("network"));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Server sign-out could not be confirmed",
    );
    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c",
      }),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });

  it("lets an admin open every department from the project header", () => {
    render(
      <MvpStoreProvider>
        <WorkspaceShell>
          <main>Workspace</main>
        </WorkspaceShell>
      </MvpStoreProvider>,
    );

    const sectionPicker = screen.getByRole("combobox", {
      name: "\u0627\u0644\u0627\u0646\u062a\u0642\u0627\u0644 \u0625\u0644\u0649 \u0642\u0633\u0645",
    });
    expect(screen.getAllByRole("option")).toHaveLength(8);
    fireEvent.change(sectionPicker, { target: { value: "quality" } });
    expect(mocks.push).toHaveBeenCalledWith("/quality/dashboard");
  });

  it("shows the department picker only to an admin account", () => {
    mocks.role = "USER";
    render(
      <MvpStoreProvider>
        <WorkspaceShell>
          <main>Workspace</main>
        </WorkspaceShell>
      </MvpStoreProvider>,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("derives the disabled loading state from the mutation", () => {
    mocks.isPending = true;
    render(
      <MvpStoreProvider>
        <WorkspaceShell>
          <main>Workspace</main>
        </WorkspaceShell>
      </MvpStoreProvider>,
    );

    expect(
      screen.getByRole("button", {
        name: "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c",
      }),
    ).toBeDisabled();
  });
});
