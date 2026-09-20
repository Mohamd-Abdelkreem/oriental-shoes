import type { Route } from "next";
import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  redirect(("/warehouse/orders/" + encodeURIComponent(orderId)) as Route);
}
