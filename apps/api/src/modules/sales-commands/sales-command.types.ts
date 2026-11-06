import type {
  CustomerCapture,
  CustomerDto,
  CustomerPatch,
  DraftCapture,
  DraftDto,
  SalesOrderDto,
  SubmitOrderBody,
  ResubmitOrderBody,
  SetOrderPaidBody,
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
export type OrderCommandExecution = ExecutionBinding &
  Readonly<{
    kind: "order";
    operation:
      "SUBMIT_NEW_ORDER" | "SUBMIT_DRAFT" | "RESUBMIT_ORDER" | "SET_ORDER_PAID";
    work(
      tx: Prisma.TransactionClient,
      actor: AuthorityAccount,
      occurredAt: Date,
    ): Promise<{
      before: DraftDto | SalesOrderDto | null;
      after: SalesOrderDto;
    }>;
  }>;
export type SalesCommandExecution =
  CustomerCommandExecution | DraftCommandExecution | OrderCommandExecution;
type OrderCommandHashIntent =
  | Readonly<{
      operation: "SUBMIT_NEW_ORDER" | "SUBMIT_DRAFT";
      targetId: string | null;
      expectedVersion: number | null;
      payload: SubmitOrderBody;
    }>
  | Readonly<{
      operation: "RESUBMIT_ORDER";
      targetId: string;
      expectedVersion: number;
      payload: ResubmitOrderBody;
    }>
  | Readonly<{
      operation: "SET_ORDER_PAID";
      targetId: string;
      expectedVersion: number;
      payload: SetOrderPaidBody;
    }>;
export type SalesCommandHashIntent =
  | OrderCommandHashIntent
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
