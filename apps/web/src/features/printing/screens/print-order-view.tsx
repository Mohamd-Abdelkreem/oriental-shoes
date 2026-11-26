"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  LoaderCircle,
  Printer,
  ShieldAlert,
} from "lucide-react";
import {
  officialOrderPaperDataSchema,
  salesUuidSchema,
  type OfficialOrderPaperData,
} from "@template/contracts";
import {
  ApiContractError,
  getApiError,
  type ApiError,
} from "@/services/api/api-client";
import {
  isCurrentP04OperationalScope,
  useP04OperationalScope,
  type P04OperationalScope,
} from "@/shared/query/operational-scope";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";
import {
  toSubmittedPaper,
  toAuthoritativePaperState,
  toSalesOrderStatusLabel,
} from "@/features/sales/model/order-view.model";
import {
  officialOrderPaperOptions,
  orderPaperKeys,
  useOfficialOrderPaper,
} from "../hooks/order-paper.hooks";

type PrintFailure = Pick<ApiError, "message" | "requestId">;
type PrintRequest = Readonly<{ version: number }>;
const printDenials: Readonly<Record<string, string | undefined>> = {
  ORDER_PRINT_NOT_APPROVED: "لا يمكن طباعة أمر التفصيل قبل اعتماد رسمي محفوظ.",
  ORDER_PRINT_RETURNED: "لا يمكن طباعة طلب معاد للمبيعات حتى حسم اعتماده.",
  ORDER_PRINT_REAPPROVAL_PENDING:
    "الطباعة الرسمية متوقفة حتى حسم جميع تعديلات القطع المرسلة لإعادة الاعتماد.",
};
const sameKey = (left: unknown, right: QueryKey) =>
  Array.isArray(left) &&
  left.length === right.length &&
  left.every((part: unknown, index) => part === right[index]);
