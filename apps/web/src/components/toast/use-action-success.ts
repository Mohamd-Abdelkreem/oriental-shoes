"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "./toast-context";

export type ActionSuccess = { message: string; destination: Route };

export function useActionSuccess() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  return ({ message, destination }: ActionSuccess) => {
    toast.success(message);
    if (pathname !== destination) router.push(destination);
  };
}
