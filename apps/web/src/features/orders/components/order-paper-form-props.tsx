"use client";
import type {
  CatalogField,
  PieceCatalogSelections,
  SalesOrderDto,
} from "@template/contracts";

import type {
  MvpOrder,
  ProductLine,
} from "@/features/prototype/state/mvp-store";
import type { OrderAdjustmentFields } from "../adjustment-fields";
import type { OrderPaperMode } from "./order-paper-mode";

export type PaperApprovalAnnotation = Readonly<{
  initialActorName: string;
  initialApprovedAt: string;
  orderVersion: number;
  approvedAmendmentCount: number;
}>;

export type PaperCatalogOption = Readonly<{
  value: string;
  label: string;
  groupKey: string | null;
  groupLabel: string | null;
}>;
export type CatalogSelectionChange = Readonly<{
  displayValue: string;
  entryId: string | null;
}>;
export type PaperPieceEdit = Readonly<{
  pieceId: string;
  fields: readonly (keyof ProductLine)[];
  onTextChange?: (field: keyof ProductLine, value: string) => void;
  restoreSole?: (() => void) | undefined;
}>;
export function canEditPieceField(
  edit: PaperPieceEdit | undefined,
  pieceId: string,
  field: keyof ProductLine,
) {
  return edit?.pieceId === pieceId && edit.fields.some((key) => key === field);
}
export function isRequiredPieceField(field: keyof ProductLine) {
  return ["model", "size", "leatherBase", "decoration"].includes(field);
}
export type PaperCatalogOptions = Readonly<
  Record<CatalogField, readonly PaperCatalogOption[]>
>;

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
export type OrderPaperDataState =
  | Readonly<{
      kind: "draft";
      pricing: "unavailable";
      catalogOptions: DraftPaperOptions;
    }>
  | Readonly<{
      kind: "authoritative";
      catalogSourceId: string | null;
      catalogOptions: PaperCatalogOptions;
      selectionsByPiece: Readonly<
        Record<string, PieceCatalogSelections | undefined>
      >;
      lockedCatalogFields: readonly CatalogField[];
      finance:
        | {
            kind: "unavailable";
            piecePrices: Readonly<Record<string, string | null>>;
            total: null;
          }
        | {
            kind: "quote";
            piecePrices: Readonly<Record<string, string>>;
            total: string;
          }
        | {
            kind: "submitted";
            piecePrices: Readonly<Record<string, string>>;
            money: SalesOrderDto["money"];
          };
    }>;
export type OrderPaperFormProps = {
  pieceEdit?: PaperPieceEdit | undefined;
  measurementPiece?: Readonly<{
    id: string;
    onChange: (id: string) => void;
  }>;
  paidEdit?:
    | {
        value: string;
        pending: boolean;
        error: string | null;
        onChange: (value: string) => void;
        onSave: () => void;
        onCancel: () => void;
      }
    | undefined;
  displayReference?: string | undefined;
  approvalAnnotation?: PaperApprovalAnnotation | undefined;
  onCatalogSelection?:
    | ((
        pieceId: string,
        field: CatalogField,
        selection: CatalogSelectionChange,
      ) => void)
    | undefined;
  dataState?: OrderPaperDataState | undefined;
  showCatalogUnavailableNotice?: boolean | undefined;
  showInteractionHint?: boolean | undefined;
  fieldErrorMessages?: Readonly<Record<string, string>> | undefined;
  onFieldElement?:
    | ((
        pieceId: string,
        field: keyof ProductLine,
        element: HTMLElement | null,
      ) => void)
    | undefined;

  order: Pick<
    MvpOrder,
    | "id"
    | "type"
    | "items"
    | "customer"
    | "phone"
    | "created"
    | "hijriDate"
    | "delivery"
    | "responsibleSignature"
    | "generalNotes"
    | "adjustmentRequested"
    | "adjustmentReason"
    | "adjustmentActionTaken"
    | "selectedBoxes"
    | "total"
    | "paid"
    | "balance"
  >;
  mode?: OrderPaperMode | undefined;
  lines?: ProductLine[] | undefined;
  onLinesChange?: (lines: ProductLine[]) => void;
  invalidCells?: Set<string> | undefined;
  showZoomControls?: boolean | undefined;
  audience?: "standard" | "factory";
  onDuplicatePiece?: ((lineId: string) => void) | undefined;
  onDeletePiece?: ((lineId: string) => void) | undefined;
  onAddPiece?: () => void;
  selectedBoxes?: string[] | undefined;
  onSelectedBoxesChange?: ((boxes: string[]) => void) | undefined;
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
