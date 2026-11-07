"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { MvpStoreProvider } from "@/features/prototype/state/mvp-store";

export function PrintAccessBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const orderFamily =
    /^\/orders\/[^/]+\/print$/u.test(pathname) ||
    /^\/print\/order\/[^/]+$/u.test(pathname);
  return orderFamily ? (
    <ProtectedRoute>{children}</ProtectedRoute>
  ) : (
    <ProtectedRoute allowedRoles={["ADMIN"]}>
      <MvpStoreProvider>{children}</MvpStoreProvider>
    </ProtectedRoute>
  );
}
