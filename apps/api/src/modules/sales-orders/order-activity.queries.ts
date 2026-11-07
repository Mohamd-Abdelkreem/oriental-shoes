import { Prisma } from "@template/database";
import {
  salesActivityItemSchema,
  type SalesOrderActivityQuery,
  type SalesOrderActivityData,
} from "@template/contracts";
import {
  buildPaginationMeta,
  parsePaginationQuery,
} from "../../core/pagination/index.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";

export type OrderActivityScope =
  { kind: "OWNER"; ownerId: string } | { kind: "APPROVAL" };
const activityHeaders = [
  "type",
  "customerId",
  "deliveryDate",
  "generalNotes",
  "responsibleSignature",
  "repairNote",
  "adjustmentRequested",
  "adjustmentReason",
  "adjustmentActionTaken",
  "paidAmount",
] as const;
const correctionHeaders = [
  "deliveryDate",
  "generalNotes",
  "responsibleSignature",
  "repairNote",
  "adjustmentRequested",
  "adjustmentReason",
  "adjustmentActionTaken",
] as const;
const changedHeaderSql = (keys: readonly string[]) =>
  Prisma.join(
    keys.map((key) => {
      const before =
        key === "customerId"
          ? Prisma.sql`c.before#>'{customer,id}'`
          : Prisma.sql`c.before->${key}`;
      const after =
        key === "customerId"
          ? Prisma.sql`c.after#>'{customer,id}'`
          : Prisma.sql`c.after->${key}`;
      return Prisma.sql`CASE WHEN ${before} IS DISTINCT FROM ${after} THEN to_jsonb(${key}::text) END`;
    }),
    ",",
  );
export const approvalSummarySql = Prisma.sql`jsonb_build_object(
 'id',c.command_id,'orderId',c.order_id,'orderVersion',c.after_version,'businessNumber',h.business_number,'operation',c.operation,
 'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),
 'occurredAt',c.occurred_at,'pieceId',c.piece_id,'issueId',c.issue_id,'proposalId',c.proposal_id,'decision',c.decision,
 'notes',CASE WHEN c.operation='REPORT_ISSUE' THEN (SELECT reason FROM manufacturing_issues WHERE id=c.issue_id) WHEN c.operation='SUBMIT_CONTACT' THEN c.after_facts#>>'{proposal,contactNotes}' WHEN c.operation='RETURN_INITIAL' THEN c.after_facts#>>'{currentReturn,reason}' ELSE c.decision_notes END,
 'changedFields',array_remove(ARRAY[
 CASE WHEN c.operation='APPROVE_INITIAL' OR (c.operation='REVIEW_CONTACT' AND c.decision='ACCEPT') THEN 'approval' END,
 CASE WHEN c.before_facts->'orderStatus' IS DISTINCT FROM c.after_facts->'orderStatus' THEN 'status' END,
 CASE WHEN c.before_facts->'pieces' IS DISTINCT FROM c.after_facts->'pieces' THEN 'pieceState' END,
 CASE WHEN c.before_facts->'issue' IS DISTINCT FROM c.after_facts->'issue' THEN 'issue' END,
 CASE WHEN c.before_facts->'proposal' IS DISTINCT FROM c.after_facts->'proposal' THEN 'proposal' END,
 CASE WHEN c.operation='REVIEW_CONTACT' AND c.decision='ACCEPT' AND c.after_facts#>'{proposal,before,model}' IS DISTINCT FROM c.after_facts#>'{proposal,proposed,model}' THEN 'model' END,
 CASE WHEN c.operation='REVIEW_CONTACT' AND c.decision='ACCEPT' AND c.after_facts#>'{proposal,before,size}' IS DISTINCT FROM c.after_facts#>'{proposal,proposed,size}' THEN 'size' END,
 CASE WHEN c.operation='REVIEW_CONTACT' AND c.decision='ACCEPT' AND c.after_facts#>'{proposal,before,leatherBase}' IS DISTINCT FROM c.after_facts#>'{proposal,proposed,leatherBase}' THEN 'leatherBase' END,
 CASE WHEN c.operation='REVIEW_CONTACT' AND c.decision='ACCEPT' AND c.after_facts#>'{proposal,before,sole}' IS DISTINCT FROM c.after_facts#>'{proposal,proposed,sole}' THEN 'sole' END,
 CASE WHEN c.decision='CANCEL' THEN 'cancellation' END,
 CASE WHEN c.before_facts#>'{money,total}' IS DISTINCT FROM c.after_facts#>'{money,total}' THEN 'total' END]::text[],NULL))`;
