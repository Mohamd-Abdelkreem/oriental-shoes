import type { CustomerDto, CustomerSummary } from "@template/contracts";
import type { Prisma } from "@template/database";

export const CUSTOMER_SUMMARY_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
} as const satisfies Prisma.CustomerSelect;
export const CUSTOMER_SELECT = {
  ...CUSTOMER_SUMMARY_SELECT,
  notes: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.CustomerSelect;
export type CustomerRecord = Prisma.CustomerGetPayload<{
  select: typeof CUSTOMER_SELECT;
}>;
export type CustomerSummaryRecord = Prisma.CustomerGetPayload<{
  select: typeof CUSTOMER_SUMMARY_SELECT;
}>;
export const mapCustomerSummary = (
  row: CustomerSummaryRecord,
): CustomerSummary => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email,
  address: row.address,
});
export const mapCustomer = (row: CustomerRecord): CustomerDto => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email,
  address: row.address,
  notes: row.notes,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