const noServerPaper = () => undefined;
function usePaperCacheState(client: QueryClient, key: QueryKey) {
  const subscribe = useCallback(
    (notify: () => void) =>
      client.getQueryCache().subscribe((event) => {
        if (sameKey(event.query.queryKey, key)) notify();
      }),
    [client, key],
  );
  const snapshot = useCallback(
    () => client.getQueryState<OfficialOrderPaperData>(key),
    [client, key],
  );
  // Invalidations must render even when a staleTime:0 observer was already stale.
  return useSyncExternalStore(subscribe, snapshot, noServerPaper);
}
const currentPaper = (
  client: QueryClient,
  scope: P04OperationalScope,
  orderId: string,
) => {
  if (!isCurrentP04OperationalScope(client, scope)) return null;
  const state = client.getQueryState(orderPaperKeys.order(scope, orderId));
  if (
    !state ||
    state.status !== "success" ||
    state.fetchStatus !== "idle" ||
    state.isInvalidated
  )
    return null;
  const parsed = officialOrderPaperDataSchema.safeParse(state.data);
  return parsed.success && parsed.data.order.id === orderId
    ? parsed.data
    : null;
};
function PrintStatus({
  title,
  message,
  requestId,
  kind = "error",
  onRetry,
}: {
  title: string;
  message: string;
  requestId?: string | undefined;
  kind?: "loading" | "error" | "denied";
  onRetry?: (() => void) | undefined;
}) {
  const loading = kind === "loading";
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-slate-100 p-4 print:hidden"
      dir="rtl"
    >
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div
          className="space-y-4"
          role={loading ? "status" : "alert"}
          aria-busy={loading || undefined}
        >
          {loading ? (
            <div className="mx-auto w-fit text-teal-700 motion-safe:animate-spin">
              <LoaderCircle size={44} />
            </div>
          ) : kind === "denied" ? (
            <ShieldAlert size={44} className="mx-auto text-amber-600" />
          ) : (
            <AlertCircle size={44} className="mx-auto text-amber-600" />
          )}
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-xs leading-relaxed text-slate-600">{message}</p>
          {requestId && <p className="text-xs">رقم الطلب: {requestId}</p>}
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="btn-pill btn-teal px-4 py-2 text-xs"
            >
              إعادة المحاولة
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              window.history.back();
            }}
            className="btn-pill btn-outline inline-flex items-center gap-1.5 px-4 py-2 text-xs"
          >
            <ArrowRight size={14} />
            العودة للصفحة السابقة
          </button>
        </div>
      </div>
    </div>
  );
}
export function PrintOrderView({ orderId }: { orderId: string }) {
  const scope = useP04OperationalScope("OFFICIAL_PAPER"),
    target = salesUuidSchema.safeParse(orderId);
  if (scope === null)
    return (
      <PrintStatus
        title="طباعة الاستمارة غير مصرحة لهذا الحساب"
        message="تقتصر الاستمارة الرسمية على الحسابات المؤهلة في المبيعات والاعتماد والإدارة، ضمن صلاحية الطلب الحالية."
        kind="denied"
      />
    );
  if (!target.success)
    return (
      <PrintStatus
        title="مرجع أمر التفصيل غير صالح"
        message="راجع رابط أمر التفصيل الحالي قبل الطباعة."
      />
    );
  return (
    <OfficialOrderPreview
      key={JSON.stringify([scope, target.data])}
      scope={scope}
      orderId={target.data}
    />
  );
}
function OfficialOrderPreview({
  scope,
  orderId,
}: {
  scope: P04OperationalScope;
  orderId: string;
}) {
  const client = useQueryClient(),
    query = useOfficialOrderPaper(orderId);
  const key = useMemo(
    () => orderPaperKeys.order(scope, orderId),
    [scope, orderId],
  );
  const cache = usePaperCacheState(client, key);
  const [preparing, setPreparing] = useState(false),
    [failure, setFailure] = useState<PrintFailure | null>(null),
    [pendingPrint, setPendingPrint] = useState<PrintRequest | null>(null);
  const mounted = useRef(false),
    busy = useRef(false),
    pendingRequest = useRef<PrintRequest | null>(null),
    paperElement = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingRequest.current = null;
    };
  }, []);
  const received = useMemo(
    () => officialOrderPaperDataSchema.safeParse(query.data),
    [query.data],
  );
  const cacheData = cache?.data;
  const published = useMemo(
    () => officialOrderPaperDataSchema.safeParse(cacheData),
    [cacheData],
  );
  const eligible =
    !preparing &&
    failure === null &&
    query.isSuccess &&
    query.fetchStatus === "idle" &&
    cache?.status === "success" &&
    cache.fetchStatus === "idle" &&
    !cache.isInvalidated &&
    received.success &&
    published.success &&
    received.data.order.id === orderId &&
    published.data.order.id === orderId &&
    received.data.printVersion === published.data.printVersion &&
    isCurrentP04OperationalScope(client, scope);
  const paper = eligible ? received.data : null;
  const renderedVersion = paper?.printVersion ?? null;
  const { refetch } = query;
  const reload = useCallback(() => {
    if (busy.current || !isCurrentP04OperationalScope(client, scope)) return;
    setFailure(null);
    void refetch();
  }, [client, scope, refetch]);
  useEffect(() => {
    const beforePrint = () => {
      const element = paperElement.current,
        current = currentPaper(client, scope, orderId);
      if (
        element !== null &&
        (current === null ||
          renderedVersion === null ||
          current.printVersion !== renderedVersion ||
          element.dataset["printVersion"] !== String(current.printVersion) ||
          busy.current)
      )
        element.hidden = true;
    };
    const focus = () => {
      reload();
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("focus", focus);
    };
  }, [client, scope, orderId, renderedVersion, reload]);
  useEffect(() => {
    const current = currentPaper(client, scope, orderId);
    if (
      paper !== null &&
      current?.printVersion === paper.printVersion &&
      paperElement.current !== null
    )
      paperElement.current.hidden = false;
  }, [paper, client, scope, orderId]);
  const prepare = async () => {
    if (
      busy.current ||
      paper === null ||
      !isCurrentP04OperationalScope(client, scope)
    )
      return;
    busy.current = true;
    if (paperElement.current !== null) paperElement.current.hidden = true;
    setFailure(null);
    setPreparing(true);
    try {
      const fresh = await client.fetchQuery({
        ...officialOrderPaperOptions(client, scope, orderId),
        staleTime: 0,
      });
      if (!mounted.current || !isCurrentP04OperationalScope(client, scope))
        return;
      const current = currentPaper(client, scope, orderId);
      if (
        current === null ||
        fresh.order.id !== orderId ||
        current.printVersion < fresh.printVersion
      )
        throw new ApiContractError();
      const request = { version: current.printVersion };
      pendingRequest.current = request;
      setPendingPrint(request);
      setPreparing(false);
    } catch (error: unknown) {
      if (!mounted.current || !isCurrentP04OperationalScope(client, scope))
        return;
      pendingRequest.current = null;
      busy.current = false;
      setPendingPrint(null);
      setPreparing(false);
      setFailure(getApiError(error));
    }
  };
  useEffect(() => {
    if (pendingPrint === null) return;
    const frame = window.requestAnimationFrame(() => {
      if (pendingRequest.current !== pendingPrint) return;
      if (!mounted.current || !isCurrentP04OperationalScope(client, scope)) {
        pendingRequest.current = null;
        busy.current = false;
        return;
      }
      const current = currentPaper(client, scope, orderId);
      if (current === null || current.printVersion < pendingPrint.version) {
        pendingRequest.current = null;
        busy.current = false;
        setPendingPrint(null);
        setFailure({
          message: "تغيرت صلاحية بيانات الطباعة؛ أعد تحميل النسخة الحالية.",
          requestId: "",
        });
        return;
      }
      if (current.printVersion > pendingPrint.version) {
        const request = { version: current.printVersion };
        pendingRequest.current = request;
        setPendingPrint(request);
        return;
      }
      if (
        current.printVersion !== pendingPrint.version ||
        paper?.printVersion !== pendingPrint.version ||
        paperElement.current === null ||
        paperElement.current.dataset["printVersion"] !==
          String(pendingPrint.version)
      )
        return;
      // Consume before opening the native dialog, including Strict Mode effect replay.
      pendingRequest.current = null;
      busy.current = false;
      setPendingPrint(null);
      paperElement.current.hidden = false;
      try {
        window.print();
      } catch {
        setFailure({
          message: "تعذّر فتح نافذة الطباعة. أعد المحاولة.",
          requestId: "",
        });
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [client, scope, orderId, pendingPrint, paper]);

  if (paper === null) {
    const pending =
      preparing ||
      query.fetchStatus !== "idle" ||
      cache?.fetchStatus === "fetching";
    const queryError =
      !pending && query.isError ? getApiError(query.error) : null;
    const safe = pending ? null : (failure ?? queryError);
    return (
      <PrintStatus
        kind={safe === null ? "loading" : "error"}
        title={
          preparing
            ? "جارٍ تجهيز الطباعة الرسمية"
            : safe !== null
              ? "أمر التفصيل غير متاح للطباعة"
              : "جارٍ تحميل النسخة الرسمية الحالية"
        }
        message={
          safe === null
            ? "لا تُتاح الورقة قبل نجاح قراءة حالية لصلاحية الطلب واعتماده."
            : (printDenials[queryError?.code ?? ""] ?? safe.message)
        }
        requestId={safe?.requestId}
        onRetry={pending ? undefined : reload}
      />
    );
  }
  const { order, approval, printVersion } = paper;
  return (
    <div
      className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0"
      dir="rtl"
    >
      <div className="mx-auto mb-4 flex max-w-5xl items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
        <div>
          <h1 className="text-sm font-bold text-slate-900">
            معاينة طباعة أمر التفصيل: {order.businessNumber}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            نسخة ورقية رسمية مطابقة لاستمارة المصنع المعتمدة (الحالة:{" "}
            {toSalesOrderStatusLabel(order.status)})
          </p>
        </div>
        <button
          type="button"
          disabled={pendingPrint !== null}
          onClick={() => {
            void prepare();
          }}
          className="btn-pill btn-teal inline-flex items-center gap-1.5 px-4 py-2 text-xs"
        >
          <Printer size={15} />
          <span>طباعة المستند بالعرض (Ctrl + P)</span>
        </button>
      </div>
      <section
        className="mx-auto mb-4 max-w-5xl space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-xs print:hidden"
        aria-label="سجل الاعتماد الرسمي"
      >
        <p>
          الاعتماد الأولي: {approval.initial.actor.fullName} ·{" "}
          {approval.initial.approvedAt} · النسخة {approval.initial.orderVersion}
        </p>
        <ul>
          {approval.pieces.map((stamp) => (
            <li key={stamp.pieceId}>
              اعتماد تعديل القطعة{" "}
              {
                order.pieces.find((piece) => piece.id === stamp.pieceId)
                  ?.position
              }
              : {stamp.actor.fullName} · {stamp.approvedAt} · النسخة{" "}
              {stamp.orderVersion}
            </li>
          ))}
        </ul>
      </section>
      <div
        ref={paperElement}
        data-official-paper="true"
        data-print-version={printVersion}
      >
        <div className="mx-auto max-w-[1400px] overflow-x-auto print:m-0 print:max-w-none print:overflow-visible print:p-0">
          <OrderPaperForm
            order={toSubmittedPaper(order)}
            displayReference={order.businessNumber}
            dataState={toAuthoritativePaperState(order, null)}
            approvalAnnotation={{
              initialActorName: approval.initial.actor.fullName,
              initialApprovedAt: approval.initial.approvedAt,
              orderVersion: printVersion,
              approvedAmendmentCount: approval.pieces.length,
            }}
            mode="print"
            showZoomControls={false}
          />
        </div>
      </div>
    </div>
  );
}
