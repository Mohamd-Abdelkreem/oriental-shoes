import {
  customerCommandDataSchema,
  draftCommandDataSchema,
  type SalesCommandData,
} from "@template/contracts";
import type { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";

export const SALES_COMMAND_SELECT = {
  commandId: true,
  operation: true,
  actorId: true,
  actorFullName: true,
  actorRole: true,
  actorDepartment: true,
  requestTargetId: true,
  customerId: true,
  draftId: true,
  expectedVersion: true,
  beforeVersion: true,
  afterVersion: true,
  payloadHash: true,
  before: true,
  after: true,
  occurredAt: true,
} as const satisfies Prisma.SalesCommandSelect;
export type SalesCommandRecord = Prisma.SalesCommandGetPayload<{
  select: typeof SALES_COMMAND_SELECT;
}>;
export const mapSalesCommandResult = (
  record: SalesCommandRecord,
  replayed: boolean,
): SalesCommandData => {
  const customer =
    record.operation === "CREATE_CUSTOMER" ||
    record.operation === "UPDATE_CUSTOMER";
  const resourceId = customer ? record.customerId : record.draftId;
  if (resourceId === null)
    throw new InternalServerError(
      "A retained command has an invalid resource.",
    );
  const receipt = {
    commandId: record.commandId,
    operation: record.operation,
    resourceId,
    actor: {
      id: record.actorId,
      fullName: record.actorFullName,
      role: record.actorRole,
      department: record.actorDepartment,
    },
    beforeVersion: record.beforeVersion,
    afterVersion: record.afterVersion,
    occurredAt: record.occurredAt.toISOString(),
  };
  if (customer) {
    const parsed = customerCommandDataSchema.safeParse({
      kind: "customer",
      receipt,
      replayed,
      savedCustomer: record.after,
    });
    if (!parsed.success)
      throw new InternalServerError(
        "A retained customer command has an invalid result.",
      );
    return parsed.data;
  }
  const parsed = draftCommandDataSchema.safeParse({
    kind: "draft",
    receipt,
    replayed,
    savedDraft: record.after,
  });
  if (!parsed.success)
    throw new InternalServerError(
      "A retained draft command has an invalid result.",
    );
  return parsed.data;
};
