"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  warehouseOrderDataSchema,
  type WarehouseCommandData,
  type WarehouseOrderData,
} from "@template/contracts";
import {
  useWarehouseOperationalScope,
  isCurrentWarehouseOperationalScope,
} from "@/shared/query/operational-scope";
import { ApiContractError, getApiError } from "@/services/api/api-client";
import { fetchWarehouseOrder, warehouseKeys } from "./warehouse.hooks";
import { useWarehouseCommand } from "./warehouse-commands.hooks";
import {
  captureWarehouseReceipt,
  captureWarehouseWholeOrders,
  reviewWarehouseSelection,
} from "../model/warehouse-selection.model";
import {
  resolveWarehouseTargets,
  type WarehouseConfirmationController,
  type WarehouseReadAvailability,
  type WarehouseReview,
} from "../model/warehouse-view.model";
import {
  toWarehouseCommand,
  warehouseFailureMessage,
} from "../model/warehouse-form.model";
import { WarehouseLocalCommandError } from "../model/warehouse-command-state";

/** Mount under the route/filter/scope lifetime key. Captured callbacks cannot outlive that owner. */
export function useWarehouseConfirmation(
  readAvailability: WarehouseReadAvailability,
  onSuccess?: (result: WarehouseCommandData) => void,
): WarehouseConfirmationController {
  const client = useQueryClient(),
    scope = useWarehouseOperationalScope(),
    command = useWarehouseCommand();
  const [review, setReview] = useState<WarehouseReview | null>(null),
    [preparing, setPreparing] = useState(false),
    [failure, setFailure] = useState<string | null>(null),
    [reviewRequired, setReviewRequired] = useState(false);
  const mounted = useRef(false),
    preparation = useRef<object | null>(null),
    currentReview = useRef<WarehouseReview | null>(null),
    submitting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      preparation.current = null;
      currentReview.current = null;
    };
  }, []);
  const valid = () =>
    mounted.current &&
    scope !== null &&
    isCurrentWarehouseOperationalScope(client, scope);
  const idle = () =>
    scope !== null &&
    (client.getQueryData<{ phase: string }>([
      ...warehouseKeys.root(scope),
      "command-session",
    ])?.phase ?? "idle") === "idle";
  const publish = (value: WarehouseReview | null) => {
    currentReview.current = value;
    setReview(value);
  };
  const load = async (
    ids: readonly string[],
    token: object,
  ): Promise<WarehouseOrderData[]> => {
    if (
      !scope ||
      ids.length === 0 ||
      ids.length > 200 ||
      new Set(ids).size !== ids.length
    )
      throw new ApiContractError();
    const details: WarehouseOrderData[] = [];
    for (const id of [...ids].sort()) {
      if (!valid() || preparation.current !== token || !idle())
        throw new WarehouseLocalCommandError("MISMATCH");
      details.push(await fetchWarehouseOrder(client, scope, id));
    }
    if (!valid() || preparation.current !== token || !idle())
      throw new WarehouseLocalCommandError("MISMATCH");
    return details;
  };
  const close = () => {
    preparation.current = null;
    publish(null);
    setPreparing(false);
    setFailure(null);
    setReviewRequired(false);
  };
  return {
    review: scope !== null ? review : null,
    preparing,
    failure: scope !== null ? failure : null,
    reviewRequired,
    close,
    open: async (operation, targets) => {
      if (
        !valid() ||
        !idle() ||
        preparation.current ||
        submitting.current ||
        readAvailability !== "ready"
      )
        return;
      const token = {},
        captured = targets.map((target) => ({ ...target }));
      preparation.current = token;
      setPreparing(true);
      setFailure(null);
      try {
        if (
          captured.length === 0 ||
          captured.length > 200 ||
          new Set(captured.map((t) => t.pieceId)).size !== captured.length
        )
          throw new ApiContractError();
        const details = await load(
          [...new Set(captured.map((t) => t.orderId))],
          token,
        );
        const next =
          operation === "RECEIVE"
            ? captureWarehouseReceipt(
                details.flatMap((detail) =>
                  resolveWarehouseTargets(
                    detail,
                    captured.filter((t) => t.orderId === detail.summary.id),
                  ),
                ),
              )
            : captureWarehouseWholeOrders(operation, details, captured);
        if (valid() && preparation.current === token && idle()) {
          publish(next);
          setReviewRequired(false);
        }
      } catch (error: unknown) {
        if (valid() && preparation.current === token)
          setFailure(warehouseFailureMessage(error, "review"));
      } finally {
        if (valid() && preparation.current === token) {
          preparation.current = null;
          setPreparing(false);
        }
      }
    },
    reviewCurrent: async () => {
      const previous = currentReview.current;
      if (
        !previous ||
        !valid() ||
        !idle() ||
        preparation.current ||
        submitting.current
      )
        return;
      const token = {};
      preparation.current = token;
      setPreparing(true);
      try {
        const details = await load(
          previous.orders.map((o) => o.orderId),
          token,
        );
        const next = reviewWarehouseSelection(previous, details);
        if (
          currentReview.current === previous &&
          valid() &&
          preparation.current === token
        ) {
          publish(next);
          setReviewRequired(false);
          setFailure(null);
        }
      } catch (error: unknown) {
        if (valid() && preparation.current === token) {
          setFailure(warehouseFailureMessage(error, "review"));
          setReviewRequired(true);
        }
        throw error;
      } finally {
        if (valid() && preparation.current === token) {
          preparation.current = null;
          setPreparing(false);
        }
      }
    },
    confirm: async (values) => {
      const captured = review;
      if (
        !captured ||
        currentReview.current !== captured ||
        !valid() ||
        !idle() ||
        preparation.current ||
        submitting.current ||
        reviewRequired ||
        readAvailability !== "ready" ||
        !scope
      )
        throw new WarehouseLocalCommandError("BUSY");
      let body;
      try {
        const details = captured.orders.map((order) => {
          const key = warehouseKeys.order(scope, order.orderId),
            state = client.getQueryState(key);
          if (
            !state ||
            state.fetchStatus === "fetching" ||
            state.status !== "success" ||
            state.isInvalidated
          )
            throw new WarehouseLocalCommandError("MISMATCH");
          return warehouseOrderDataSchema.parse(client.getQueryData(key));
        });
        const checked = reviewWarehouseSelection(captured, details);
        if (
          checked.orders.some((order, index) => {
            const original = captured.orders[index];
            return (
              !original ||
              order.orderId !== original.orderId ||
              order.expectedVersion !== original.expectedVersion ||
              order.pieceIds.join() !== original.pieceIds.join() ||
              ("attemptId" in order &&
                "attemptId" in original &&
                order.attemptId !== original.attemptId)
            );
          })
        )
          throw new WarehouseLocalCommandError("MISMATCH");
        // Validate all editable values before allocating an intent identifier.
        toWarehouseCommand(
          values,
          captured,
          "00000000-0000-4000-8000-000000000000",
        );
        body = toWarehouseCommand(values, captured, crypto.randomUUID());
      } catch (error: unknown) {
        if (valid()) {
          setFailure(warehouseFailureMessage(error, "review"));
          setReviewRequired(true);
        }
        // No intent exists yet. A failed local read/recheck is never an unknown POST.
        throw new WarehouseLocalCommandError("MISMATCH");
      }
      submitting.current = true;
      setFailure(null);
      try {
        const result = await command.submit(body);
        if (valid() && currentReview.current === captured) {
          close();
          onSuccess?.(result);
        }
      } catch (error: unknown) {
        if (valid() && currentReview.current === captured) {
          setFailure(warehouseFailureMessage(error, captured.operation));
          const code = getApiError(error).code;
          if (
            code.includes("CONFLICT") ||
            code.includes("VERSION") ||
            code.includes("INELIGIBLE") ||
            code.includes("ATTEMPT") ||
            code.includes("SCOPE")
          )
            setReviewRequired(true);
        }
        throw error;
      } finally {
        submitting.current = false;
      }
    },
  };
}
