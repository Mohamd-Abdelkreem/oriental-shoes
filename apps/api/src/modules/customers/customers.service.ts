import {
  customerPhoneSchema,
  type CreateCustomerBody,
  type CustomerCommandData,
  type CustomerData,
  type CustomerDraftsData,
  type CustomerDraftsQuery,
  type CustomerListData,
  type CustomerListQuery,
  type CustomerMeasurementsData,
  type CustomerMeasurementsQuery,
  type UpdateCustomerBody,
} from "@template/contracts";
import { Department, Prisma, type DatabaseClient } from "@template/database";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import {
  type SalesCommandExecutor,
  hashSalesCommandIntent,
} from "../sales-commands/sales-command-executor.js";
import {
  isSalesLockTimeout,
  isSalesTransactionConflict,
  SalesTransactionConflictError,
} from "../sales-commands/sales-command.errors.js";
import {
  CustomerNotFoundError,
  CustomerPhoneConflictError,
  CustomerVersionConflictError,
  isCustomerPhoneConflict,
} from "./customers.errors.js";
import { CUSTOMER_SELECT, mapCustomer } from "./customers.mapper.js";
import {
  findCustomerData,
  findCustomerDraftPage,
  findCustomerMeasurements,
  findCustomerPage,
} from "./customers.queries.js";

export class CustomersService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly commands: SalesCommandExecutor,
  ) {}

  list(actorId: string, query: CustomerListQuery): Promise<CustomerListData> {
    return this.read(actorId, (tx, actor) =>
      findCustomerPage(tx, actor, query),
    );
  }
  get(actorId: string, customerId: string): Promise<CustomerData> {
    return this.read(actorId, async (tx, actor) => {
      const data = await findCustomerData(tx, actor, customerId);
      if (data === null) throw new CustomerNotFoundError();
      return data;
    });
  }
  getByPhone(actorId: string, phone: string): Promise<CustomerData> {
    const canonical = customerPhoneSchema.parse(phone);
    return this.read(actorId, async (tx, actor) => {
      const customer = await tx.customer.findUnique({
        where: { phone: canonical },
        select: { id: true },
      });
      if (customer === null) throw new CustomerNotFoundError();
      const data = await findCustomerData(tx, actor, customer.id);
      if (data === null) throw new CustomerNotFoundError();
      return data;
    });
  }
  measurements(
    actorId: string,
    customerId: string,
    query: CustomerMeasurementsQuery,
  ): Promise<CustomerMeasurementsData> {
    return this.read(actorId, async (tx, actor) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      });
      if (customer === null) throw new CustomerNotFoundError();
      return findCustomerMeasurements(tx, actor, customerId, query);
    });
  }
  drafts(
    actorId: string,
    customerId: string,
    query: CustomerDraftsQuery,
  ): Promise<CustomerDraftsData> {
    return this.read(actorId, async (tx, actor) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      });
      if (customer === null) throw new CustomerNotFoundError();
      return findCustomerDraftPage(tx, actor, customerId, query);
    });
  }
  async create(
    actorId: string,
    input: CreateCustomerBody,
  ): Promise<CustomerCommandData> {
    const payload = input.customer;
    try {
      return await this.commands.execute({
        kind: "customer",
        operation: "CREATE_CUSTOMER",
        actorId,
        commandId: input.commandId,
        targetId: null,
        expectedVersion: null,
        payloadHash: hashSalesCommandIntent({
          operation: "CREATE_CUSTOMER",
          targetId: null,
          expectedVersion: null,
          payload,
        }),
        work: async (tx, _actor, occurredAt) => {
          const row = await tx.customer.create({
            data: {
              name: payload.name,
              phone: payload.phone,
              email: payload.email,
              address: payload.address,
              notes: payload.notes,
              createdAt: occurredAt,
              updatedAt: occurredAt,
            },
            select: CUSTOMER_SELECT,
          });
          return { before: null, after: mapCustomer(row) };
        },
      });
    } catch (error) {
      if (isCustomerPhoneConflict(error))
        throw new CustomerPhoneConflictError();
      throw error;
    }
  }
  async update(
    actorId: string,
    customerId: string,
    input: UpdateCustomerBody,
  ): Promise<CustomerCommandData> {
    try {
      return await this.commands.execute({
        kind: "customer",
        operation: "UPDATE_CUSTOMER",
        actorId,
        commandId: input.commandId,
        targetId: customerId,
        expectedVersion: input.expectedVersion,
        payloadHash: hashSalesCommandIntent({
          operation: "UPDATE_CUSTOMER",
          targetId: customerId,
          expectedVersion: input.expectedVersion,
          payload: input.patch,
        }),
        work: async (tx, _actor, occurredAt) => {
          await tx.$queryRaw`SELECT id FROM customers WHERE id=${customerId}::uuid FOR UPDATE`;
          const before = await tx.customer.findUnique({
            where: { id: customerId },
            select: CUSTOMER_SELECT,
          });
          if (before === null) throw new CustomerNotFoundError();
          if (
            before.version !== input.expectedVersion ||
            before.version === 2_147_483_647
          )
            throw new CustomerVersionConflictError();
          const patch = input.patch;
          const data: Prisma.CustomerUpdateManyMutationInput = {
            version: { increment: 1 },
            updatedAt: occurredAt,
          };
          if (patch.name !== undefined) data.name = patch.name;
          if (patch.phone !== undefined) data.phone = patch.phone;
          if (patch.email !== undefined) data.email = patch.email;
          if (patch.address !== undefined) data.address = patch.address;
          if (patch.notes !== undefined) data.notes = patch.notes;
          const changed = await tx.customer.updateMany({
            where: { id: customerId, version: input.expectedVersion },
            data,
          });
          if (changed.count !== 1) throw new CustomerVersionConflictError();
          const after = await tx.customer.findUniqueOrThrow({
            where: { id: customerId },
            select: CUSTOMER_SELECT,
          });
          return { before: mapCustomer(before), after: mapCustomer(after) };
        },
      });
    } catch (error) {
      if (isCustomerPhoneConflict(error))
        throw new CustomerPhoneConflictError();
      throw error;
    }
  }
  private async read<T>(
    actorId: string,
    work: (tx: Prisma.TransactionClient, actor: AuthorityAccount) => Promise<T>,
  ): Promise<T> {
    let retried = false;
    for (;;) {
      try {
        return await this.database.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT set_config('lock_timeout', '5000ms', true)`;
            await lockAccountRows(tx, [actorId], "read");
            const actor = await loadIdentityAccount(tx, actorId);
            assertBusinessAuthority(actor, Department.SALES);
            return work(tx, actor);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error) {
        if (isSalesLockTimeout(error))
          throw new SalesTransactionConflictError();
        if (isSalesTransactionConflict(error)) {
          if (!retried) {
            retried = true;
            continue;
          }
          throw new SalesTransactionConflictError();
        }
        throw error;
      }
    }
  }
}
