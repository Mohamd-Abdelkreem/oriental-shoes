import type { Prisma } from "@template/database";
import type {
  AdministrationCommandBody,
  AdministrationCommandData,
  AdministrationCommandFacts,
  AdministrationCorrectionValues,
} from "@template/contracts";
import type { DateOnlyString } from "../../core/date-only.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import type {
  ADMINISTRATION_ORDER_SELECT,
  ADMINISTRATION_SUMMARY_SELECT,
} from "./administration.mapper.js";

export type AdministrationObservation = Readonly<{
  generatedAt: Date;
  businessTimeZone: string | null;
  businessDate: DateOnlyString | null;
}>;
export type AdministrationResolvedPeriod = Readonly<{
  timeZone: string;
  businessDate: DateOnlyString;
  effectiveFrom: DateOnlyString | null;
  effectiveTo: DateOnlyString | null;
}>;
export type AdministrationRootRecord = Prisma.SalesDraftGetPayload<{
  select: typeof ADMINISTRATION_ORDER_SELECT;
}>;
export type AdministrationAggregateFacts = Readonly<{
  original: number;
  cancelled: number;
  active: number;
  received: number;
  completionPercent: number;
  currentDepartments: readonly (
    "CUTTING" | "PRODUCTION" | "QUALITY" | "WAREHOUSE"
  )[];
  isOverdue: boolean;
  hasQualityCorrectionHistory: boolean;
  hasOpenQualityCorrection: boolean;
}>;
export type AdministrationCancellationPlan = Readonly<{
  body: Extract<AdministrationCommandBody, { operation: "ADMIN_CANCEL" }>;
  reason: string;
  before: AdministrationCommandFacts;
  after: AdministrationCommandFacts;
  result: AdministrationCommandData["result"];
}>;
export type AdministrationCorrectionPlan = Readonly<{
  body: Extract<AdministrationCommandBody, { operation: "ADMIN_CORRECT" }>;
  reason: string;
  changedFields: readonly (keyof AdministrationCorrectionValues)[];
  before: AdministrationCommandFacts;
  after: AdministrationCommandFacts;
  result: AdministrationCommandData["result"];
}>;
export type AdministrationCancellationPlanInput = Readonly<{
  root: AdministrationRootRecord;
  body: AdministrationCancellationPlan["body"];
  actor: AuthorityAccount;
  occurredAt: Date;
}>;
export type AdministrationCorrectionPlanInput = Readonly<{
  root: AdministrationRootRecord;
  effective: AdministrationCorrectionValues;
  body: AdministrationCorrectionPlan["body"];
  actor: AuthorityAccount;
  occurredAt: Date;
}>;

export type AdministrationSummaryRecord = Prisma.SalesDraftGetPayload<{
  select: typeof ADMINISTRATION_SUMMARY_SELECT;
}>;
