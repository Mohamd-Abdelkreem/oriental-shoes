"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/protected-route";

export function PrintAccessBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const orderFamily =
    /^\/orders\/[^/]+\/print$/u.test(pathname) ||
    /^\/print\/order\/[^/]+$/u.test(pathname);
  return orderFamily ? (
    <ProtectedRoute>{children}</ProtectedRoute>
  ) : (
    <ProtectedRoute allowedRoles={["ADMIN"]}>{children}</ProtectedRoute>
  );
}
