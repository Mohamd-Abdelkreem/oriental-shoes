"use client";

import { useEffect } from "react";
import { useToast } from "@/components/toast";
import { apiFailureMessage } from "@/services/api/api-client";

export function OrderEditorErrorToast({
  message,
  error,
}: {
  message: string;
  error?: unknown;
}) {
  const { toast } = useToast();
  const description = error === undefined ? "" : apiFailureMessage(error);
  useEffect(() => {
    toast.error(message, description ? { description } : undefined);
  }, [message, error, description, toast]);
  return null;
}
