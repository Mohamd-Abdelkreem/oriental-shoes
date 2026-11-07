import type { ReactNode } from "react";
import { PrintAccessBoundary } from "@/features/printing/components/print-access-boundary";

export default function PrintLayout({ children }: { children: ReactNode }) {
  return <PrintAccessBoundary>{children}</PrintAccessBoundary>;
}
