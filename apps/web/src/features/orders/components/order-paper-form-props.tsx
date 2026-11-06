"use client";

import type {
  MvpOrder,
  ProductLine,
} from "@/features/prototype/state/mvp-store";
import type { OrderAdjustmentFields } from "../adjustment-fields";
import type { OrderPaperMode } from "./order-paper-mode";

export type DraftPaperOptionKey =
  | "model"
  | "leatherBase"
  | "decoration"
  | "decorationColor"
  | "sole"
  | "soleAddition"
  | "soleColor"
  | "size";
export type DraftPaperOptions = Readonly<
  Record<DraftPaperOptionKey, readonly string[]>
>;
export type OrderPaperDataState = Readonly<{
  kind: "draft";
  pricing: "unavailable";
  catalogOptions: DraftPaperOptions;
}>;

export type OrderPaperFormProps = {
  dataState?: OrderPaperDataState | undefined;
  fieldErrorMessages?: Readonly<Record<string, string>> | undefined;
  onFieldElement?:
    | ((
        pieceId: string,
        field: keyof ProductLine,
        element: HTMLElement | null,
      ) => void)
    | undefined;

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
  onGeneralNotesChange?: (notes: string) => void;
  onSignatureChange?: (signature: string) => void;
  onTotalsChange?: (totals: {
    total: string | undefined;
    paid: string;
    balance: string;
  }) => void;
  onAdjustmentFieldsChange?:
    ((fields: OrderAdjustmentFields) => void) | undefined;
};
