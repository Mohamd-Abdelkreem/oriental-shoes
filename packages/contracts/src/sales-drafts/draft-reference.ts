import { z } from "zod";

const draftReferencePattern = /^DRAFT-([0-9A-F]{10})$/iu;
const legacyDraftReferencePattern = /^DRAFT-([0-9A-F]{8})-([0-9A-F]{8})$/iu;
const maximumDraftSequence = 9223372036854775807n;

export const draftSequenceSchema = z
  .string()
  .refine(
    (sequence) =>
      /^[1-9][0-9]{0,18}$/u.test(sequence) &&
      BigInt(sequence) <= maximumDraftSequence,
  );

export const parseDraftSequence = (reference: string): bigint | null => {
  const digits = /^DRAFT-([0-9]{1,19})$/iu.exec(reference.trim())?.[1];
  if (digits === undefined) return null;
  const parsed = draftSequenceSchema.safeParse(digits.replace(/^0+/u, ""));
  return parsed.success ? BigInt(parsed.data) : null;
};

export const formatDraftReference = (
  draftId: string,
  draftSequence?: string,
): string =>
  `DRAFT-${draftSequence?.padStart(3, "0") ?? draftId.slice(-10).toUpperCase()}`;

export const parseDraftReferenceSuffix = (reference: string): string | null => {
  const text = reference.trim();
  const shortSuffix = draftReferencePattern.exec(text)?.[1];
  if (shortSuffix !== undefined) return shortSuffix.toLowerCase();

  const legacy = legacyDraftReferencePattern.exec(text);
  if (legacy?.[1] === undefined || legacy[2] === undefined) return null;
  const suffix = `${legacy[1]}${legacy[2]}`.toLowerCase();
  return `${suffix.slice(0, 4)}-${suffix.slice(4)}`;
};
