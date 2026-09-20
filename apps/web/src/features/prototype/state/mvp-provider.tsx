"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { nowString } from "./mvp-time";
import { createIdentityAndOrderActions } from "./identity-and-order-actions";
import { createDepartmentSegmentActions } from "./department-segment-actions";
import { createWarehouseSegmentActions } from "./warehouse-segment-actions";
import { createApprovalActions } from "./approval-actions";
import { createPieceWorkflowActions } from "./piece-workflow-actions";
import { createPieceResolutionActions } from "./piece-resolution-actions";
import type { Role } from "@/features/prototype/fixtures/prototype-data";
import type {
  MvpOrder,
  MvpEmployee,
  MvpCustomer,
  LogEvent,
  Stage,
  PieceLocation,
  ProductLine,
} from "./mvp-types";
import { storageKey, initialSnapshot } from "./mvp-selectors";

export type Snapshot = {
  orders: MvpOrder[];
  employees: MvpEmployee[];
  customers: MvpCustomer[];
  events: LogEvent[];
  sessionRole: Role | null;
};

export type Store = Snapshot & {
  setRole: (role: Role | null) => void;
  reset: () => void;
  resetToDefault: () => void;
  addEmployee: (employee: MvpEmployee) => boolean;
  patchEmployee: (email: string, patch: Partial<MvpEmployee>) => void;
  addCustomer: (customer: MvpCustomer) => MvpCustomer | undefined;
  patchCustomer: (phone: string, patch: Partial<MvpCustomer>) => void;
  saveOrder: (order: MvpOrder, eventName: string, notes?: string) => void;
  patchOrder: (
    id: string,
    patch: Partial<MvpOrder>,
    event: Omit<LogEvent, "id" | "orderId" | "time">,
  ) => void;
  // Domain actions
  receiveAndStart: (
    orderId: string,
    segmentId: string,
    actor: string,
    role: string,
  ) => void;
  confirmReceipt: (
    orderId: string,
    segmentId: string,
    actor: string,
    role: string,
  ) => void;
  startWork: (
    orderId: string,
    segmentId: string,
    actor: string,
    role: string,
  ) => void;
  recordDepartmentCompletion: (
    orderId: string,
    segmentId: string,
    completedQty: number,
    actor: string,
    role: string,
  ) => void;
  transferCompleted: (
    orderId: string,
    segmentId: string,
    qty: number,
    nextStage: Stage,
    actor: string,
    role: string,
    note?: string,
  ) => void;
  routeProductionSplit: (
    orderId: string,
    segmentId: string,
    directQty: number,
    specialQty: number,
    specialInstruction: string,
    actor: string,
  ) => void;
  submitQualityInspection: (
    orderId: string,
    segmentId: string,
    data: {
      inspectedQty: number;
      acceptedQty: number;
      rejectedQty: number;
      responsibleDept?:
        "القص" | "الإنتاج والإصلاح" | "العمليات الخاصة" | undefined;
      reason?: string | undefined;
      instructions?: string | undefined;
      cartonCount?: string | undefined;
      cartonNumbers?: string | undefined;
      note?: string | undefined;
    },
    actor: string,
  ) => void;
  remedyCorrection: (
    orderId: string,
    segmentId: string,
    actor: string,
    role: string,
    note?: string,
  ) => void;
  sendCorrectedToQuality: (
    orderId: string,
    segmentId: string,
    actor: string,
    role: string,
  ) => void;
  confirmWarehouseReceipt: (
    orderId: string,
    segmentId: string,
    actor: string,
  ) => void;
  dispatchDelivery: (orderId: string, actor: string, repName?: string) => void;
  recordDeliveryFailed: (orderId: string, note: string, actor: string) => void;
  retryDelivery: (
    orderId: string,
    actor: string,
    newDate?: string,
    notes?: string,
  ) => void;
  confirmDelivered: (orderId: string, actor: string) => void;
  approveOrder: (orderId: string, actor: string) => void;
  returnOrderToSales: (orderId: string, reason: string, actor: string) => void;
  adminCancelQuantity: (
    orderId: string,
    cancelQty: number,
    reason: string,
    actor: string,
    itemId?: string,
  ) => void;
  adminReopenOrder: (orderId: string, reason: string, actor: string) => void;
  updateUserProfile: (
    role: Role,
    updates: { name?: string; phone?: string; password?: string },
  ) => void;
  // Per-piece workflow actions
  duplicatePiece: (orderId: string, pieceId: string) => void;
  addBlankPiece: (orderId: string) => void;
  deletePieceDraft: (orderId: string, pieceId: string) => void;
  startPieceWork: (
    orderId: string,
    pieceIds: string[],
    workerName: string,
    deptName: string,
  ) => void;
  completeAndTransferPieces: (
    orderId: string,
    pieceIds: string[],
    nextStage: string,
    note?: string,
  ) => void;
  reportPieceProblem: (
    orderId: string,
    pieceId: string,
    reason: string,
    notes: string,
    dept: string,
    worker: string,
  ) => void;
  resolveApprovalProblem: (
    orderId: string,
    pieceId: string,
    action: "return_to_dept" | "send_to_sales" | "delete",
    resolutionNotes: string,
    targetDept?: PieceLocation,
    actor?: string,
  ) => void;
  salesUpdateProblemPiece: (
    orderId: string,
    pieceId: string,
    updatedFields: Partial<ProductLine>,
    contactNotes: string,
    actor: string,
  ) => void;
  qualityInspectPiece: (
    orderId: string,
    pieceId: string,
    decision: "accept" | "reject",
    rejectionData?: {
      responsibleDept: "القص" | "الإنتاج والإصلاح" | "العمليات الخاصة";
      reason: string;
      notes: string;
    },
  ) => void;
  receiveWarehousePiece: (orderId: string, pieceId: string) => void;
  dispatchOrder: (orderId: string, courierName?: string) => void;
  confirmOrderDelivery: (orderId: string) => void;
};

export const StoreContext = createContext<Store | null>(null);

export function MvpStoreProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          return JSON.parse(saved) as Snapshot;
        }
      } catch {
        // ignore
      }
    }
    return initialSnapshot();
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch {
      // ignore
    }
  }, [snapshot]);

  const store = useMemo<Store>(() => {
    const addEvent = (
      orderId: string,
      event: string,
      actor: string,
      role: string,
      extra?: Partial<LogEvent>,
    ) => {
      const newEvent: LogEvent = {
        id: crypto.randomUUID(),
        orderId,
        event,
        actor,
        role,
        time: nowString(),
        ...extra,
      };
      return newEvent;
    };
    const context = { snapshot, setSnapshot, addEvent };
    return {
      ...snapshot,
      ...createIdentityAndOrderActions(context),
      ...createDepartmentSegmentActions(context),
      ...createWarehouseSegmentActions(context),
      ...createApprovalActions(context),
      ...createPieceWorkflowActions(context),
      ...createPieceResolutionActions(context),
    };
  }, [snapshot]);

  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}

export function useMvpStore() {
  const store = useContext(StoreContext);
  if (!store)
    throw new Error("useMvpStore must be used within MvpStoreProvider");
  return store;
}
