import { ApprovalDecisionView } from "@/features/approval/screens/approval-decision-view";
import { administrationApprovalListHref } from "@/features/administration/model/administration-query.model";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ list?: string | string[] }>;
}) {
  const [{ orderId }, { list }] = await Promise.all([params, searchParams]);
  return (
    <ApprovalDecisionView
      orderId={orderId}
      administrationListHref={administrationApprovalListHref(
        typeof list === "string" ? list : undefined,
      )}
    />
  );
}
