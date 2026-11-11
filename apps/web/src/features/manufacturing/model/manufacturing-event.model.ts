import type {
  ManufacturingCommandOperation,
  ManufacturingActivityEvent,
} from "@template/contracts";

const operationLabels: Record<ManufacturingCommandOperation, string> = {
  RECEIVE_AND_START: "استلام وبدء العمل",
  CONTINUE: "متابعة العمل",
  COMPLETE_TRANSFER: "إتمام وتحويل العمل",
};
export const toManufacturingOperationLabel = (
  operation: ManufacturingCommandOperation,
): string => operationLabels[operation];
export const toManufacturingEventSummary = (
  event: ManufacturingActivityEvent,
): string =>
  `${toManufacturingOperationLabel(event.operation)} — ${String(event.pieces.length)} قطعة — ${event.department === "CUTTING" ? "القص" : "الإنتاج والإصلاح"}${event.destination ? ` ← ${event.destination === "QUALITY" ? "الجودة والتغليف" : "الإنتاج والإصلاح"}` : ""} — ${event.actor.fullName}`;
