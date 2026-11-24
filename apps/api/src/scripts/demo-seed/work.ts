import { randomUUID } from "node:crypto";
import {
  administrationCommandDataSchema,
  approvalCommandDataSchema,
  manufacturingCommandDataSchema,
  qualityCommandDataSchema,
  salesOrderCommandDataSchema,
  salesOrderDataSchema,
  warehouseCommandDataSchema,
  warehouseOrderDataSchema,
  type ManufacturingDepartment,
  type ManufacturingCommandBody,
  type QualityCommandBody,
  type WarehouseCommandBody,
} from "@template/contracts";
import {
  formatMoneyCents,
  parseMoneyCents,
} from "../../modules/sales-orders/sales-orders.rules.js";
import { DemoSeedError, type DemoRequest } from "./http.js";
import type { DemoOrder } from "./sales.js";

type Actors = Record<
  | "ADMIN"
  | "SALES"
  | "APPROVAL"
  | "CUTTING"
  | "PRODUCTION"
  | "QUALITY"
  | "WAREHOUSE",
  DemoRequest
>;
type InspectionDecision = Extract<
  QualityCommandBody,
  { operation: "INSPECT" }
>["orders"][number]["decisions"][number];

const command = (order: DemoOrder) => ({
  commandId: randomUUID(),
  expectedVersion: order.version,
});
const selection = (order: DemoOrder, pieceIds: string[]) => ({
  orderId: order.id,
  expectedVersion: order.version,
  pieceIds,
});

const advanceBatchVersion = (
  order: DemoOrder,
  outcome: { orders: { orderId: string; afterVersion: number }[] },
) => {
  const saved = outcome.orders.find(({ orderId }) => orderId === order.id);
  if (!saved) throw new DemoSeedError("Missing order in command outcome");
  order.version = saved.afterVersion;
};

