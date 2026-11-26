import {
  formatDraftReference,
  salesBusinessNumberSchema,
} from "@template/contracts";
import { formatPieceSequence } from "../paper/paper-options";

export function toLegacyOrderReference(reference: string): string | undefined {
  const submitted = salesBusinessNumberSchema.safeParse(reference);
  if (submitted.success) return submitted.data;
  if (/^DRAFT-[0-9A-F]{3,19}$/iu.test(reference)) return reference;
  return undefined;
}

export function toOrderDisplayReference(
  resource:
    | { kind: "submitted"; order: { businessNumber: string } }
    | {
        kind: "draft";
        draft: { id: string; draftSequence?: string | undefined };
      },
): string {
  return resource.kind === "submitted"
    ? resource.order.businessNumber
    : formatDraftReference(resource.draft.id, resource.draft.draftSequence);
}

export type OrderPieceLabels = ReadonlyMap<string, string>;

export function toOrderPieceLabels(
  pieces: readonly { id: string; position: number }[],
): OrderPieceLabels {
  return new Map(
    pieces.map((piece) => [piece.id, formatPieceSequence(piece.position - 1)]),
  );
}

export function describeOrderPieces(
  ids: readonly string[],
  labels?: OrderPieceLabels,
): string {
  const names = ids.map((id) => labels?.get(id));
  return ids.length > 0 && names.every((name) => name !== undefined)
    ? names.join("، ")
    : `${String(ids.length)} قطعة`;
}
