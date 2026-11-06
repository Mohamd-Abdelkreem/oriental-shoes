import {
  catalogDataSchema,
  catalogQuoteBodySchema,
  catalogQuoteDataSchema,
  type CatalogData,
  type CatalogQuoteBody,
  type CatalogQuoteData,
} from "@template/contracts";
import { apiClient, parseApiResponse } from "@/services/api/api-client";

export const catalogsApi = {
  async get(signal?: AbortSignal): Promise<CatalogData> {
    const response = await apiClient.get("/catalogs", {
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, catalogDataSchema).data;
  },
  async quote(
    body: CatalogQuoteBody,
    signal?: AbortSignal,
  ): Promise<CatalogQuoteData> {
    const response = await apiClient.post(
      "/catalogs/quotes",
      catalogQuoteBodySchema.parse(body),
      { ...(signal === undefined ? {} : { signal }) },
    );
    const raw: unknown = response.data;
    return parseApiResponse(raw, catalogQuoteDataSchema).data;
  },
};
