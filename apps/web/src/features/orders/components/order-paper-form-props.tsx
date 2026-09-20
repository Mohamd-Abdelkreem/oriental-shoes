"use client";

import type {
  MvpOrder,
  ProductLine,
} from "@/features/prototype/state/mvp-store";
import type { OrderPaperMode } from "./order-paper-mode";

export type OrderPaperFormProps = {
  order: MvpOrder;
  mode?: OrderPaperMode | undefined;
  lines?: ProductLine[] | undefined;
  onLinesChange?: (lines: ProductLine[]) => void;
  invalidCells?: Set<string> | undefined;
  showZoomControls?: boolean | undefined;
  hideFinancials?: boolean | undefined;
  onDuplicatePiece?: ((lineId: string) => void) | undefined;
  onDeletePiece?: ((lineId: string) => void) | undefined;
  onAddPiece?: () => void;
  selectedBoxes?: string[] | undefined;
  onSelectedBoxesChange?: (boxes: string[]) => void;
  onTotalsChange?: (totals: {
    total: string | undefined;
    paid: string;
    balance: string;
  }) => void;
};
