import type { ReactNode } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { MvpStoreProvider } from "@/features/prototype/state/mvp-store";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <MvpStoreProvider>
        <WorkspaceShell>{children}</WorkspaceShell>
      </MvpStoreProvider>
    </ProtectedRoute>
  );
}
