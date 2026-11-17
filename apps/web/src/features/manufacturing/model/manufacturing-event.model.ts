import { toOrderActivityActionLabel } from "@template/contracts";
import type {
  ManufacturingCommandOperation,
  ManufacturingActivityEvent,
} from "@template/contracts";

export const toManufacturingOperationLabel = (
  operation: ManufacturingCommandOperation,
): string => toOrderActivityActionLabel({ kind: "manufacturing", operation });
export const toManufacturingEventSummary = (
  event: ManufacturingActivityEvent,
): string =>
  `${toManufacturingOperationLabel(event.operation)} — ${String(event.pieces.length)} قطعة — ${event.department === "CUTTING" ? "القص" : "الإنتاج والإصلاح"}${event.destination ? ` ← ${event.destination === "QUALITY" ? "الجودة والتغليف" : "الإنتاج والإصلاح"}` : ""} — ${event.actor.fullName}`;
