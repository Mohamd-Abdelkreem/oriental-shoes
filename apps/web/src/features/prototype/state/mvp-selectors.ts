import type { Role } from "@/features/prototype/fixtures/prototype-data";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import type {
  Stage,
  QuantitySegment,
  MvpOrder,
  ProductLine,
} from "./mvp-types";
import type { Snapshot } from "./mvp-provider";
import {
  seedOrders,
  seedEmployees,
  seedCustomers,
  seedEvents,
} from "./mvp-fixtures";

export const makeSegment = (
  id: string,
  itemId: string,
  stage: Stage,
  quantity: number,
  state: string,
  note?: string,
  source?: string,
  cycle?: number,
  worker?: string,
  startedAt?: string,
  completedAt?: string,
): QuantitySegment => ({
  id,
  itemId,
  stage,
  quantity,
  state,
  note,
  source,
  cycle,
  worker,
  startedAt,
  completedAt,
});

export const initialSnapshot = (): Snapshot => ({
  orders: structuredClone(seedOrders),
  employees: structuredClone(seedEmployees),
  customers: structuredClone(seedCustomers),
  events: structuredClone(seedEvents),
  sessionRole: "admin", // Default to admin for seamless browsing, switcher in /prototype-preview
});

export const storageKey = "oriental-shoes-mvp-v10-per-piece";

export const typeLabels = {
  SHOP: "طلب معرض",
  EXTERNAL: "طلب مبيعات خارجية",
  REPAIR: "طلب إصلاح",
} as const;

export const roleLabels: Record<Role, string> = {
  admin: "الإدارة",
  sales: "المبيعات",
  approval: "الاعتماد",
  cutting: "القص",
  production: "الإنتاج والإصلاح",
  special: "العمليات الخاصة",
  quality: "الجودة والتغليف",
  warehouse: "المستودع والتسليم",
};

export function activePieces(order: MvpOrder): ProductLine[] {
  return order.items.filter((p) => !p.isDeleted);
}

export function totalQuantity(order: MvpOrder): number {
  return activePieces(order).length;
}

export function requiredQuantity(order: MvpOrder): number {
  return Math.max(0, activePieces(order).length - (order.cancelled || 0));
}

export function completedPieces(order: MvpOrder): ProductLine[] {
  return activePieces(order).filter(
    (p) =>
      p.currentLocation === "في المستودع" ||
      p.currentLocation === "تم الاستلام",
  );
}

export function problemPieces(order: MvpOrder): ProductLine[] {
  return activePieces(order).filter(
    (p) =>
      p.currentLocation === "لدى الاعتماد بسبب مشكلة" ||
      p.deptStatus === "بها مشكلة" ||
      p.deptStatus === "مرتجعة للتصحيح",
  );
}

export function piecesInStage(order: MvpOrder, stage: string): ProductLine[] {
  return activePieces(order).filter((p) => {
    if (stage === "القص" || stage === "قسم القص")
      return p.currentLocation === "في القص";
    if (
      stage === "الإنتاج والإصلاح" ||
      stage === "قسم الإنتاج والإصلاح" ||
      stage === "الإنتاج"
    )
      return p.currentLocation === "في الإنتاج";
    if (stage === "العمليات الخاصة" || stage === "قسم العمليات الخاصة")
      return p.currentLocation === "في العمليات الخاصة";
    if (
      stage === "الجودة والتغليف" ||
      stage === "قسم الجودة والتغليف" ||
      stage === "الجودة"
    )
      return p.currentLocation === "في الجودة";
    if (stage === "المستودع" || stage === "قسم المستودع")
      return p.currentLocation === "في المستودع";
    if (stage === "مع المندوب") return p.currentLocation === "مع المندوب";
    if (stage === "تم الاستلام") return p.currentLocation === "تم الاستلام";
    return false;
  });
}

export function stageQuantity(order: MvpOrder, stage: Stage): number {
  const inStagePieces = piecesInStage(order, stage);
  if (inStagePieces.length > 0) return inStagePieces.length;
  return order.segments
    .filter((seg) => seg.stage === stage)
    .reduce((sum, seg) => sum + seg.quantity, 0);
}

export function completionPercentage(order: MvpOrder): number {
  const req = requiredQuantity(order);
  if (req === 0) return 0;
  return Math.min(100, Math.round((order.warehouse / req) * 100));
}

export function formatPieceCount(n: number): string {
  if (n === 0) return "لا توجد قطع";
  if (n === 1) return "قطعة واحدة";
  if (n === 2) return "قطعتان";
  if (n >= 3 && n <= 10) return `${String(n)} قطع`;
  return `${String(n)} قطعة`;
}

export function formatOrderPieceProgress(order: MvpOrder): string {
  const total = activePieces(order).length;
  const done = completedPieces(order).length;
  return `اكتملت ${String(done)} من ${String(total)} قطع`;
}

export function getCustomerSizeProfile(
  phone: string,
  orders: MvpOrder[],
): {
  mostRecentSize: string;
  latestSize: string;
  allSizes: string[];
  history: {
    orderId: string;
    orderDate: string;
    pieceNumber: string;
    model: string;
    size: string;
  }[];
} {
  const customerOrders = orders.filter((o) => o.phone === phone);
  const sizeSet = new Set<string>();
  const history: {
    orderId: string;
    orderDate: string;
    pieceNumber: string;
    model: string;
    size: string;
  }[] = [];
  let mostRecentSize = "٤٢";

  for (const o of customerOrders) {
    for (let i = 0; i < o.items.length; i++) {
      const item = o.items[i];
      if (!item) continue;
      if (item.size && !item.isDeleted) {
        sizeSet.add(item.size);
        mostRecentSize = item.size;
        history.push({
          orderId: o.id,
          orderDate: o.created,
          pieceNumber: item.pieceNumber || formatPieceSequence(i),
          model: item.model || "شرقي ملكي",
          size: item.size,
        });
      }
    }
  }

  return {
    mostRecentSize,
    latestSize: mostRecentSize,
    allSizes: Array.from(sizeSet),
    history,
  };
}

export function formatDeptArrivalSummary(
  order: MvpOrder,
  deptStage: string,
): {
  total: number;
  arrived: number;
  notArrived: number;
  withProblem: number;
} {
  const total = activePieces(order).length;
  const inDept = piecesInStage(order, deptStage).length;
  const problems = problemPieces(order).length;
  const notArrived = Math.max(0, total - inDept - problems);
  return { total, arrived: inDept, notArrived, withProblem: problems };
}

export function formatOrderCount(n: number): string {
  if (n === 0) return "لا توجد أوامر";
  if (n === 1) return "أمر تفصيل واحد";
  if (n === 2) return "أمران تفصيل";
  if (n >= 3 && n <= 10) return `${String(n)} أوامر تفصيل`;
  return `${String(n)} أمر تفصيل`;
}

export function formatItemCount(n: number): string {
  return formatPieceCount(n);
}

export function formatProductCount(n: number): string {
  return formatPieceCount(n);
}

export function formatSegmentCount(n: number): string {
  return formatPieceCount(n);
}
