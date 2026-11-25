import {
  administrationCommandBodySchema,
  administrationCommandDataSchema,
  contactCoreFields,
  contactExtraCatalogFields,
  contactTextFields,
  type AdministrationCommandBody,
  type AdministrationCommandData,
  type AdministrationPaperCorrection,
  type AdministrationPaperValues,
  type ContactChanges,
} from "@template/contracts";
import { ApiContractError } from "@/services/api/api-client";

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
type PaperPiece = AdministrationPaperValues["pieces"][number];

const matchesPaperPiece = (
  before: PaperPiece,
  after: PaperPiece,
  changes: ContactChanges,
): boolean => {
  const expected = {
    ...before,
    catalogSelections: { ...before.catalogSelections },
    specifications: {
      ...before.specifications,
      catalogSelections: { ...before.specifications.catalogSelections },
    },
  };
  for (const field of contactCoreFields) {
    const ref = changes[field];
    if (ref === undefined) continue;
    expected.catalogSelections[field] = ref;
    if (field === "sole") expected.sole = ref === null ? null : after.sole;
    else expected[field] = after[field];
  }
  for (const field of contactExtraCatalogFields) {
    const ref = changes[field];
    if (ref === undefined) continue;
    expected.specifications.catalogSelections[field] = ref;
    if (field === "decoration")
      expected.specifications.decoration = after.specifications.decoration;
    else
      expected.specifications[field] =
        ref === null ? null : after.specifications[field];
  }
  for (const field of contactTextFields) {
    const text = changes[field];
    if (text !== undefined) expected.specifications[field] = text;
  }
  if (changes.paperCodes !== undefined)
    expected.specifications.paperCodes = changes.paperCodes;
  return same(expected, after);
};

const matchesPaperCorrection = (
  before: AdministrationPaperValues | undefined,
  after: AdministrationPaperValues | undefined,
  patch: AdministrationPaperCorrection | undefined,
): boolean => {
  if (!patch) return before === undefined && after === undefined;
  if (!before || !after) return false;
  const { pieces: requested = [], ...headers } = patch;
  const { pieces: priorPieces, ...priorHeaders } = before;
  const { pieces: revisedPieces, ...revisedHeaders } = after;
  const byPiece = new Map(
    requested.map(({ pieceId, changes }) => [pieceId, changes]),
  );
  return (
    same({ ...priorHeaders, ...headers }, revisedHeaders) &&
    requested.length === priorPieces.length &&
    priorPieces.length === revisedPieces.length &&
    priorPieces.every((prior, index) => {
      const revised = revisedPieces[index];
      const change = byPiece.get(prior.pieceId);
      return (
        revised !== undefined &&
        change !== undefined &&
        matchesPaperPiece(prior, revised, change)
      );
    })
  );
};
const validCancellationStatus = (saved: AdministrationCommandData): boolean => {
  const before = saved.before,
    after = saved.after;
  if (before.status === "OUT_FOR_DELIVERY" || before.status === "DELIVERED")
    return false;
  if (after.counts.active === 0) return after.status === "CANCELLED";
  if (
    before.status === "AWAITING_APPROVAL" ||
    before.status === "RETURNED" ||
    before.status === "DELIVERY_FAILED"
  )
    return after.status === before.status;
  if (after.status === "APPROVED") return true;
  return (
    after.status === "READY_FOR_DELIVERY" &&
    after.pieces
      .filter((piece) => piece.stage !== "CANCELLED")
      .every(
        (piece) =>
          piece.stage === "WAREHOUSE" &&
          piece.workState === "COMPLETED" &&
          piece.receivedAt !== null &&
          piece.issueId === null,
      )
  );
};
export const bindAdministrationCommandResult = (
  inputResult: AdministrationCommandData,
  inputBody: AdministrationCommandBody,
  actorId?: string,
): AdministrationCommandData => {
  const body = administrationCommandBodySchema.parse(inputBody),
    parsed = administrationCommandDataSchema.safeParse(inputResult);
  if (!parsed.success) throw new ApiContractError();
  const saved = parsed.data;
  if (
    saved.receipt.commandId !== body.commandId ||
    saved.receipt.operation !== body.operation ||
    saved.receipt.orderId !== body.orderId ||
    saved.result.orderId !== body.orderId ||
    saved.receipt.beforeVersion !== body.expectedVersion ||
    saved.receipt.afterVersion !== body.expectedVersion + 1 ||
    (actorId !== undefined && saved.receipt.actor.id !== actorId)
  )
    throw new ApiContractError();
  if (body.operation === "ADMIN_CANCEL") {
    const active = saved.before.pieces
      .filter((piece) => piece.stage !== "CANCELLED")
      .map((piece) => piece.id)
      .toSorted();
    if (
      !same(saved.result.pieceIds, body.pieceIds) ||
      (body.scope === "ORDER" && !same(active, body.pieceIds)) ||
      !validCancellationStatus(saved) ||
      (body.reason !== null &&
        saved.after.pieces.some(
          (piece) =>
            body.pieceIds.includes(piece.id) &&
            piece.cancellationReason !== body.reason,
        ))
    )
      throw new ApiContractError();
  } else {
    const { paper, ...contacts } = body.patch;
    const { paper: previousPaper, ...previousContacts } =
      saved.before.correction;
    const { paper: revisedPaper, ...revisedContacts } = saved.after.correction;
    if (
      !same(revisedContacts, { ...previousContacts, ...contacts }) ||
      !matchesPaperCorrection(previousPaper, revisedPaper, paper)
    )
      throw new ApiContractError();
  }
  return saved;
};