export const demoWork = (actors: Actors) => {
  const approve = async (order: DemoOrder) => {
    const { outcome } = await actors.APPROVAL(
      `/approvals/orders/${order.id}/approve`,
      approvalCommandDataSchema,
      command(order),
    );
    order.version = outcome.orderVersion;
  };
  const returnToSales = async (order: DemoOrder) => {
    const { outcome } = await actors.APPROVAL(
      `/approvals/orders/${order.id}/return`,
      approvalCommandDataSchema,
      {
        ...command(order),
        reason: "يرجى تأكيد طريقة التغليف وموعد الاستلام مع العميل.",
      },
    );
    order.version = outcome.orderVersion;
  };
  const manufacture = async (
    department: ManufacturingDepartment,
    order: DemoOrder,
    operation: ManufacturingCommandBody["operation"],
    pieceIds = order.pieceIds,
  ) => {
    const { outcome } = await actors[department](
      `/manufacturing/${department.toLowerCase()}/commands`,
      manufacturingCommandDataSchema,
      {
        commandId: randomUUID(),
        operation,
        orders: [selection(order, pieceIds)],
      } satisfies ManufacturingCommandBody,
    );
    advanceBatchVersion(order, outcome);
  };
  const finishWork = async (
    department: ManufacturingDepartment,
    order: DemoOrder,
    pieceIds = order.pieceIds,
  ) => {
    await manufacture(department, order, "RECEIVE_AND_START", pieceIds);
    await manufacture(department, order, "COMPLETE_TRANSFER", pieceIds);
  };
  const startQuality = async (order: DemoOrder, pieceIds = order.pieceIds) => {
    const { outcome } = await actors.QUALITY(
      "/quality/commands",
      qualityCommandDataSchema,
      {
        commandId: randomUUID(),
        operation: "RECEIVE_AND_START",
        orders: [selection(order, pieceIds)],
      },
    );
    advanceBatchVersion(order, outcome);
  };
  const inspect = async (order: DemoOrder, decisions: InspectionDecision[]) => {
    const accepted = decisions.filter(
      ({ decision }) => decision === "ACCEPT",
    ).length;
    const { outcome } = await actors.QUALITY(
      "/quality/commands",
      qualityCommandDataSchema,
      {
        commandId: randomUUID(),
        operation: "INSPECT",
        orders: [
          {
            orderId: order.id,
            expectedVersion: order.version,
            decisions,
            inspectorNote: "تمت مراجعة المقاس والخياطة وثبات النعل.",
            packing: accepted
              ? {
                  cartonCount: String(accepted),
                  cartonNumbers: `كرتون ${order.number} / ${String(order.version)}`,
                }
              : null,
          },
        ],
      },
    );
    advanceBatchVersion(order, outcome);
  };
  const accept = (order: DemoOrder, pieceIds = order.pieceIds) =>
    inspect(
      order,
      pieceIds.map((pieceId) => ({ decision: "ACCEPT", pieceId })),
    );

  const receive = async (order: DemoOrder, pieceIds = order.pieceIds) => {
    const { outcome } = await actors.WAREHOUSE(
      "/warehouse/commands",
      warehouseCommandDataSchema,
      {
        commandId: randomUUID(),
        operation: "RECEIVE",
        orders: [
          {
            ...selection(order, pieceIds),
            receipt: {
              cartonCount: String(pieceIds.length),
              storageLocation: "رف أ-٣",
              notes: "تمت مطابقة القطع مع كشف التغليف.",
            },
          },
        ],
      },
    );
    advanceBatchVersion(order, outcome);
  };
  const delivery = async (
    order: DemoOrder,
    operation: Exclude<WarehouseCommandBody["operation"], "RECEIVE">,
    deliveryDate: string,
  ) => {
    const current = await actors.WAREHOUSE(
      `/warehouse/orders/${order.id}`,
      warehouseOrderDataSchema,
    );
    const selected = selection(
      order,
      current.currentAttempt?.pieceIds ?? order.pieceIds,
    );
    const attemptId = current.currentAttempt?.id;
    if (operation !== "DISPATCH" && !attemptId)
      throw new DemoSeedError("Current delivery attempt is missing");
    const fields = {
      DISPATCH: { deliveryNote: "التواصل مع العميل قبل الوصول." },
      CONFIRM_DELIVERY: {
        attemptId,
        recipient: current.deliveryContact.name,
        notes: "تسلم العميل الطلب كاملاً.",
      },
      FAIL_DELIVERY: {
        attemptId,
        returnedToWarehouse: true,
        reason: "تعذر الوصول إلى العميل وقت التوصيل.",
      },
      RETRY_DELIVERY: {
        attemptId,
        retryDate: deliveryDate,
        notes: "أكد العميل موعداً جديداً للتوصيل.",
      },
    };
    const { outcome } = await actors.WAREHOUSE(
      "/warehouse/commands",
      warehouseCommandDataSchema,
      {
        commandId: randomUUID(),
        operation,
        orders: [{ ...selected, ...fields[operation] }],
      },
    );
    advanceBatchVersion(order, outcome);
  };
  const reportIssue = async (order: DemoOrder, pieceId: string) => {
    const { outcome } = await actors.CUTTING(
      `/manufacturing-orders/${order.id}/pieces/${pieceId}/issues`,
      approvalCommandDataSchema,
      {
        ...command(order),
        reason: "المقاس المسجل يحتاج تأكيداً قبل تجهيز الجلد.",
        notes: "تم إيقاف القطعة لحين مراجعة الاعتماد.",
      },
    );
    order.version = outcome.orderVersion;
    if (!outcome.issueId)
      throw new DemoSeedError("Saved issue reference is missing");
    return outcome.issueId;
  };
  const resolveIssue = async (
    order: DemoOrder,
    target: { pieceId: string; issueId: string },
    decision: "RETURN_TO_DEPARTMENT" | "SEND_TO_SALES",
  ) => {
    const { outcome } = await actors.APPROVAL(
      `/approvals/orders/${order.id}/pieces/${target.pieceId}/issues/${target.issueId}/resolve`,
      approvalCommandDataSchema,
      {
        ...command(order),
        decision,
        target: "CUTTING",
        notes: "يرجى مراجعة المقاس المسجل والقياس الفعلي للعميل.",
      },
    );
    order.version = outcome.orderVersion;
  };
  const recordContact = async (
    order: DemoOrder,
    target: { pieceId: string; issueId: string },
    size: string,
  ) => {
    const { outcome } = await actors.SALES(
      `/sales-contact/orders/${order.id}/pieces/${target.pieceId}/issues/${target.issueId}/proposals`,
      approvalCommandDataSchema,
      {
        ...command(order),
        kind: "AMEND",
        changes: { size },
        contactNotes: "تم التواصل مع العميل وتأكيد المقاس الجديد.",
      },
    );
    order.version = outcome.orderVersion;
    if (!outcome.proposalId)
      throw new DemoSeedError("Saved proposal reference is missing");
    return outcome.proposalId;
  };
  const approveContact = async (
    order: DemoOrder,
    target: { pieceId: string; issueId: string; proposalId: string },
  ) => {
    const { outcome } = await actors.APPROVAL(
      `/approvals/orders/${order.id}/pieces/${target.pieceId}/issues/${target.issueId}/review`,
      approvalCommandDataSchema,
      {
        ...command(order),
        proposalId: target.proposalId,
        decision: "ACCEPT",
        notes: "اعتماد المقاس بعد تأكيد العميل.",
      },
    );
    order.version = outcome.orderVersion;
  };
  const correctAsAdmin = async (order: DemoOrder) => {
    const { receipt } = await actors.ADMIN(
      "/administration/commands",
      administrationCommandDataSchema,
      {
        ...command(order),
        orderId: order.id,
        operation: "ADMIN_CORRECT",
        patch: {
          generalNotes: "تم تحديث تعليمات التسليم بعد تأكيد العنوان مع العميل.",
        },
        reason: "تصحيح تعليمات التسليم بناءً على طلب العميل.",
      },
    );
    order.version = receipt.afterVersion;
  };
  const cancelAsAdmin = async (
    order: DemoOrder,
    scope: "ORDER" | "ITEM",
    pieceIds: string[],
  ) => {
    const { receipt } = await actors.ADMIN(
      "/administration/commands",
      administrationCommandDataSchema,
      {
        ...command(order),
        orderId: order.id,
        operation: "ADMIN_CANCEL",
        scope,
        pieceIds,
        reason: "طلب العميل الإلغاء قبل بدء التجهيز.",
      },
    );
    order.version = receipt.afterVersion;
  };
  const setPaid = async (order: DemoOrder) => {
    const { order: saved } = await actors.SALES(
      `/sales-orders/${order.id}`,
      salesOrderDataSchema,
    );
    const paidAmount = formatMoneyCents(
      parseMoneyCents(saved.money.total) / 2n,
    );
    const { savedOrder } = await actors.SALES(
      `/sales-orders/${order.id}/paid`,
      salesOrderCommandDataSchema,
      {
        ...command(order),
        paidAmount,
      },
      "PATCH",
    );
    order.version = savedOrder.version;
  };
  return {
    approve,
    returnToSales,
    manufacture,
    finishWork,
    startQuality,
    inspect,
    accept,
    receive,
    delivery,
    reportIssue,
    resolveIssue,
    recordContact,
    approveContact,
    correctAsAdmin,
    cancelAsAdmin,
    setPaid,
  };
};
