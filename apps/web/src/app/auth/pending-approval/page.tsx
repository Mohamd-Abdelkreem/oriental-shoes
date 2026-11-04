import { AccountStateRoute } from "@/components/auth/account-state-route";
import { PendingApprovalView } from "@/features/prototype/screens/auth-views";

export default function Page() {
  return (
    <AccountStateRoute status="PENDING_APPROVAL">
      <PendingApprovalView />
    </AccountStateRoute>
  );
}
