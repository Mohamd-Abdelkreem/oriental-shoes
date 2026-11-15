import type { Route } from "next";
import { redirect } from "next/navigation";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{
    pieceId?: string | string[];
    tab?: string | string[];
  }>;
}) {
  const { orderId } = await params;
  const search = await searchParams,
    query = new URLSearchParams();
  for (const key of ["pieceId", "tab"] as const) {
    const value = search[key];
    if (typeof value === "string") query.append(key, value);
    else if (Array.isArray(value))
      for (const member of value) query.append(key, member);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(
    ("/warehouse/orders/" + encodeURIComponent(orderId) + suffix) as Route,
  );
}
