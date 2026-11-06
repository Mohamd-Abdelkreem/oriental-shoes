"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Edit, Printer } from "lucide-react";
import { salesUuidSchema } from "@template/contracts";
import { useOperationalScope } from "@/shared/query/operational-scope";
import { getApiError } from "@/services/api/api-client";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalTable,
  OrientalStatusPill,
} from "@/features/prototype/components/data-table";
import {
  OrderPaperForm,
  type OrderPaperDataState,
} from "@/features/orders/components/order-paper-form";
import {
  OrderDetailTabs,
  type OrderDetailTab,
} from "@/features/orders/components/order-detail-tabs";
import { orderTypeLabels } from "@/features/orders/order-types";
import { useDraft, useDraftChanges } from "../hooks/drafts.hooks";
import {
  makeDraftDefaults,
  draftChangeFieldLabels,
  toDraftPaper,
  draftEditRoute,
} from "../model/draft-form.model";

const dataState: OrderPaperDataState = {
  kind: "draft",
  pricing: "unavailable",
  catalogOptions: {
    model: [],
    leatherBase: [],
    decoration: [],
    decorationColor: [],
    sole: [],
    soleAddition: [],
    soleColor: [],
    size: [],
  },
};
export function SalesOrderDetailView({ orderId }: { orderId: string }) {
  return <DraftDetail key={orderId} orderId={orderId} />;
}
function DraftDetail({ orderId }: { orderId: string }) {
  const scope = useOperationalScope(),
    query = useDraft(orderId);
  const [activeTab, setActiveTab] = useState<OrderDetailTab>("tracking"),
    [page, setPage] = useState(1);
  const changes = useDraftChanges(query.data === undefined ? null : orderId, {
    page,
    limit: 25,
  });
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  if (!salesUuidSchema.safeParse(orderId).success)
    return <p role="alert">مرجع المسودة غير صالح.</p>;
  if (query.isError && query.data === undefined)
    return (
      <div role="alert">
        {getApiError(query.error).statusCode === 404
          ? "المسودة غير موجودة أو غير متاحة."
          : "تعذّر تحميل المسودة."}{" "}
        {getApiError(query.error).requestId}
        <button
          type="button"
          className="btn-pill btn-outline"
          onClick={() => {
            void query.refetch();
          }}
        >
          إعادة المحاولة
        </button>
      </div>
    );
  const draft = query.data?.draft;
  if (draft === undefined) return <p role="status">جارٍ تحميل المسودة...</p>;
  const paper = toDraftPaper(makeDraftDefaults(draft), {
    ownerName: draft.owner.fullName,
    createdAt: draft.createdAt,
    draftId: draft.id,
    customer: draft.customer,
  });
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow={`المبيعات / تتبع الطلب / ${draft.id}`}
        title={`${orderTypeLabels[draft.type]} — ${draft.customer?.name ?? "دون عميل"}`}
        badge={<OrientalStatusPill tone="neutral">مسودة</OrientalStatusPill>}
        subtitle={`مندوب المبيعات: ${draft.owner.fullName} · تاريخ التسليم: ${draft.deliveryDate ?? "—"}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href={draftEditRoute(draft.id)} className="btn-pill btn-teal">
              <Edit size={15} />
              تعديل الطلب
            </Link>
            <button
              type="button"
              disabled
              className="btn-pill btn-secondary"
              title="الطباعة الرسمية غير متاحة للمسودة"
            >
              <Printer size={15} />
              معاينة الطباعة
            </button>
            <Link href="/sales/orders" className="btn-pill btn-secondary">
              <ArrowRight size={15} />
              العودة للقائمة
            </Link>
          </div>
        }
      />
      <p className="text-xs text-slate-500">
        مرجع تقني لمسودة غير مقدمة؛ الطباعة الرسمية غير متاحة.
      </p>
      {query.isFetching && <p role="status">جارٍ تحديث المسودة...</p>}
      {query.isError && (
        <div role="alert">
          تعذّر تحديث المسودة. {getApiError(query.error).requestId}
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={() => {
              void query.refetch();
            }}
          >
            تحديث المسودة
          </button>
        </div>
      )}
      <OrderDetailTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activePiecesCount={draft.pieces.length}
        eventsCount={changes.data?.pagination.total ?? 0}
        formLabel="ورقة المسودة غير المقدمة"
        historyLabel="سجل تغييرات المسودة"
      />
      <div className="pt-1">
        {activeTab === "tracking" && (
          <div className="space-y-3.5 rounded-xl border border-slate-200 bg-white p-5">
            <p>مسودة غير مقدمة؛ لا يوجد مسار تصنيع أو حركات مخزون.</p>
            <p>
              {draft.pieces.length} قطع محفوظة · المالك: {draft.owner.fullName}
            </p>
            <time dateTime={draft.createdAt}>{draft.createdAt}</time>
          </div>
        )}
        {activeTab === "form" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <OrderPaperForm
              order={paper}
              mode="readOnly"
              dataState={dataState}
            />
          </div>
        )}
        {activeTab === "history" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-slate-500">
              سجل المسودة فقط؛ حركات مراحل الطلب اللاحقة غير متاحة.
            </p>
            {changes.isFetching && (
              <p role="status">جارٍ تحميل سجل التغييرات...</p>
            )}
            {changes.isError && (
              <div role="alert">
                تعذّر تحميل سجل التغييرات.{" "}
                {getApiError(changes.error).requestId}
                <button
                  type="button"
                  className="btn-pill btn-outline"
                  onClick={() => {
                    void changes.refetch();
                  }}
                >
                  إعادة تحميل السجل
                </button>
              </div>
            )}
            {changes.data !== undefined && (
              <OrientalTable
                data={changes.data.changes}
                keyExtractor={(change) => change.commandId}
                emptyTitle="لا توجد تغييرات مسجلة"
                pagination={{
                  page,
                  totalPages: Math.max(1, changes.data.pagination.totalPages),
                  total: changes.data.pagination.total,
                  onPageChange: setPage,
                }}
                columns={[
                  {
                    header: "الحدث",
                    render: (change) =>
                      change.operation === "CREATE_DRAFT"
                        ? "إنشاء مسودة"
                        : "حفظ تعديل المسودة",
                  },
                  {
                    header: "الموظف",
                    render: (change) => change.actor.fullName,
                  },
                  {
                    header: "التغييرات",
                    render: (change) =>
                      change.changedFields
                        .map((field) => draftChangeFieldLabels[field])
                        .join("، ") || "—",
                  },
                  { header: "النسخة", render: (change) => change.afterVersion },
                  {
                    header: "التوقيت",
                    render: (change) => (
                      <time dateTime={change.occurredAt}>
                        {change.occurredAt}
                      </time>
                    ),
                  },
                ]}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
