import type {
  CustomerCapture,
  CustomerDto,
  CustomerPatch,
  DraftCapture,
  DraftDto,
} from "@template/contracts";
import type { Prisma } from "@template/database";
import type { AuthorityAccount } from "../auth/account-authority.js";

type ExecutionBinding = Readonly<{
  actorId: string;
  commandId: string;
  targetId: string | null;
  expectedVersion: number | null;
  payloadHash: string;
}>;
export type CustomerCommandExecution = ExecutionBinding &
  Readonly<{
    kind: "customer";
    operation: "CREATE_CUSTOMER" | "UPDATE_CUSTOMER";
    work(
      tx: Prisma.TransactionClient,
      actor: AuthorityAccount,
      occurredAt: Date,
    ): Promise<{ before: CustomerDto | null; after: CustomerDto }>;
  }>;
export type DraftCommandExecution = ExecutionBinding &
  Readonly<{
    kind: "draft";
    operation: "CREATE_DRAFT" | "SAVE_DRAFT";
    work(
      tx: Prisma.TransactionClient,
      actor: AuthorityAccount,
      occurredAt: Date,
    ): Promise<{ before: DraftDto | null; after: DraftDto }>;
  }>;
export type SalesCommandExecution =
  CustomerCommandExecution | DraftCommandExecution;
export type SalesCommandHashIntent =
  | Readonly<{
      operation: "CREATE_CUSTOMER";
      targetId: null;
      expectedVersion: null;
      payload: CustomerCapture;
    }>
  | Readonly<{
      operation: "UPDATE_CUSTOMER";
      targetId: string;
      expectedVersion: number;
      payload: CustomerPatch;
    }>
  | Readonly<{
      operation: "CREATE_DRAFT";
      targetId: null;
      expectedVersion: null;
      payload: DraftCapture;
    }>
  | Readonly<{
      operation: "SAVE_DRAFT";
      targetId: string;
      expectedVersion: number;
      payload: DraftCapture;
    }>;
