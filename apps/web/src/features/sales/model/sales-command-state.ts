import type {
  CreateCustomerBody,
  UpdateCustomerBody,
  CreateDraftBody,
  SaveDraftBody,
  SalesCommandData,
} from "@template/contracts";
import {
  ApiContractError,
  getApiError,
  type ApiError,
} from "@/services/api/api-client";
import type { OperationalScope } from "@/shared/query/operational-scope";

export type SalesCommandIntent =
  | Readonly<{ operation: "CREATE_CUSTOMER"; body: CreateCustomerBody }>
  | Readonly<{
      operation: "UPDATE_CUSTOMER";
      customerId: string;
      body: UpdateCustomerBody;
    }>
  | Readonly<{ operation: "CREATE_DRAFT"; body: CreateDraftBody }>
  | Readonly<{ operation: "SAVE_DRAFT"; draftId: string; body: SaveDraftBody }>;
export type SalesCommandVariables = Readonly<{
  scope: OperationalScope;
  command: SalesCommandIntent;
}>;
export class SalesSynchronizationError extends Error {
  constructor(
    readonly result: SalesCommandData,
    readonly syncError: ApiError | null,
  ) {
    super(
      "The operation was saved, but the current view could not be refreshed.",
    );
    this.name = "SalesSynchronizationError";
  }
}
export const isUnknownSalesWrite = (error: unknown): boolean => {
  if (error instanceof SalesSynchronizationError) return false;
  if (error instanceof ApiContractError) return true;
  const { statusCode } = getApiError(error);
  return statusCode === 0 || (statusCode >= 500 && statusCode <= 504);
};
