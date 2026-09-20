"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, UsersRound } from "lucide-react";
import {
  roleLabels,
  useMvpStore,
  type MvpEmployee,
  type Role,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalFilterBar } from "@/features/prototype/components/filter-bar";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";

export function AdminUsersView({
  pendingOnly = false,
}: {
  pendingOnly?: boolean;
}) {
  const store = useMvpStore();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<MvpEmployee | null>(null);

  const displayedUsers = store.employees.filter((emp) => {
    if (pendingOnly && emp.status !== "بانتظار الموافقة") return false;
    return (
      emp.name.toLowerCase().includes(search.toLowerCase()) ||
      emp.email.toLowerCase().includes(search.toLowerCase()) ||
      emp.phone.includes(search)
    );
  });

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / إدارة الموظفين"
        title={
          pendingOnly ? "طلبات تسجيل الموظفين" : "إدارة مستخدمي وموظفي النظام"
        }
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {displayedUsers.length} حساب
          </span>
        }
        subtitle="اعتماد طلبات التسجيل، تعيين الصلاحية والقسم النهائي، وإيقاف أو إعادة تفعيل الحسابات"
        actions={
          <div className="flex gap-2">
            {!pendingOnly ? (
              <Link href="/admin/users/pending" className="btn-pill btn-amber">
                <UserPlus size={15} />
                <span>
                  طلبات تسجيل الموظفين (
                  {
                    store.employees.filter(
                      (e) => e.status === "بانتظار الموافقة",
                    ).length
                  }
                  )
                </span>
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
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ابحث بالاسم، البريد أو رقم الهاتف..."
        totalCount={displayedUsers.length}
      />

      <OrientalTable
        data={displayedUsers}
        keyExtractor={(u) => u.email}
        columns={[
          {
            header: "الموظف",
            render: (u) => (
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                  {u.name.slice(0, 1)}
                </div>
                <div>
                  <strong className="block text-slate-900">{u.name}</strong>
                  <span className="text-xs text-slate-400">{u.email}</span>
                </div>
              </div>
            ),
          },
          {
            header: "رقم الهاتف",
            render: (u) => (
              <span className="font-mono text-xs" dir="ltr">
                {u.phone}
              </span>
            ),
          },
          {
            header: "القسم المطلوب / النهائي",
            render: (u) => (
              <span className="text-xs font-semibold text-slate-700">
                {u.role
                  ? roleLabels[u.role]
                  : `${roleLabels[u.requested]} (مطلوب)`}
              </span>
            ),
          },
          {
            header: "تاريخ التسجيل",
            accessor: "registered",
            className: "text-xs text-slate-500",
          },
          {
            header: "الحالة",
            render: (u) => (
              <OrientalStatusPill tone={statusTone(u.status)}>
                {u.status}
              </OrientalStatusPill>
            ),
          },
          {
            header: "القرار والإجراء",
            className: "text-left",
            render: (u) => (
              <div className="flex items-center justify-end gap-2">
                {u.status === "بانتظار الموافقة" ? (
                  <>
                    <button
                      type="button"
                      className="btn-pill btn-teal px-3 py-1 text-xs"
                      onClick={() => {
                        setSelectedUser(u);
                      }}
                    >
                      اعتماد وتعيين القسم
                    </button>
                    <button
                      type="button"
                      className="btn-pill btn-outline px-3 py-1 text-xs text-rose-600"
                      onClick={() => {
                        store.patchEmployee(u.email, { status: "مرفوض" });
                      }}
                    >
                      رفض
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-pill btn-outline px-3 py-1 text-xs"
                    onClick={() => {
                      setSelectedUser(u);
                    }}
                  >
                    إدارة الحساب
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />

      {/* Edit / Approve Modal */}
      {selectedUser && (
        <div
          className="oriental-modal-backdrop"
          onClick={() => {
            setSelectedUser(null);
          }}
        >
          <div
            className="oriental-modal-container max-w-md"
            onClick={(e) => {
              e.stopPropagation();
            }}
            dir="rtl"
          >
            <div className="oriental-modal-header">
              <h2 className="oriental-modal-title">
                {selectedUser.status === "بانتظار الموافقة"
                  ? "اعتماد الموظف وتعيين صلاحية القسم"
                  : `إدارة حساب: ${selectedUser.name}`}
              </h2>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const approvedRole = form.get("role") as Role;
                const newStatus =
                  selectedUser.status === "بانتظار الموافقة"
                    ? "فعال"
                    : selectedUser.status;

                store.patchEmployee(selectedUser.email, {
                  role: approvedRole,
                  status: newStatus,
                });
                setSelectedUser(null);
              }}
              className="space-y-4 p-5 text-sm"
            >
              <div>
                <span className="mb-1 block text-xs text-slate-500">
                  اسم الموظف:
                </span>
                <strong className="text-slate-800">{selectedUser.name}</strong>
              </div>

              <div>
                <span className="mb-1 block text-xs text-slate-500">
                  البريد الإلكتروني:
                </span>
                <span className="text-slate-700">{selectedUser.email}</span>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-700">
                  الدور النهائي المعتمد لهذا الموظف:
                </span>
                <select
                  name="role"
                  defaultValue={selectedUser.role || selectedUser.requested}
                  className="oriental-input w-full"
                >
                  {Object.entries(roleLabels).map(([key, lbl]) => (
                    <option key={key} value={key}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end gap-2 border-t pt-3">
                {selectedUser.status !== "بانتظار الموافقة" && (
                  <button
                    type="button"
                    className={`btn-pill text-xs ${
                      selectedUser.status === "موقوف" ? "btn-teal" : "btn-rose"
                    }`}
                    onClick={() => {
                      store.patchEmployee(selectedUser.email, {
                        status:
                          selectedUser.status === "موقوف" ? "فعال" : "موقوف",
                      });
                      setSelectedUser(null);
                    }}
                  >
                    {selectedUser.status === "موقوف"
                      ? "إعادة تفعيل الحساب"
                      : "إيقاف الحساب مؤقتاً"}
                  </button>
                )}

                <button type="submit" className="btn-pill btn-teal">
                  حفظ وتأكيد
                </button>
                <button
                  type="button"
                  className="btn-pill btn-outline"
                  onClick={() => {
                    setSelectedUser(null);
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
