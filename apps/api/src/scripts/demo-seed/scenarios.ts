import { salesOrderDataSchema, type SalesOrderType } from "@template/contracts";
import { DemoSeedError, type DemoRequest } from "./http.js";
import {
  dateAfter,
  resubmitDemoOrder,
  type DemoOrder,
  type prepareDemoSales,
} from "./sales.js";
import type { demoWork } from "./work.js";

type Journey = (order: DemoOrder) => Promise<void>;
type Scenario = readonly [
  label: string,
  type: SalesOrderType,
  quantity: number,
  journey: Journey,
];

const pieceAt = (order: DemoOrder, index: number) => {
  const pieceId = order.pieceIds[index];
  if (!pieceId)
    throw new DemoSeedError(
      `Missing piece ${String(index + 1)} in ${order.number}`,
    );
  return pieceId;
};

export const seedDemoScenarios = async (
  sales: DemoRequest,
  intake: Awaited<ReturnType<typeof prepareDemoSales>>,
  work: ReturnType<typeof demoWork>,
  businessDate: string,
) => {
  const cuttingDone: Journey = async (order) => {
    await work.approve(order);
    await work.finishWork("CUTTING", order);
  };
  const qualityIncoming: Journey = async (order) => {
    await cuttingDone(order);
    await work.finishWork("PRODUCTION", order);
  };
  const inspect: Journey = async (order) => {
    await qualityIncoming(order);
    await work.startQuality(order);
  };
  const packed: Journey = async (order) => {
    await inspect(order);
    await work.accept(order);
  };
  const ready: Journey = async (order) => {
    await packed(order);
    await work.receive(order);
  };
  const dispatchDate = dateAfter(businessDate, 3);
  const dispatched: Journey = async (order) => {
    await ready(order);
    await work.delivery(order, "DISPATCH", dispatchDate);
  };
  const failed: Journey = async (order) => {
    await dispatched(order);
    await work.delivery(order, "FAIL_DELIVERY", dispatchDate);
  };
  const retried: Journey = async (order) => {
    await failed(order);
    await work.delivery(order, "RETRY_DELIVERY", dispatchDate);
  };
  const delivered: Journey = async (order) => {
    await dispatched(order);
    await work.delivery(order, "CONFIRM_DELIVERY", dispatchDate);
  };
  const rejectPiece = async (
    order: DemoOrder,
    target: "CUTTING" | "PRODUCTION",
  ) => {
    const [first, ...remaining] = order.pieceIds;
    if (!first) throw new DemoSeedError("An inspection needs a physical piece");
    await inspect(order);
    await work.inspect(order, [
      {
        decision: "REJECT",
        pieceId: first,
        target,
        reason:
          target === "CUTTING"
            ? "عدم تطابق القص عند مقدمة الحذاء."
            : "الخياطة الجانبية غير متساوية.",
        instructions:
          target === "CUTTING"
            ? "إعادة ضبط الباترون وقص الجزء الأمامي."
            : "فك الخياطة الجانبية وإعادة تشطيبها.",
      },
      ...remaining.map((pieceId) => ({ decision: "ACCEPT" as const, pieceId })),
    ]);
  };
  const correctionDone = async (order: DemoOrder) => {
    await rejectPiece(order, "PRODUCTION");
    await work.finishWork("PRODUCTION", order, [pieceAt(order, 0)]);
  };
  const report = async (order: DemoOrder) => {
    await work.approve(order);
    const pieceId = pieceAt(order, 0);
    await work.manufacture("CUTTING", order, "RECEIVE_AND_START", [pieceId]);
    const issueId = await work.reportIssue(order, pieceId);
    return { pieceId, issueId };
  };
  const needsContact = async (order: DemoOrder) => {
    const target = await report(order);
    await work.resolveIssue(order, target, "SEND_TO_SALES");
    return target;
  };
  const needsReapproval = async (order: DemoOrder) => {
    const target = await needsContact(order);
    const proposalId = await work.recordContact(
      order,
      target,
      await intake.contactSize(order, target.pieceId),
    );
    return { ...target, proposalId };
  };
  const splitStages: Journey = async (order) => {
    await work.approve(order);
    await work.finishWork("CUTTING", order, order.pieceIds.slice(1));
    await work.finishWork("PRODUCTION", order, order.pieceIds.slice(2));
    await work.startQuality(order, order.pieceIds.slice(3));
    await work.accept(order, order.pieceIds.slice(4));
    await work.receive(order, order.pieceIds.slice(4));
  };
  const pending: Journey = async () => {};
  const cuttingActive: Journey = async (order) => {
    await work.approve(order);
    await work.manufacture("CUTTING", order, "RECEIVE_AND_START");
  };
  const productionActive: Journey = async (order) => {
    await cuttingDone(order);
    await work.manufacture("PRODUCTION", order, "RECEIVE_AND_START");
  };
  const scenarios: Scenario[] = [
    ["بانتظار الاعتماد", "SHOP", 3, pending],
    ["معاد للمبيعات", "EXTERNAL", 2, work.returnToSales],
    [
      "أعيد إرساله بعد مراجعة المبيعات",
      "SHOP",
      3,
      async (order) => {
        await work.returnToSales(order);
        await resubmitDemoOrder(sales, order);
      },
    ],
    ["وارد للقص", "EXTERNAL", 3, work.approve],
    ["قيد القص", "SHOP", 3, cuttingActive],
    ["وارد للإنتاج", "EXTERNAL", 4, cuttingDone],
    ["قيد التصنيع", "READY", 3, productionActive],
    ["طلب إصلاح وارد", "REPAIR", 2, cuttingDone],
    ["إصلاح قيد العمل", "REPAIR", 2, productionActive],
    ["وارد للجودة", "GIFT", 2, qualityIncoming],
    ["قيد الفحص", "ACCESSORY", 3, inspect],
    [
      "معاد من الجودة للقص",
      "SHOP",
      3,
      (order) => rejectPiece(order, "CUTTING"),
    ],
    [
      "معاد من الجودة للإنتاج",
      "EXTERNAL",
      3,
      (order) => rejectPiece(order, "PRODUCTION"),
    ],
    [
      "تصحيح قيد التنفيذ",
      "ADJUSTMENT",
      3,
      async (order) => {
        await rejectPiece(order, "PRODUCTION");
        await work.manufacture("PRODUCTION", order, "RECEIVE_AND_START", [
          pieceAt(order, 0),
        ]);
      },
    ],
    ["بانتظار إعادة الفحص", "SHOP", 3, correctionDone],
    [
      "قيد إعادة الفحص",
      "EXTERNAL",
      2,
      async (order) => {
        await correctionDone(order);
        await work.startQuality(order, [pieceAt(order, 0)]);
      },
    ],
    [
      "أعيد فحصه وقُبل",
      "SHOP",
      2,
      async (order) => {
        await correctionDone(order);
        const corrected = [pieceAt(order, 0)];
        await work.startQuality(order, corrected);
        await work.accept(order, corrected);
      },
    ],
    ["وارد للمستودع بعد التغليف", "SHOP", 3, packed],
    [
      "استلام جزئي من المستودع",
      "EXTERNAL",
      4,
      async (order) => {
        await packed(order);
        await work.receive(order, order.pieceIds.slice(0, 2));
      },
    ],
    ["جاهز للتسليم", "EXTERNAL", 3, ready],
    ["خرج للتوصيل", "SHOP", 2, dispatched],
    ["تعذر التوصيل وعاد للمستودع", "EXTERNAL", 3, failed],
    ["جاهز بعد إعادة الجدولة", "SHOP", 2, retried],
    ["تم التسليم للعميل", "EXTERNAL", 3, delivered],
    ["قطع أمر واحد موزعة على الأقسام", "SHOP", 5, splitStages],
    [
      "مشكلة بانتظار قرار الاعتماد",
      "EXTERNAL",
      2,
      async (order) => {
        await report(order);
      },
    ],
    [
      "مشكلة بانتظار التواصل مع العميل",
      "SHOP",
      3,
      async (order) => {
        await needsContact(order);
      },
    ],
    [
      "تعديل العميل بانتظار إعادة الاعتماد",
      "EXTERNAL",
      3,
      async (order) => {
        await needsReapproval(order);
      },
    ],
    [
      "اعتمد تغيير المقاس وعاد للقص",
      "SHOP",
      3,
      async (order) => {
        await work.approveContact(order, await needsReapproval(order));
      },
    ],
    [
      "اعتمدت معالجة المشكلة داخل القص",
      "EXTERNAL",
      2,
      async (order) => {
        await work.resolveIssue(
          order,
          await report(order),
          "RETURN_TO_DEPARTMENT",
        );
      },
    ],
    [
      "تصحيح إداري لتعليمات التسليم",
      "SHOP",
      3,
      async (order) => {
        await work.approve(order);
        await work.correctAsAdmin(order);
      },
    ],
    [
      "إلغاء قطعة وباقي الأمر مستمر",
      "SHOP",
      3,
      async (order) => {
        await work.approve(order);
        await work.cancelAsAdmin(order, "ITEM", [pieceAt(order, 0)]);
      },
    ],
    [
      "أمر ملغى بالكامل",
      "EXTERNAL",
      2,
      (order) => work.cancelAsAdmin(order, "ORDER", order.pieceIds),
    ],
    [
      "تم تحديث المبلغ المدفوع",
      "EXTERNAL",
      2,
      async (order) => {
        await work.approve(order);
        await work.setPaid(order);
      },
    ],
    ...([
      ["بانتظار الاعتماد", "GIFT", 4, pending],
      ["بانتظار الاعتماد", "ACCESSORY", 2, pending],
      ["بانتظار الاعتماد", "ADJUSTMENT", 2, pending],
      ["بانتظار الاعتماد", "READY", 3, pending],
      ["وارد للقص", "SHOP", 4, work.approve],
      ["وارد للقص", "EXTERNAL", 2, work.approve],
      ["قيد القص", "SHOP", 4, cuttingActive],
      ["قيد القص", "GIFT", 2, cuttingActive],
      ["وارد للإنتاج", "SHOP", 3, cuttingDone],
      ["قيد التصنيع", "EXTERNAL", 2, productionActive],
      ["قيد الفحص", "SHOP", 2, inspect],
      ["جاهز للتسليم", "EXTERNAL", 2, ready],
      ["تم التسليم للعميل", "SHOP", 3, delivered],
    ] satisfies Scenario[]),
  ];

  const records = [];
  for (const [index, [label, type, quantity, journey]] of scenarios.entries()) {
    const order = await intake.submit(index, type, quantity);
    console.info(`${order.number}  ${label}`);
    await journey(order);
    const { order: saved } = await sales(
      `/sales-orders/${order.id}`,
      salesOrderDataSchema,
    );
    if (saved.version !== order.version)
      throw new DemoSeedError(`Version changed during ${order.number}`);
    records.push({ label, order: saved });
  }
  return records;
};
