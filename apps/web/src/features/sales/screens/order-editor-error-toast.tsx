"use client";

import { useEffect } from "react";
import { useToast } from "@/components/toast";
import { getApiError } from "@/services/api/api-client";

export function OrderEditorErrorToast({
  message,
  error,
}: {
  message: string;
  error?: unknown;
}) {
  const { toast } = useToast();
  const requestId = error === undefined ? "" : getApiError(error).requestId;
  useEffect(() => {
    toast.error(
      message,
      requestId ? { description: `رقم المتابعة: ${requestId}` } : undefined,
    );
  }, [message, error, requestId, toast]);
  return null;
}
