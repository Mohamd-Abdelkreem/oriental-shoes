"use client";

import { useEffect } from "react";
import { useToast } from "./toast-context";

export function useCommandSuccessToast(
  message: string | null,
  acknowledge: () => boolean,
) {
  const { toast } = useToast();
  useEffect(() => {
    if (message && acknowledge()) toast.success(message);
  }, [message, acknowledge, toast]);
}
