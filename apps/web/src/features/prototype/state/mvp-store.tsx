"use client";

export type {
  Role,
  DemoScenario,
} from "@/features/prototype/fixtures/prototype-data";
export { demoScenarios } from "@/features/prototype/fixtures/prototype-data";
export { formatPieceSequence } from "@/features/orders/paper/paper-options";

export type { Stage } from "./mvp-types";
export type { PieceLocation } from "./mvp-types";
export type { DeptWorkingStatus } from "./mvp-types";
export type { PieceProblem } from "./mvp-types";
export type { PieceRejection } from "./mvp-types";
export type { QuantitySegment } from "./mvp-types";
export type { ProductLine } from "./mvp-types";
export type { Carton } from "./mvp-types";
export type { DeliveryAttempt } from "./mvp-types";
export type { QualityCorrectionCycle } from "./mvp-types";
export type { MvpOrder } from "./mvp-types";
export type { MvpEmployee } from "./mvp-types";
export type { MvpCustomer } from "./mvp-types";
export type { LogEvent } from "./mvp-types";
export type { MvpEvent } from "./mvp-types";
export { makePiece } from "./mvp-fixtures";
export { makeLine } from "./mvp-fixtures";
export { makeSegment } from "./mvp-selectors";
export { demoCredentials } from "./mvp-fixtures";
export { seedOrders } from "./mvp-fixtures";
export { seedEmployees } from "./mvp-fixtures";
export { seedCustomers } from "./mvp-fixtures";
export { seedEvents } from "./mvp-fixtures";
export type { Store } from "./mvp-provider";
export { initialSnapshot } from "./mvp-selectors";
export { storageKey } from "./mvp-selectors";
export { MvpStoreProvider } from "./mvp-provider";
export { useMvpStore } from "./mvp-provider";
export { typeLabels } from "./mvp-selectors";
export { roleLabels } from "./mvp-selectors";
export { activePieces } from "./mvp-selectors";
export { totalQuantity } from "./mvp-selectors";
export { requiredQuantity } from "./mvp-selectors";
export { completedPieces } from "./mvp-selectors";
export { problemPieces } from "./mvp-selectors";
export { piecesInStage } from "./mvp-selectors";
export { stageQuantity } from "./mvp-selectors";
export { completionPercentage } from "./mvp-selectors";
export { formatPieceCount } from "./mvp-selectors";
export { formatOrderPieceProgress } from "./mvp-selectors";
export { getCustomerSizeProfile } from "./mvp-selectors";
export { formatDeptArrivalSummary } from "./mvp-selectors";
export { formatOrderCount } from "./mvp-selectors";
export { formatItemCount } from "./mvp-selectors";
export { formatProductCount } from "./mvp-selectors";
export { formatSegmentCount } from "./mvp-selectors";