const salesSummarySql = Prisma.sql`CASE WHEN c.operation IN ('CREATE_DRAFT','SAVE_DRAFT') THEN jsonb_build_object('kind','draft','change',jsonb_build_object(
 'commandId',c.command_id,'operation',c.operation,'draftId',c.draft_id,'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),'occurredAt',c.occurred_at,'beforeVersion',c.before_version,'afterVersion',c.after_version,
 'changedFields',(SELECT COALESCE(jsonb_agg(v),'[]') FROM jsonb_array_elements(jsonb_build_array(${changedHeaderSql(activityHeaders)},CASE WHEN c.before->'pieces' IS DISTINCT FROM c.after->'pieces' THEN '"pieces"'::jsonb END)) v WHERE v<>'null'::jsonb),
 'addedPieceIds',COALESCE((SELECT jsonb_agg(a->'id' ORDER BY ord) FROM jsonb_array_elements(c.after->'pieces') WITH ORDINALITY p(a,ord) WHERE ord<=200 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(c.before->'pieces','[]')) b WHERE b->>'id'=a->>'id')),'[]'),
 'removedPieceIds',COALESCE((SELECT jsonb_agg(b->'id' ORDER BY ord) FROM jsonb_array_elements(COALESCE(c.before->'pieces','[]')) WITH ORDINALITY p(b,ord) WHERE ord<=200 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after->'pieces') a WHERE b->>'id'=a->>'id')),'[]')
 )) ELSE jsonb_build_object('kind','order','event',jsonb_build_object(
 'id',c.command_id,'orderId',c.draft_id,'orderVersion',c.after_version,'businessNumber',c.after->>'businessNumber','operation',c.operation,
 'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),'occurredAt',c.occurred_at,'notes',NULL,
 'pieceIds',CASE WHEN c.operation='SET_ORDER_PAID' THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(a->'id' ORDER BY ord) FROM jsonb_array_elements(c.after->'pieces') WITH ORDINALITY p(a,ord) WHERE ord<=200 AND (c.operation IN ('SUBMIT_NEW_ORDER','SUBMIT_DRAFT') OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.before->'pieces') b WHERE b->>'id'=a->>'id' AND b IS DISTINCT FROM a))),'[]') END,
 'changedFields',CASE WHEN c.operation IN ('SUBMIT_NEW_ORDER','SUBMIT_DRAFT') THEN '["status","businessNumber","customerSnapshot","prices","pieces","paidAmount"]'::jsonb WHEN c.operation='SET_ORDER_PAID' THEN '["paidAmount"]'::jsonb ELSE
 (SELECT COALESCE(jsonb_agg(v),'[]') FROM jsonb_array_elements(jsonb_build_array('status',${changedHeaderSql(correctionHeaders)},
 CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(c.after->'pieces') a JOIN jsonb_array_elements(c.before->'pieces') b ON a->>'id'=b->>'id' WHERE (a-'catalogSelections') IS DISTINCT FROM (b-'catalogSelections')) THEN '"pieces"'::jsonb END,
 CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(c.after->'pieces') a JOIN jsonb_array_elements(c.before->'pieces') b ON a->>'id'=b->>'id' WHERE a->'catalogSelections' IS DISTINCT FROM b->'catalogSelections') THEN '"catalogSelections"'::jsonb END)) v WHERE v<>'null'::jsonb) END,
 'paidChange',CASE WHEN c.operation='SET_ORDER_PAID' THEN jsonb_build_object('before',c.before#>>'{money,paidAmount}','after',c.after#>>'{money,paidAmount}') ELSE NULL END
 )) END`;
