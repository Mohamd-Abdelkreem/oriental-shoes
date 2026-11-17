import {
  administrationActivityDataSchema,
  type AdministrationActivityData,
  type AdministrationActivityQuery,
  type AdministrationOrderHistoryQuery,
} from "@template/contracts";
import type { Prisma } from "@template/database";
import type { AuthorityAccount } from "../auth/account-authority.js";
import { findAdministrationOrderActivity } from "../sales-orders/order-activity.queries.js";
import { ForbiddenException } from "../../core/errors/forbidden.error.js";
import { OrderNotFoundError } from "../sales-orders/sales-orders.errors.js";

export const findAdministrationActivity = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: AdministrationActivityQuery | AdministrationOrderHistoryQuery,
  orderId?: string,
): Promise<AdministrationActivityData> => {
  if (actor.role !== "ADMIN") throw new ForbiddenException();
  const target = orderId ?? ("orderId" in query ? query.orderId : undefined);
  if (
    target !== undefined &&
    !(await tx.salesDraft.findUnique({
      where: { id: target },
      select: { id: true },
    }))
  )
    throw new OrderNotFoundError();
  const result = await findAdministrationOrderActivity(tx, actor, {
    query: { page: query.page, limit: query.limit },
    ...(target === undefined ? {} : { orderId: target }),
    ...("search" in query && query.search !== undefined
      ? { search: query.search }
      : {}),
  });
  return administrationActivityDataSchema.parse({
    ...result,
    context: orderId === undefined ? { query } : { orderId, query },
  });
};
