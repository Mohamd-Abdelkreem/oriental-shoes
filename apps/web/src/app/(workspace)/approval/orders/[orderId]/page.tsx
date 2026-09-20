import { ApprovalDecisionView } from "@/features/approval/screens/approval-decision-view";

export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <ApprovalDecisionView orderId={orderId} />;
}