const ownerPredicate = (scope: OrderActivityScope) =>
  scope.kind === "OWNER"
    ? Prisma.sql`d.owner_id=${scope.ownerId}::uuid`
    : Prisma.sql`TRUE`;
const salesPredicate = (scope: OrderActivityScope, orderId?: string) =>
  Prisma.sql`c.operation IN ('CREATE_DRAFT','SAVE_DRAFT','SUBMIT_NEW_ORDER','SUBMIT_DRAFT','RESUBMIT_ORDER','SET_ORDER_PAID') AND ${ownerPredicate(scope)} ${orderId === undefined ? Prisma.empty : Prisma.sql`AND d.id=${orderId}::uuid`}`;
const approvalPredicate = (scope: OrderActivityScope, orderId?: string) =>
  Prisma.sql`${ownerPredicate(scope)} ${orderId === undefined ? Prisma.empty : Prisma.sql`AND d.id=${orderId}::uuid`}`;
export const findOrderActivity = async (
  tx: Prisma.TransactionClient,
  scope: OrderActivityScope,
  query: SalesOrderActivityQuery,
  orderId?: string,
): Promise<SalesOrderActivityData> => {
  const page = parsePaginationQuery(query);
  const identities = Prisma.sql`SELECT c.command_id AS event_id,c.occurred_at,CASE WHEN c.operation IN ('CREATE_DRAFT','SAVE_DRAFT') THEN 'draft' ELSE 'order' END AS kind FROM sales_commands c JOIN sales_drafts d ON d.id=c.draft_id WHERE ${salesPredicate(scope, orderId)} UNION ALL SELECT c.command_id AS event_id,c.occurred_at,'approval' AS kind FROM approval_commands c JOIN sales_drafts d ON d.id=c.order_id WHERE ${approvalPredicate(scope, orderId)}`;
  const [count] = await tx.$queryRaw<Array<{ total: number }>>(
    Prisma.sql`SELECT count(*)::int AS total FROM (${identities}) events`,
  );
  if (count === undefined)
    throw new InternalServerError("Order history count is unavailable.");
  const rows = await tx.$queryRaw<
    Array<{ summary: unknown }>
  >(Prisma.sql`WITH page AS (SELECT * FROM (${identities}) events ORDER BY occurred_at DESC,event_id DESC,kind ASC LIMIT ${page.take} OFFSET ${page.skip}) SELECT summary FROM (
 SELECT ${salesSummarySql} AS summary,p.occurred_at,p.event_id,p.kind FROM page p JOIN sales_commands c ON c.command_id=p.event_id JOIN sales_drafts d ON d.id=c.draft_id WHERE p.kind IN ('draft','order')
 UNION ALL SELECT jsonb_build_object('kind','approval','event',${approvalSummarySql}) AS summary,p.occurred_at,p.event_id,p.kind FROM page p JOIN approval_commands c ON c.command_id=p.event_id JOIN sales_orders h ON h.id=c.order_id WHERE p.kind='approval'
 ) summaries ORDER BY occurred_at DESC,event_id DESC,kind ASC`);
  return {
    events: rows.map((row) => salesActivityItemSchema.parse(row.summary)),
    pagination: buildPaginationMeta({ ...page, total: count.total }),
  };
};
export const findSalesActivityEvent = async (
  tx: Prisma.TransactionClient,
  scope: OrderActivityScope,
  orderId: string,
  eventId: string,
) => {
  const rows = await tx.$queryRaw<Array<{ summary: unknown }>>(
    Prisma.sql`SELECT ${salesSummarySql} AS summary FROM sales_commands c JOIN sales_drafts d ON d.id=c.draft_id WHERE ${salesPredicate(scope, orderId)} AND c.command_id=${eventId}::uuid LIMIT 1`,
  );
  return rows[0] === undefined
    ? null
    : salesActivityItemSchema.parse(rows[0].summary);
};
