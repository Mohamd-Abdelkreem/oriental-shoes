import {
  administrationActivityItemSchema,
  findOrderActivityActions,
  parseDraftReferenceSuffix,
  parseDraftSequence,
  salesUuidSchema,
  type AdministrationActivityData,
  type OrderActivityAction,
} from "@template/contracts";
import {
  assertBusinessAuthority,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import { ForbiddenException } from "../../core/errors/forbidden.error.js";
import { warehouseSummarySql } from "../warehouse/warehouse.mapper.js";
import {
  qualitySummarySql,
  qualityReportChildSql,
} from "../quality/quality.mapper.js";
import { manufacturingSummarySql } from "../manufacturing/manufacturing.mapper.js";
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
const approvalActivityNoteSql = Prisma.sql`CASE WHEN c.operation='REPORT_ISSUE' THEN (SELECT reason FROM manufacturing_issues WHERE id=c.issue_id) WHEN c.operation='SUBMIT_CONTACT' THEN c.after_facts#>>'{proposal,contactNotes}' WHEN c.operation='RETURN_INITIAL' THEN c.after_facts#>>'{currentReturn,reason}' ELSE c.decision_notes END`;
export const approvalSummarySql = Prisma.sql`jsonb_build_object(
 'id',c.command_id,'orderId',c.order_id,'orderVersion',c.after_version,'businessNumber',h.business_number,'operation',c.operation,
 'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),
 'occurredAt',c.occurred_at,'pieceId',c.piece_id,'issueId',c.issue_id,'proposalId',c.proposal_id,'decision',c.decision,
 'notes',${approvalActivityNoteSql},
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
 'draftSequence',(SELECT r.number::text FROM sales_draft_references r WHERE r.draft_id=c.draft_id),
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

const administrationEventFieldsSql = Prisma.sql`jsonb_build_object(
 'id',c.command_id,'orderId',c.order_id,'orderVersion',c.after_version,'businessNumber',h.business_number,'operation',c.operation,
 'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),
 'occurredAt',c.occurred_at,'pieceIds',c.piece_ids)`;
const administrationChangedFieldsSql = Prisma.sql`CASE WHEN c.operation='ADMIN_CORRECT' THEN to_jsonb(correction.changed_fields) ELSE to_jsonb(array_remove(ARRAY[
 'cancellation',CASE WHEN c.before_facts->'status' IS DISTINCT FROM c.after_facts->'status' THEN 'status' END,
 CASE WHEN c.before_facts#>'{money,total}' IS DISTINCT FROM c.after_facts#>'{money,total}' THEN 'total' END]::text[],NULL)) END`;
const administrationOrderSummarySql = Prisma.sql`${administrationEventFieldsSql} || jsonb_build_object('changedFields',${administrationChangedFieldsSql})`;
// Full facts retain the original receipt timestamp spelling for exact effect binding.
const administrationFullSummarySql = Prisma.sql`${administrationOrderSummarySql} || jsonb_build_object('reason',c.reason,'before',c.before_facts,'after',c.after_facts,'occurredAt',c.outcome#>'{receipt,occurredAt}')`;
export const administrationOperationalSummarySql = Prisma.sql`${administrationEventFieldsSql} || jsonb_build_object('beforeStatus',c.before_facts->'status','afterStatus',c.after_facts->'status')`;
const qualityActivityNoteSql = Prisma.sql`CASE WHEN c.operation='INSPECT' THEN g.inspector_note WHEN c.operation='REPORT_ISSUES' THEN
 (SELECT concat_ws(' — ',nullif(issue.reason,''),nullif(issue.notes,'')) FROM quality_piece_events event JOIN manufacturing_issues issue ON issue.id=event.issue_id AND issue.order_id=event.order_id AND issue.piece_id=event.piece_id WHERE event.command_id=g.command_id AND event.order_id=g.order_id ORDER BY event.piece_id LIMIT 1) ELSE NULL END`;
const warehouseActivityNoteSql = Prisma.sql`CASE c.operation
 WHEN 'RECEIVE' THEN (SELECT notes FROM warehouse_receipt_groups WHERE command_id=g.command_id AND order_id=g.order_id)
 WHEN 'DISPATCH' THEN (SELECT delivery_note FROM warehouse_delivery_attempts WHERE command_id=g.command_id AND order_id=g.order_id)
 WHEN 'FAIL_DELIVERY' THEN (SELECT concat_ws(' — ',nullif(reason,''),nullif(notes,'')) FROM warehouse_delivery_outcomes WHERE command_id=g.command_id AND order_id=g.order_id)
 WHEN 'RETRY_DELIVERY' THEN (SELECT notes FROM warehouse_delivery_retries WHERE command_id=g.command_id AND order_id=g.order_id)
 ELSE NULL END`;
type ActivityIdentity = Readonly<{
  eventId: string;
  occurredAt: Date;
  kind: OrderActivityAction["kind"];
}>;
type ActivityIdentityPageInput = Readonly<{
  scope: OrderActivityScope;
  query: SalesOrderActivityQuery;
  orderId?: string;
  search?: string;
  administrationProjection: "ORDER" | "ADMINISTRATION";
}>;
const readOrderActivityIdentityPage = async (
  tx: Prisma.TransactionClient,
  input: ActivityIdentityPageInput,
): Promise<{
  identities: readonly ActivityIdentity[];
  pagination: SalesOrderActivityData["pagination"];
}> => {
  const { scope, query, orderId } = input,
    page = parsePaginationQuery(query);
  const identities = Prisma.sql`
 SELECT c.command_id AS event_id,c.occurred_at,CASE WHEN c.operation IN ('CREATE_DRAFT','SAVE_DRAFT') THEN 'draft' ELSE 'order' END AS kind,d.id AS order_id,c.operation::text AS operation,c.actor_full_name AS actor_name,h.business_number,NULL::text AS note
 FROM sales_commands c JOIN sales_drafts d ON d.id=c.draft_id LEFT JOIN sales_orders h ON h.id=d.id WHERE ${salesPredicate(scope, orderId)}
 UNION ALL SELECT c.command_id,c.occurred_at,'approval',d.id,c.operation::text,c.actor_full_name,h.business_number,${approvalActivityNoteSql}
 FROM approval_commands c JOIN sales_drafts d ON d.id=c.order_id JOIN sales_orders h ON h.id=d.id WHERE ${approvalPredicate(scope, orderId)} AND NOT ${qualityReportChildSql}
 UNION ALL SELECT g.event_id,c.occurred_at,'manufacturing',d.id,c.operation::text,c.actor_full_name,h.business_number,NULL::text
 FROM manufacturing_command_orders g JOIN manufacturing_commands c ON c.command_id=g.command_id JOIN sales_drafts d ON d.id=g.order_id JOIN sales_orders h ON h.id=d.id WHERE ${approvalPredicate(scope, orderId)}
 UNION ALL SELECT g.event_id,c.occurred_at,'quality',d.id,c.operation::text,c.actor_full_name,h.business_number,${qualityActivityNoteSql}
 FROM quality_command_orders g JOIN quality_commands c ON c.command_id=g.command_id JOIN sales_drafts d ON d.id=g.order_id JOIN sales_orders h ON h.id=d.id WHERE ${approvalPredicate(scope, orderId)}
 UNION ALL SELECT g.event_id,c.occurred_at,'warehouse',d.id,c.operation::text,c.actor_full_name,h.business_number,${warehouseActivityNoteSql}
 FROM warehouse_command_orders g JOIN warehouse_commands c ON c.command_id=g.command_id JOIN sales_drafts d ON d.id=g.order_id JOIN sales_orders h ON h.id=d.id WHERE ${approvalPredicate(scope, orderId)}
 UNION ALL SELECT c.command_id,c.occurred_at,'administration',d.id,c.operation::text,c.actor_full_name,h.business_number,${input.administrationProjection === "ADMINISTRATION" ? Prisma.sql`c.reason` : Prisma.sql`NULL::text`}
 FROM administration_commands c JOIN sales_drafts d ON d.id=c.order_id JOIN sales_orders h ON h.id=d.id WHERE ${approvalPredicate(scope, orderId)}`;
  let search = Prisma.sql`true`;
  if (input.search !== undefined) {
    const literal = `%${input.search.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`,
      pairs = findOrderActivityActions(input.search),
      uuid = salesUuidSchema.safeParse(input.search),
      draftReference = parseDraftReferenceSuffix(input.search),
      draftSequence = parseDraftSequence(input.search);
    const labels = pairs.length
      ? Prisma.join(
          pairs.map(
            (pair) =>
              Prisma.sql`(kind=${pair.kind} AND operation=${pair.operation})`,
          ),
          " OR ",
        )
      : Prisma.sql`false`;
    search = Prisma.sql`((${labels}) OR business_number ILIKE ${literal} OR actor_name ILIKE ${literal} OR note ILIKE ${literal}
      OR ${uuid.success ? Prisma.sql`order_id=${uuid.data}::uuid` : Prisma.sql`false`}
      OR ${draftReference === null ? Prisma.sql`false` : Prisma.sql`(kind='draft' AND right(order_id::text,${draftReference.length}::int)=${draftReference})`}
      OR ${draftSequence === null ? Prisma.sql`false` : Prisma.sql`(kind='draft' AND EXISTS(SELECT 1 FROM sales_draft_references r WHERE r.draft_id=events.order_id AND r.number=${draftSequence}))`})`;
  }
  const [count] = await tx.$queryRaw<{ total: bigint }[]>(
    Prisma.sql`SELECT count(*) AS total FROM (${identities}) events WHERE ${search}`,
  );
  if (
    !count ||
    count.total < 0n ||
    count.total > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new InternalServerError("Order history count is unavailable.");
  const rows = await tx.$queryRaw<ActivityIdentity[]>(
    Prisma.sql`SELECT event_id AS "eventId",occurred_at AS "occurredAt",kind FROM (${identities}) events WHERE ${search} ORDER BY occurred_at DESC,event_id DESC,kind ASC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  return {
    identities: rows,
    pagination: buildPaginationMeta({ ...page, total: Number(count.total) }),
  };
};
const readOrderActivityRows = async (
  tx: Prisma.TransactionClient,
  identities: readonly ActivityIdentity[],
  projection: "ORDER" | "ADMINISTRATION",
) => {
  if (!identities.length) return [];
  const values = Prisma.join(
    identities.map(
      (row) =>
        Prisma.sql`(${row.eventId}::uuid,${row.occurredAt}::timestamptz,${row.kind}::text)`,
    ),
  );
  return tx.$queryRaw<
    { summary: unknown }[]
  >(Prisma.sql`WITH page(event_id,occurred_at,kind) AS(VALUES ${values}) SELECT summary FROM (
 SELECT ${salesSummarySql} AS summary,p.occurred_at,p.event_id,p.kind FROM page p JOIN sales_commands c ON c.command_id=p.event_id JOIN sales_drafts d ON d.id=c.draft_id WHERE p.kind IN ('draft','order')
 UNION ALL SELECT jsonb_build_object('kind','approval','event',${approvalSummarySql}) AS summary,p.occurred_at,p.event_id,p.kind FROM page p JOIN approval_commands c ON c.command_id=p.event_id JOIN sales_orders h ON h.id=c.order_id WHERE p.kind='approval'
 UNION ALL SELECT jsonb_build_object('kind','manufacturing','event',${manufacturingSummarySql}) AS summary,p.occurred_at,p.event_id,p.kind FROM page p JOIN manufacturing_command_orders g ON g.event_id=p.event_id JOIN manufacturing_commands c ON c.command_id=g.command_id JOIN sales_orders h ON h.id=g.order_id WHERE p.kind='manufacturing'
 UNION ALL SELECT jsonb_build_object('kind','quality','event',${qualitySummarySql}) AS summary,p.occurred_at,p.event_id,p.kind FROM page p JOIN quality_command_orders g ON g.event_id=p.event_id JOIN quality_commands c ON c.command_id=g.command_id JOIN sales_orders h ON h.id=g.order_id WHERE p.kind='quality'
 UNION ALL SELECT jsonb_build_object('kind','warehouse','event',${warehouseSummarySql}) AS summary,p.occurred_at,p.event_id,p.kind FROM page p JOIN warehouse_command_orders g ON g.event_id=p.event_id JOIN warehouse_commands c ON c.command_id=g.command_id JOIN sales_orders h ON h.id=g.order_id WHERE p.kind='warehouse'

 UNION ALL SELECT jsonb_build_object('kind','administration','event',${projection === "ADMINISTRATION" ? administrationFullSummarySql : administrationOrderSummarySql}) AS summary,p.occurred_at,p.event_id,p.kind FROM page p JOIN administration_commands c ON c.command_id=p.event_id JOIN sales_orders h ON h.id=c.order_id LEFT JOIN administration_order_corrections correction ON correction.command_id=c.command_id AND correction.order_id=c.order_id WHERE p.kind='administration'
 ) summaries ORDER BY occurred_at DESC,event_id DESC,kind ASC`);
};
export const findOrderActivity = async (
  tx: Prisma.TransactionClient,
  scope: OrderActivityScope,
  query: SalesOrderActivityQuery,
  orderId?: string,
): Promise<SalesOrderActivityData> => {
  const page = await readOrderActivityIdentityPage(tx, {
    scope,
    query,
    ...(orderId === undefined ? {} : { orderId }),
    administrationProjection: "ORDER",
  });
  const rows = await readOrderActivityRows(tx, page.identities, "ORDER");
  return {
    events: rows.map((row) => salesActivityItemSchema.parse(row.summary)),
    pagination: page.pagination,
  };
};
export type AdministrationActivityReadInput = Readonly<{
  query: SalesOrderActivityQuery;
  orderId?: string;
  search?: string;
}>;
export const findAdministrationOrderActivity = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  input: AdministrationActivityReadInput,
): Promise<Pick<AdministrationActivityData, "events" | "pagination">> => {
  assertBusinessAuthority(actor);
  if (actor.role !== "ADMIN") throw new ForbiddenException();
  const page = await readOrderActivityIdentityPage(tx, {
    ...input,
    scope: { kind: "APPROVAL" },
    administrationProjection: "ADMINISTRATION",
  });
  const rows = await readOrderActivityRows(
    tx,
    page.identities,
    "ADMINISTRATION",
  );
  return {
    events: rows.map((row) =>
      administrationActivityItemSchema.parse(row.summary),
    ),
    pagination: page.pagination,
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
