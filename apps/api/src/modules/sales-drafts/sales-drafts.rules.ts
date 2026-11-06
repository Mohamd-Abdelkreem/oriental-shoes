export type DraftPieceIdentity = Readonly<{
  id: string;
  draftId: string;
  removedAt: Date | null;
}>;
export type DraftPiecePlan = Readonly<{
  retainedIds: string[];
  newIds: string[];
  removedIds: string[];
}>;
export type DraftPiecePlanResult =
  | { kind: "valid"; plan: DraftPiecePlan }
  | { kind: "foreign" }
  | { kind: "removed" }
  | { kind: "duplicate" };

export const classifyDraftPieces = (
  submittedIds: readonly string[],
  existing: readonly DraftPieceIdentity[],
  draftId: string,
): DraftPiecePlanResult => {
  const submitted = new Set(submittedIds);
  if (submitted.size !== submittedIds.length) return { kind: "duplicate" };
  const byId = new Map(existing.map((piece) => [piece.id, piece]));
  const retainedIds: string[] = [],
    newIds: string[] = [];
  for (const id of submittedIds) {
    const piece = byId.get(id);
    if (piece === undefined) {
      newIds.push(id);
      continue;
    }
    if (piece.draftId !== draftId) return { kind: "foreign" };
    if (piece.removedAt !== null) return { kind: "removed" };
    retainedIds.push(id);
  }
  const removedIds = existing
    .filter(
      (piece) =>
        piece.draftId === draftId &&
        piece.removedAt === null &&
        !submitted.has(piece.id),
    )
    .map((piece) => piece.id);
  return { kind: "valid", plan: { retainedIds, newIds, removedIds } };
};
