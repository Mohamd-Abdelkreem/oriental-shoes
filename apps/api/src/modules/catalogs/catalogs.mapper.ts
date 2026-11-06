import {
  catalogDataSchema,
  catalogEntrySchema,
  type CatalogData,
} from "@template/contracts";
import type { ActiveCatalog } from "./catalogs.queries.js";

export const mapCatalog = (active: ActiveCatalog | null): CatalogData =>
  active === null
    ? { availability: "unavailable", reason: "CATALOG_NOT_LOADED" }
    : catalogDataSchema.parse({
        availability: "available",
        sourceId: active.sourceId,
        sourceSha256: active.sourceSha256,
        activatedAt: active.activatedAt.toISOString(),
        entries: active.entries.map((entry) =>
          catalogEntrySchema.parse({
            id: entry.id,
            kind: entry.kind,
            sourceCell: entry.sourceCell,
            displayValue: entry.displayValue,
            position: entry.position,
            family:
              entry.familyCell === null
                ? null
                : {
                    key: entry.familyCell.replace(/2$/u, ""),
                    label: entry.familyLabel,
                  },
          }),
        ),
      });
