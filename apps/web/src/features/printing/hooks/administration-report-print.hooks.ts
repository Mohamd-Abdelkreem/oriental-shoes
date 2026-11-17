"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  hashKey,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  administrationReportPrintDataSchema,
  administrationReportPrintQuerySchema,
  type AdministrationReportPrintQuery,
} from "@template/contracts";
import { ApiContractError } from "@/services/api/api-client";
import {
  administrationKeys,
  useAdministrationReportPrint,
} from "@/features/administration/hooks/administration.hooks";
import { administrationFailureMessage } from "@/features/administration/model/administration-form.model";
import {
  isCurrentAdministrationOperationalScope,
  useAdministrationOperationalScope,
  type AdministrationOperationalScope as Scope,
} from "@/shared/query/operational-scope";

type PrintRequest = Readonly<{ source: unknown; key: string; token: string }>;
const noServerSnapshot = () => undefined;
function useReportCache(client: QueryClient, key: QueryKey) {
  const keyHash = hashKey(key);
  const subscribe = useCallback(
    (notify: () => void) =>
      client
        .getQueryCache()
        .subscribe((event: { query: { queryKey: QueryKey } }) => {
          if (hashKey(event.query.queryKey) === keyHash) notify();
        }),
    [client, keyHash],
  );
  const snapshot = useCallback(() => client.getQueryState(key), [client, key]);
  return useSyncExternalStore(subscribe, snapshot, noServerSnapshot);
}
const validatedSnapshot = (
  raw: unknown,
  scope: Scope,
  query: AdministrationReportPrintQuery,
) => {
  const parsed = administrationReportPrintDataSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.meta.generatedBy.id !== scope.actorId ||
    JSON.stringify(parsed.data.meta.filters) !== JSON.stringify(query) ||
    parsed.data.workforce.scope.department !== (query.department ?? null) ||
    new Set(parsed.data.departments.map((entry) => entry.department)).size !==
      parsed.data.departments.length
  )
    return null;
  return parsed.data;
};
const currentReport = (
  client: QueryClient,
  scope: Scope,
  query: AdministrationReportPrintQuery,
) => {
  if (!isCurrentAdministrationOperationalScope(client, scope)) return null;
  const state = client.getQueryState(
    administrationKeys.reportPrint(scope, query),
  );
  if (
    state?.status !== "success" ||
    state.fetchStatus !== "idle" ||
    state.isInvalidated
  )
    return null;
  const parsed = validatedSnapshot(state.data, scope, query);
  return parsed === null ? null : { source: state.data, data: parsed };
};
export const useAdministrationReportPrintController = (
  input: AdministrationReportPrintQuery | null,
) => {
  const client = useQueryClient(),
    current = useAdministrationOperationalScope();
  const scope = useMemo<Scope>(
    () => ({
      actorId: current?.actorId ?? "",
      accessVersion: current?.accessVersion ?? 0,
      epoch: current?.epoch ?? -1,
      capability: "ADMINISTRATION",
    }),
    [current?.actorId, current?.accessVersion, current?.epoch],
  );
  const captured = JSON.stringify(input);
  const normalized = useMemo(() => {
    const raw: unknown = JSON.parse(captured);
    const parsed = administrationReportPrintQuerySchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }, [captured]);
  const filters = JSON.stringify(normalized);
  const key = useMemo(
    () =>
      administrationKeys.reportPrint(
        {
          actorId: scope.actorId,
          accessVersion: scope.accessVersion,
          epoch: scope.epoch,
          capability: "ADMINISTRATION",
        },
        administrationReportPrintQuerySchema.parse(JSON.parse(filters) ?? {}),
      ),
    [filters, scope.actorId, scope.accessVersion, scope.epoch],
  );
  const keyHash = hashKey(key),
    query = useAdministrationReportPrint(normalized),
    cache = useReportCache(client, key);
  const [preparation, setPreparation] = useState<{
    key: string;
    active: boolean;
  }>({ key: keyHash, active: false });
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(
      null,
    ),
    [pending, setPending] = useState<PrintRequest | null>(null);
  const mounted = useRef(false),
    busy = useRef(false),
    activeKey = useRef(keyHash),
    pendingRequest = useRef<PrintRequest | null>(null),
    grant = useRef<PrintRequest | null>(null),
    sequence = useRef(0),
    renderedSource = useRef<unknown>(undefined),
    paperRef = useRef<HTMLDivElement | null>(null);
  const explicitFailure = failed?.key === keyHash ? failed.message : null,
    preparing = preparation.key === keyHash && preparation.active;
  const hasScope = current !== null;
  const published = useMemo(
    () =>
      hasScope && normalized !== null && cache !== undefined
        ? currentReport(client, scope, normalized)
        : null,
    [client, cache, scope, normalized, hasScope],
  );
  const malformed =
    current !== null &&
    normalized !== null &&
    cache?.data !== undefined &&
    cache.status === "success" &&
    cache.fetchStatus === "idle" &&
    !cache.isInvalidated &&
    published === null;
  const failure =
    explicitFailure ??
    (query.isError
      ? administrationFailureMessage(query.error, "report")
      : null) ??
    (malformed
      ? "تعذر التحقق من نطاق التقرير وبياناته؛ أعد تحميل النسخة الحالية."
      : null);
  const eligible =
    current !== null &&
    normalized !== null &&
    !preparing &&
    failure === null &&
    query.isSuccess &&
    query.fetchStatus === "idle" &&
    published !== null;
  const report = eligible ? published.data : undefined;
  useEffect(() => {
    mounted.current = true;
    activeKey.current = keyHash;
    return () => {
      mounted.current = false;
      busy.current = false;
      pendingRequest.current = null;
      grant.current = null;
    };
  }, [keyHash]);
  useLayoutEffect(() => {
    renderedSource.current = eligible ? published.source : undefined;
    const element = paperRef.current;
    if (element !== null) {
      element.hidden = !eligible;
      const binding = pendingRequest.current ?? grant.current;
      element.dataset["reportToken"] =
        binding?.key === keyHash && binding.source === published?.source
          ? binding.token
          : "preview";
    }
  }, [eligible, published, pending, keyHash]);
  const { refetch } = query;
  const reload = useCallback(() => {
    if (
      busy.current ||
      current === null ||
      normalized === null ||
      !isCurrentAdministrationOperationalScope(client, scope)
    )
      return;
    const queryKey = administrationKeys.reportPrint(scope, normalized),
      state = client.getQueryState(queryKey);
    if (
      state?.data !== undefined &&
      validatedSnapshot(state.data, scope, normalized) === null
    )
      client.getQueryCache().find({ queryKey, exact: true })?.reset();
    setFailed(null);
    void refetch();
  }, [client, current, normalized, refetch, scope]);
  const prepare = async (): Promise<void> => {
    if (busy.current || !eligible) return;
    busy.current = true;
    grant.current = null;
    if (paperRef.current) paperRef.current.hidden = true;
    setFailed(null);
    setPreparation({ key: keyHash, active: true });
    try {
      await refetch({ throwOnError: true, cancelRefetch: false });
      if (
        !mounted.current ||
        activeKey.current !== keyHash ||
        !isCurrentAdministrationOperationalScope(client, scope)
      )
        return;
      const fresh = currentReport(client, scope, normalized);
      if (fresh === null) throw new ApiContractError();
      sequence.current += 1;
      const request = {
        source: fresh.source,
        key: keyHash,
        token: String(sequence.current),
      };
      pendingRequest.current = request;
      setPending(request);
      setPreparation({ key: keyHash, active: false });
    } catch (error: unknown) {
      if (
        !mounted.current ||
        activeKey.current !== keyHash ||
        !isCurrentAdministrationOperationalScope(client, scope)
      )
        return;
      busy.current = false;
      pendingRequest.current = null;
      setPending(null);
      setPreparation({ key: keyHash, active: false });
      setFailed({
        key: keyHash,
        message: administrationFailureMessage(error, "report"),
      });
    }
  };
  useEffect(() => {
    if (pending === null || pending.key !== keyHash || normalized === null)
      return;
    const frame = window.requestAnimationFrame(() => {
      if (pendingRequest.current !== pending) return;
      const latest = currentReport(client, scope, normalized),
        element = paperRef.current;
      if (
        !mounted.current ||
        activeKey.current !== keyHash ||
        latest === null ||
        latest.source !== pending.source ||
        renderedSource.current !== pending.source ||
        element === null ||
        element.dataset["reportToken"] !== pending.token
      ) {
        pendingRequest.current = null;
        busy.current = false;
        setPending(null);
        setFailed({
          key: keyHash,
          message:
            "تغيرت بيانات التقرير أو صلاحيته؛ أعد تحميل النسخة الحالية قبل الطباعة.",
        });
        return;
      }
      pendingRequest.current = null;
      grant.current = pending;
      setPending(null);
      element.hidden = false;
      try {
        window.print();
      } catch (error: unknown) {
        busy.current = false;
        grant.current = null;
        element.hidden = true;
        setFailed({
          key: keyHash,
          message: administrationFailureMessage(error, "report"),
        });
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [client, keyHash, normalized, pending, scope]);
  useEffect(() => {
    const beforePrint = () => {
      const element = paperRef.current,
        latest =
          normalized === null ? null : currentReport(client, scope, normalized),
        allowed = grant.current;
      if (
        element !== null &&
        (allowed === null ||
          allowed.key !== keyHash ||
          latest === null ||
          latest.source !== allowed.source ||
          renderedSource.current !== allowed.source ||
          element.dataset["reportToken"] !== allowed.token)
      )
        element.hidden = true;
    };
    const afterPrint = () => {
      const completed = grant.current;
      grant.current = null;
      if (completed !== null) {
        busy.current = false;
        setPending(null);
      }
      const latest =
        normalized === null ? null : currentReport(client, scope, normalized);
      if (
        !busy.current &&
        paperRef.current !== null &&
        latest !== null &&
        latest.source === renderedSource.current
      )
        paperRef.current.hidden = false;
    };
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        void prepare();
      }
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    window.addEventListener("keydown", keydown);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("focus", reload);
    };
  });
  return {
    query: { ...query, data: report },
    eligible,
    preparing,
    failure,
    prepare,
    reload,
    paperRef,
  };
};
