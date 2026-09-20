import type { ReactNode } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { MvpStoreProvider } from "@/features/prototype/state/mvp-store";

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={["ADMIN"]}>
      <MvpStoreProvider>{children}</MvpStoreProvider>
    </ProtectedRoute>
  );
}
