import type { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";

export const CATALOG_ENTRY_SELECT = {
  id: true,
  sourceId: true,
  kind: true,
  sourceCell: true,
  displayValue: true,
  familyCell: true,
  familyLabel: true,
  position: true,
  unitPrice: true,
  priceSourceCell: true,
} satisfies Prisma.CatalogEntrySelect;
export type CatalogEntryRecord = Prisma.CatalogEntryGetPayload<{
  select: typeof CATALOG_ENTRY_SELECT;
}>;
export const readActiveCatalog = async (tx: Prisma.TransactionClient) => {
  const activation = await tx.catalogActivation.findUnique({
    where: { id: "active" },
    select: {
      activatedAt: true,
      source: { select: { id: true, sha256: true } },
    },
  });
  if (activation?.source === null || activation === null) return null;
  const entries = await tx.catalogEntry.findMany({
    where: { sourceId: activation.source.id },
    select: CATALOG_ENTRY_SELECT,
    orderBy: [
      { kind: "asc" },
      { familyCell: "asc" },
      { position: "asc" },
      { id: "asc" },
    ],
    take: 1875,
  });
  if (entries.length !== 1874 || activation.activatedAt === null)
    throw new InternalServerError("The active catalog is incomplete.");
  return {
    sourceId: activation.source.id,
    sourceSha256: activation.source.sha256,
    activatedAt: activation.activatedAt,
    entries,
  };
};
export type ActiveCatalog = NonNullable<
  Awaited<ReturnType<typeof readActiveCatalog>>
>;

export const lockActiveCatalog = async (tx: Prisma.TransactionClient) => {
  await tx.$queryRaw`SELECT id FROM catalog_activation WHERE id='active' FOR SHARE`;
  return readActiveCatalog(tx);
};
