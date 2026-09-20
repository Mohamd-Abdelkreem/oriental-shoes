"use client";

import { useState } from "react";
import type { Role, MvpEmployee } from "@/features/prototype/state/mvp-store";
import { roleLabels } from "@/features/prototype/state/mvp-store";
import { BaseDialog } from "./base-dialog";

type AdminAssignRoleDialogProps = {
  open: boolean;
  onClose: () => void;
  employee: MvpEmployee | null;
  onConfirm: (role: Role, status: string) => void;
};

export function AdminAssignRoleDialog(props: AdminAssignRoleDialogProps) {
  if (!props.employee) return null;
  return (
    <AdminAssignRoleDialogContent
      key={props.employee.email}
      {...props}
      employee={props.employee}
    />
  );
}

function AdminAssignRoleDialogContent({
  open,
  onClose,
  employee,
  onConfirm,
}: Omit<AdminAssignRoleDialogProps, "employee"> & { employee: MvpEmployee }) {
  const [role, setRole] = useState<Role>(employee.role ?? employee.requested);
  const [status, setStatus] = useState<string>(
    employee.status === "بانتظار الموافقة" ? "فعال" : employee.status,
  );
  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title={
        employee.status === "بانتظار الموافقة"
          ? "اعتماد الموظف وتعيين صلاحية القسم"
          : `إدارة حساب: ${employee.name}`
      }
      subtitle={`البريد: ${employee.email} · الهاتف: ${employee.phone}`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-teal"
            onClick={() => {
              onConfirm(role, status);
              onClose();
            }}
          >
            حفظ واعتماد الصلاحيات
          </button>
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={onClose}
          >
            إلغاء
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-700">
        <div>
          <span className="mb-1 block text-xs text-slate-500">اسم الموظف:</span>
          <strong className="text-slate-800">{employee.name}</strong>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            الدور والقسم المعتمد لهذا الموظف:
          </span>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role);
            }}
            className="oriental-input w-full"
          >
            {Object.entries(roleLabels).map(([key, lbl]) => (
              <option key={key} value={key}>
                {lbl}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            حالة الحساب:
          </span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
            }}
            className="oriental-input w-full"
          >
            <option value="فعال">فعال (نشط)</option>
            <option value="موقوف">موقوف مؤقتاً</option>
            <option value="مرفوض">مرفوض</option>
          </select>
        </label>
      </div>
    </BaseDialog>
  );
}
