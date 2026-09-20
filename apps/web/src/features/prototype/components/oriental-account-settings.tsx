import { PasswordForm } from "@/features/account/components/password-form";
import { SessionControls } from "@/features/account/components/session-controls";
import { ProfileForm } from "@/features/users/components/profile-form";
import {
  roleNames,
  type Role,
} from "@/features/prototype/fixtures/prototype-data";
import { PageHeader } from "./page-header";

export function OrientalAccountSettings({ role }: { role: Role }) {
  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        eyebrow={`${roleNames[role]} / الملف الشخصي`}
        title="إعدادات الحساب الشخصي"
        subtitle="إدارة بياناتك الشخصية المسجلة وتحديث كلمة المرور"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProfileForm variant="oriental" />
        <PasswordForm variant="oriental" />
      </div>
      <SessionControls variant="oriental" />
    </div>
  );
}
