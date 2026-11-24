import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { ToastProvider } from "@/components/toast";

export function renderWithToast(
  ui: ReactElement,
  { wrapper: Wrapper, ...options }: RenderOptions = {},
) {
  function TestProviders({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        {Wrapper ? <Wrapper>{children}</Wrapper> : children}
      </ToastProvider>
    );
  }

  return render(ui, { ...options, wrapper: TestProviders });
}
