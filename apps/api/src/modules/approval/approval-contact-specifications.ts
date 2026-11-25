import {
  contactCatalogFields,
  contactCoreFields,
  contactExtraCatalogFields,
  contactSpecificationsSchema,
  contactTextFields,
  contactValuesSchema,
  type ContactChanges,
  type ContactSpecifications,
  type ContactValues,
} from "@template/contracts";
import type { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ValidationException } from "../../core/errors/validation.error.js";
import {
  lockActiveCatalog,
  type ActiveCatalog,
} from "../catalogs/catalogs.queries.js";
import { resolveCatalogSelection } from "../catalogs/catalogs.rules.js";
import { OrderCatalogUnavailableError } from "../sales-orders/sales-orders.errors.js";
import type { ApprovalOrderRecord } from "./approval.types.js";

type Piece = Pick<
  ApprovalOrderRecord["pieces"][number],
  | (typeof contactCatalogFields)[number]
  | (typeof contactTextFields)[number]
  | "paperCodes"
  | "catalogSelections"
>;
const capturedContactSchema = contactValuesSchema.safeExtend({
  specifications: contactSpecificationsSchema,
});
type CurrentContactValues = ContactValues & {
  specifications: ContactSpecifications;
};

export function captureContactValues(piece: Piece): CurrentContactValues {
  const refs = Object.fromEntries(
    piece.catalogSelections.map(({ field, entryId }) => [field, entryId]),
  );
  const captured = capturedContactSchema.safeParse({
    model: piece.model,
    size: piece.size,
    leatherBase: piece.leatherBase,
    sole: piece.sole,
    catalogSelections: Object.fromEntries(
      contactCoreFields.map((field) => [field, refs[field] ?? null]),
    ),
    specifications: {
      decoration: piece.decoration,
      decorationColor: piece.decorationColor,
      soleAddition: piece.soleAddition,
      soleColor: piece.soleColor,
      aField: piece.aField,
      fField: piece.fField,
      faceRight: piece.faceRight,
      faceLeft: piece.faceLeft,
      mixing: piece.mixing,
      face: piece.face,
      additions: piece.additions,
      sideNotes: piece.sideNotes,
      paperCodes: piece.paperCodes,
      catalogSelections: Object.fromEntries(
        contactExtraCatalogFields.map((field) => [field, refs[field] ?? null]),
      ),
    },
  });
  if (!captured.success)
    throw new InternalServerError(
      "Retained contact specifications are inconsistent.",
    );
  return captured.data;
}

export async function proposeContactValues(
  tx: Prisma.TransactionClient,
  before: CurrentContactValues,
  changes: ContactChanges,
): Promise<CurrentContactValues> {
  const active = contactCatalogFields.some((field) => changes[field] != null)
    ? await lockActiveCatalog(tx)
    : null;
  return resolveContactChanges(before, changes, active, "body.changes");
}

export function resolveContactChanges(
  before: CurrentContactValues,
  changes: ContactChanges,
  active: ActiveCatalog | null,
  fieldPath: string,
): CurrentContactValues {
  const fields = contactCatalogFields.filter(
    (field) => changes[field] !== undefined,
  );
  const requiresCatalog = fields.some((field) => changes[field] !== null);
  if (requiresCatalog && active === null)
    throw new OrderCatalogUnavailableError();
  const proposed = {
    ...before,
    catalogSelections: { ...before.catalogSelections },
    specifications: {
      ...before.specifications,
      catalogSelections: { ...before.specifications.catalogSelections },
    },
  };
  for (const field of fields) {
    const id = changes[field];
    const entry = active?.entries.find((row) => row.id === id);
    const resolved =
      entry && active
        ? resolveCatalogSelection(active.entries, active.sourceId, {
            kind: field,
            display: entry.displayValue,
            entryId: entry.id,
          })
        : null;
    if (id !== null && resolved?.status !== "resolved")
      throw new ValidationException([
        {
          field: `${fieldPath}.${field}`,
          message: "Select a matching entry from the active catalog.",
        },
      ]);
    const label =
      resolved?.status === "resolved" ? resolved.entry.displayValue : null;
    if (
      field === "model" ||
      field === "size" ||
      field === "leatherBase" ||
      field === "decoration"
    ) {
      if (label === null || id == null)
        throw new InternalServerError("A required contact selection is empty.");
      if (field === "decoration") {
        proposed.specifications.decoration = label;
        proposed.specifications.catalogSelections.decoration = id;
      } else {
        proposed[field] = label;
        proposed.catalogSelections[field] = id;
      }
    } else if (field === "sole") {
      proposed.sole = label;
      proposed.catalogSelections.sole = id ?? null;
    } else {
      proposed.specifications[field] = label;
      proposed.specifications.catalogSelections[field] = id ?? null;
    }
  }
  for (const field of contactTextFields) {
    const value = changes[field];
    if (value !== undefined) proposed.specifications[field] = value;
  }
  if (changes.paperCodes !== undefined)
    proposed.specifications.paperCodes = changes.paperCodes;
  return proposed;
}

export function matchesContactBase(
  current: CurrentContactValues,
  before: ContactValues,
): boolean {
  if (
    contactCoreFields.some(
      (field) =>
        current[field] !== before[field] ||
        current.catalogSelections[field] !== before.catalogSelections[field],
    )
  )
    return false;
  const previous = before.specifications;
  if (previous === undefined) return true;
  const next = current.specifications;
  return (
    contactTextFields.every((field) => next[field] === previous[field]) &&
    contactExtraCatalogFields.every(
      (field) =>
        next[field] === previous[field] &&
        next.catalogSelections[field] === previous.catalogSelections[field],
    ) &&
    next.paperCodes.join(",") === previous.paperCodes.join(",")
  );
}

export async function writeContactValues(
  tx: Prisma.TransactionClient,
  {
    pieceId,
    current,
    values,
    occurredAt,
  }: {
    pieceId: string;
    current: CurrentContactValues;
    values: ContactValues;
    occurredAt: Date;
  },
): Promise<void> {
  const { catalogSelections: extendedReferences, ...specifications } =
    values.specifications ?? {};
  await tx.salesDraftPiece.update({
    where: { id: pieceId },
    data: {
      ...specifications,
      model: values.model,
      size: values.size,
      leatherBase: values.leatherBase,
      sole: values.sole,
      updatedAt: occurredAt,
    },
  });
  const fields =
    extendedReferences === undefined
      ? contactCoreFields
      : [...contactCoreFields, ...contactExtraCatalogFields];
  const previous = {
    ...current.catalogSelections,
    ...current.specifications.catalogSelections,
  };
  const next = { ...values.catalogSelections, ...extendedReferences };
  for (const field of fields) {
    const entryId = next[field];
    if (entryId === previous[field] || entryId === undefined) continue;
    if (entryId === null) {
      await tx.salesPieceCatalogSelection.delete({
        where: { pieceId_field: { pieceId, field } },
      });
    } else if (previous[field] === null) {
      await tx.salesPieceCatalogSelection.create({
        data: { pieceId, field, entryId },
      });
    } else {
      await tx.salesPieceCatalogSelection.update({
        where: { pieceId_field: { pieceId, field } },
        data: { entryId },
      });
    }
  }
}
