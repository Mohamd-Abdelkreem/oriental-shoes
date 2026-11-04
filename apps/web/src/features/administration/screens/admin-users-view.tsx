"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { UserPlus, UsersRound } from "lucide-react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Department, SafeUser } from "@template/contracts";

import { StaffManagementDialog } from "@/features/administration/components/staff-management-dialog";
import { useStaffList } from "@/features/administration/hooks/staff.hooks";
import { availableStaffOperations } from "@/features/administration/model/staff-management.model";
import {
  OrientalStatusPill,
  OrientalTable,
  statusTone,
} from "@/features/prototype/components/data-table";
import { OrientalFilterBar } from "@/features/prototype/components/filter-bar";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";

export function AdminUsersView({
  pendingOnly = false,
}: {
  pendingOnly?: boolean;
}) {
  // The scope belongs to the route. The identity key discards the previous
  // scope's search and page when the route changes.
  return (
    <StaffDirectoryScreen
      key={pendingOnly ? "pending" : "all"}
      pendingOnly={pendingOnly}
    />
  );
}

type StaffScope = "all" | "pending";

function StaffDirectoryScreen({ pendingOnly }: { pendingOnly: boolean }) {
  const queryClient = useQueryClient();
  const scope: StaffScope = pendingOnly ? "pending" : "all";
  const [listState, setListState] = useState<{ search: string; page: number }>({
    search: "",
    page: 1,
  });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const openedAtRef = useRef(0);

  const list = useStaffList({
    scope,
    search: listState.search,
    page: listState.page,
    limit: STAFF_PAGE_SIZE,
  });

  // The server owns the page count. A stale page is clamped to an available
  // one, and a zero total returns to the first page.
  const serverPagination = list.data?.pagination;
  const availablePage =
    serverPagination === undefined
      ? listState.page
      : serverPagination.totalPages === 0
        ? 1
        : Math.min(listState.page, serverPagination.totalPages);
  if (availablePage !== listState.page) {
    setListState((previous) => ({ ...previous, page: availablePage }));
  }

  const listData = list.data;
  const rows = listData?.staff ?? [];
  const filteredTotal = listData?.pagination.total ?? 0;
  const totalPages = listData?.pagination.totalPages ?? 0;
  const pendingCount = listData?.pendingCount ?? 0;

  const handleSearchChange = (value: string): void => {
    // The accepted search is bounded before the shared query parses it.
    const bounded = value.slice(0, MAX_SEARCH_LENGTH);
    setListState({ search: bounded, page: 1 });
  };

  const handlePageChange = (page: number): void => {
    setListState((previous) => ({ ...previous, page }));
  };

  const openDialog = (staff: SafeUser): void => {
    openedAtRef.current = Date.now();
    setSelectedUserId(staff.id);
  };

  const handleDialogClose = (): void => {
    const target = selectedUserId;
    if (
      target !== null &&
      hasSuccessfulStaffCommand(queryClient, target, openedAtRef.current)
    ) {
      setNotice(STAFF_SUCCESS_NOTICE);
    }
    setSelectedUserId(null);
  };

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / إدارة الموظفين"
        title={
          pendingOnly ? "طلبات تسجيل الموظفين" : "إدارة مستخدمي وموظفي النظام"
        }
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {`${String(filteredTotal)} حساب`}
          </span>
        }
        subtitle="اعتماد طلبات التسجيل، تعيين الصلاحية والقسم النهائي، وإيقاف أو إعادة تفعيل الحسابات"
        actions={
          <div className="flex gap-2">
            {!pendingOnly ? (
              <Link href="/admin/users/pending" className="btn-pill btn-amber">
                <UserPlus size={15} />
                <span>{`طلبات تسجيل الموظفين (${String(pendingCount)})`}</span>
              </Link>
            ) : (
              <Link href="/admin/users" className="btn-pill btn-outline">
                <UsersRound size={15} />
                <span>جميع المستخدمين</span>
              </Link>
            )}
          </div>
        }
      />

      <OrientalFilterBar
        searchValue={listState.search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="ابحث بالاسم، البريد أو رقم الهاتف..."
        totalCount={filteredTotal}
        countLabel="حساب"
      />

      {notice !== null && (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"
          role="status"
        >
          {notice}
        </p>
      )}

      <section
        aria-label="دليل الموظفين"
        data-staff-directory-heading=""
        tabIndex={-1}
        className="space-y-3"
      >
        {list.isError && (
          <div
            className="oriental-table-card p-6 text-center text-xs"
            role="alert"
          >
            <p className="font-semibold text-rose-700">
              تعذّر تحميل قائمة الموظفين.
            </p>
            <button
              type="button"
              className="btn-pill btn-outline mt-3"
              onClick={() => {
                void list.refetch();
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        )}
        {list.isPending ? (
          <div
            className="oriental-table-card p-6 text-center text-xs text-slate-500"
            role="status"
          >
            جارٍ تحميل قائمة الموظفين...
          </div>
        ) : listData === undefined ? null : (
          <>
            {list.isFetching && (
              <p className="text-xs text-slate-500" role="status">
                جارٍ تحديث قائمة الموظفين...
              </p>
            )}
            <OrientalTable
              data={rows}
              keyExtractor={(staff) => staff.id}
              isSearchEmpty={listState.search !== ""}
              emptyTitle={
                listState.search === ""
                  ? "لا توجد حسابات موظفين"
                  : "لا توجد نتائج مطابقة للبحث"
              }
              emptySubtitle={
                listState.search === ""
                  ? "ستظهر حسابات الموظفين هنا فور توفرها."
                  : "جرّب البحث بكلمة أخرى أو امسح البحث."
              }
              columns={[
                {
                  header: "الموظف",
                  render: (staff) => (
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                        {staff.fullName.slice(0, 1)}
                      </div>
                      <div>
                        <strong className="block text-slate-900">
                          {staff.fullName}
                        </strong>
                        <span className="text-xs text-slate-400">
                          {staff.email}
                        </span>
                      </div>
                    </div>
                  ),
                },
                {
                  header: "رقم الهاتف",
                  render: (staff) => (
                    <span className="font-mono text-xs" dir="ltr">
                      {staff.phone ?? "—"}
                    </span>
                  ),
                },
                {
                  header: "القسم المعتمد",
                  render: (staff) => (
                    <span className="text-xs font-semibold text-slate-700">
                      {staff.department === null
                        ? "—"
                        : STAFF_DEPARTMENT_LABELS[staff.department]}
                    </span>
                  ),
                },
                {
                  header: "تاريخ التسجيل",
                  render: (staff) => (
                    <span className="text-xs text-slate-500" dir="ltr">
                      {formatStaffDate(staff.createdAt)}
                    </span>
                  ),
                },
                {
                  header: "الحالة",
                  render: (staff) => (
                    <OrientalStatusPill
                      tone={statusTone(STAFF_STATUS_LABELS[staff.status])}
                    >
                      {STAFF_STATUS_LABELS[staff.status]}
                    </OrientalStatusPill>
                  ),
                },
                {
                  header: "القرار والإجراء",
                  className: "text-left",
                  render: (staff) => {
                    const operations = availableStaffOperations(staff);
                    if (operations.length === 0) {
                      return (
                        <span className="text-xs text-slate-400">عرض فقط</span>
                      );
                    }
                    return (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="btn-pill btn-teal px-3 py-1 text-xs"
                          data-staff-row-action={staff.id}
                          onClick={() => {
                            openDialog(staff);
                          }}
                        >
                          {staff.status === "PENDING_APPROVAL"
                            ? "اعتماد وتعيين القسم"
                            : "إدارة الحساب"}
                        </button>
                      </div>
                    );
                  },
                },
              ]}
              pagination={{
                page: listState.page,
                totalPages,
                total: filteredTotal,
                onPageChange: handlePageChange,
              }}
            />
          </>
        )}
      </section>

      {selectedUserId !== null && (
        <StaffManagementDialog
          key={selectedUserId}
          userId={selectedUserId}
          onClose={handleDialogClose}
        />
      )}
    </div>
  );
}

const STAFF_PAGE_SIZE = 25;
const MAX_SEARCH_LENGTH = 150;

const STAFF_SUCCESS_NOTICE = "تم حفظ قرار الموظف بنجاح.";

const STAFF_STATUS_LABELS: Record<SafeUser["status"], string> = {
  ACTIVE: "فعال",
  PENDING_APPROVAL: "بانتظار الموافقة",
  PENDING_VERIFICATION: "بانتظار توثيق البريد",
  REJECTED: "مرفوض",
  SUSPENDED: "موقوف",
};

const STAFF_DEPARTMENT_LABELS: Record<Department, string> = {
  APPROVAL: "الاعتماد",
  CUTTING: "القص",
  PRODUCTION: "الإنتاج والإصلاح",
  QUALITY: "الجودة والتغليف",
  SALES: "المبيعات",
  WAREHOUSE: "المستودع والتسليم",
};

const STAFF_DATE_FORMATTER = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
});

const formatStaffDate = (value: string): string =>
  STAFF_DATE_FORMATTER.format(new Date(value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * The target of a completed staff command. The variables are inspected
 * structurally, so an unrelated mutation never announces a staff success.
 */
const readStaffCommandTarget = (variables: unknown): string | null => {
  if (!isRecord(variables)) return null;
  const userId = variables["userId"];
  const operation = variables["operation"];
  if (typeof userId !== "string" || typeof operation !== "string") return null;
  return userId;
};

/**
 * The confirmed staff success of the closed dialog. The shared mutation cache
 * owns the receipt, so the screen never invents a second success signal.
 */
const hasSuccessfulStaffCommand = (
  client: QueryClient,
  targetUserId: string,
  since: number,
): boolean =>
  client
    .getMutationCache()
    .getAll()
    .some((mutation) => {
      if (mutation.state.status !== "success") return false;
      if (mutation.state.submittedAt < since) return false;
      return readStaffCommandTarget(mutation.state.variables) === targetUserId;
    });
