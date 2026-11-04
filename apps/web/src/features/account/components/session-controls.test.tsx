import { act, fireEvent, render, screen } from "@testing-library/react";
import { CanceledError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SessionControls } from "./session-controls";

type MutateOptions = Readonly<{
  onError?: (error: unknown) => void;
  onSuccess?: () => void;
}>;

const mocks = vi.hoisted(() => ({
  getApiError: vi.fn(),
  isPending: false,
  mutate: vi.fn<(variables: undefined, options: MutateOptions) => void>(),
  replaceWithLogin: vi.fn(),
}));

vi.mock("@/features/auth/hooks/auth.hooks", () => ({
  useLogoutAll: () => ({
    isPending: mocks.isPending,
    mutate: mocks.mutate,
  }),
}));
vi.mock("@/features/auth/utils/session-navigation", () => ({
  replaceWithLogin: mocks.replaceWithLogin,
}));
vi.mock("@/services/api/api-client", () => ({
  getApiError: mocks.getApiError,
}));

const END_SESSIONS_LABEL = "End all sessions";

describe("SessionControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApiError.mockReturnValue({ message: "Logout failed." });
    mocks.isPending = false;
  });

  it("replaces the page with login only after server logout-all succeeds", () => {
    render(<SessionControls />);

    fireEvent.click(screen.getByRole("button", { name: END_SESSIONS_LABEL }));
    const options = mocks.mutate.mock.calls[0]?.[1];
    act(() => {
      options?.onSuccess?.();
    });
    expect(mocks.replaceWithLogin).toHaveBeenCalledOnce();
  });

  it("shows an actionable failure without navigating and permits retry", () => {
    render(<SessionControls />);

    fireEvent.click(screen.getByRole("button", { name: END_SESSIONS_LABEL }));
    const options = mocks.mutate.mock.calls[0]?.[1];
    act(() => {
      options?.onError?.(new Error("network"));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Revocation of sessions on your other devices could not be confirmed",
    );
    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: END_SESSIONS_LABEL }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });

  it("derives the disabled loading state from the mutation", () => {
    mocks.isPending = true;
    render(<SessionControls />);

    expect(
      screen.getByRole("button", { name: "Ending sessions…" }),
    ).toBeDisabled();
  });

  it("ignores a superseded completion without touching the current session", () => {
    render(<SessionControls />);

    fireEvent.click(screen.getByRole("button", { name: END_SESSIONS_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: END_SESSIONS_LABEL }));

    const superseded = mocks.mutate.mock.calls[0]?.[1];
    const current = mocks.mutate.mock.calls[1]?.[1];
    act(() => {
      superseded?.onSuccess?.();
    });

    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    act(() => {
      current?.onSuccess?.();
    });

    expect(mocks.replaceWithLogin).toHaveBeenCalledOnce();
  });

  it("reports no revocation failure for a cancelled completion", () => {
    render(<SessionControls />);

    fireEvent.click(screen.getByRole("button", { name: END_SESSIONS_LABEL }));
    const options = mocks.mutate.mock.calls[0]?.[1];
    act(() => {
      options?.onError?.(new CanceledError("superseded session scope"));
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.replaceWithLogin).not.toHaveBeenCalled();
  });

  it("does not promise that every issued access token disappears", () => {
    render(<SessionControls />);

    expect(
      screen.getByText(/Access tokens already issued stay valid/u),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Revoke the entire refresh-token family/u),
    ).not.toBeInTheDocument();
  });
});
