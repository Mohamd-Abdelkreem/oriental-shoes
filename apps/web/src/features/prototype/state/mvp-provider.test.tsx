import assert from "node:assert/strict";
import type { ReactNode } from "react";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MvpStoreProvider, useMvpStore } from "./mvp-provider";
import { initialSnapshot, storageKey } from "./mvp-selectors";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MvpStoreProvider>{children}</MvpStoreProvider>
);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe("saved workspace recovery", () => {
  it("moves retired department assignments to production while preserving orders and history", async () => {
    const original = initialSnapshot();
    const order = original.orders[0];
    assert.ok(order);
    const piece = order.items[0];
    assert.ok(piece);
    const saved = {
      ...original,
      sessionRole: "special",
      extraWorkspaceNote: "keep workspace metadata",
      employees: [
        { ...original.employees[0], role: "special", requested: "special" },
        ...original.employees.slice(1),
      ],
      orders: [
        {
          ...order,
          stage: "العمليات الخاصة",
          status: "بالعمليات الخاصة",
          extraOrderNote: "keep order metadata",
          items: [
            {
              ...piece,
              currentLocation: "في العمليات الخاصة",
              specialOpNote: "keep original technical instructions",
              problem: {
                reportedByDept: "قسم العمليات الخاصة",
                reportedByWorker: "Original worker",
                reason: "Original reason",
                notes: "Original notes",
                reportedAt: "2026-10-29",
              },
              rejection: {
                responsibleDept: "العمليات الخاصة",
                reason: "Original rejection",
                notes: "Original correction instructions",
                cycle: 2,
                returnedAt: "2026-10-29",
              },
            },
            ...order.items.slice(1),
          ],
          segments: [
            {
              id: "retired-segment",
              itemId: piece.id,
              stage: "العمليات الخاصة",
              quantity: 1,
              state: "قيد التنفيذ",
              source: "العمليات الخاصة",
              worker: "Original worker",
              note: "Original instructions",
            },
          ],
          corrections: [
            {
              id: "retired-correction",
              itemId: piece.id,
              segmentId: "retired-segment",
              quantity: 1,
              responsible: "العمليات الخاصة",
              reason: "Original rejection",
              instructions: "Original correction instructions",
              cycle: 2,
            },
          ],
        },
        ...original.orders.slice(1),
      ],
      events: [
        {
          id: "historical-event",
          orderId: order.id,
          event: "استلام في العمليات الخاصة",
          actor: "Original worker",
          role: "العمليات الخاصة",
          time: "2026-10-29",
          destination: "العمليات الخاصة",
        },
        ...original.events,
      ],
    };
    localStorage.setItem(storageKey, JSON.stringify(saved));

    const { result, unmount } = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(result.current.sessionRole).toBe("production");
    });

    const migratedOrder = result.current.orders[0];
    assert.ok(migratedOrder);
    const savedOrder = saved.orders[0];
    assert.ok(savedOrder);
    expect(migratedOrder).toMatchObject({
      id: order.id,
      stage: "الإنتاج والإصلاح",
      status: "قيد الإنتاج",
      extraOrderNote: "keep order metadata",
    });
    expect(migratedOrder.items[0]).toMatchObject({
      id: piece.id,
      currentLocation: "في الإنتاج",
      specialOpNote: "keep original technical instructions",
      problem: {
        reportedByDept: "قسم الإنتاج والإصلاح",
        notes: "Original notes",
      },
      rejection: { responsibleDept: "الإنتاج والإصلاح", cycle: 2 },
    });
    expect(migratedOrder.segments[0]).toEqual({
      ...savedOrder.segments[0],
      stage: "الإنتاج والإصلاح",
      source: "الإنتاج والإصلاح",
    });
    expect(migratedOrder.corrections?.[0]).toEqual({
      ...savedOrder.corrections?.[0],
      responsible: "الإنتاج والإصلاح",
    });
    expect(result.current.employees[0]).toMatchObject({
      name: saved.employees[0]?.name,
      role: "production",
      requested: "production",
    });
    expect(result.current.orders.slice(1)).toEqual(original.orders.slice(1));
    expect(result.current.events).toEqual(saved.events);
    expect(result.current.customers).toEqual(original.customers);
    await waitFor(() => {
      expect(
        JSON.parse(localStorage.getItem(storageKey) ?? "null"),
      ).toMatchObject({
        sessionRole: "production",
        extraWorkspaceNote: saved.extraWorkspaceNote,
        events: saved.events,
      });
    });

    const persisted = localStorage.getItem(storageKey);
    unmount();
    const remounted = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(remounted.result.current.sessionRole).toBe("production");
    });
    expect(localStorage.getItem(storageKey)).toBe(persisted);
  });

  it.each([
    "{invalid-json",
    JSON.stringify({
      ...initialSnapshot(),
      orders: [{ id: "incomplete-order" }],
    }),
    JSON.stringify({ ...initialSnapshot(), employees: null }),
  ])(
    "keeps an unreadable snapshot intact and shows a recovery error (%#)",
    async (saved) => {
      localStorage.setItem(storageKey, saved);

      render(
        <MvpStoreProvider>
          <p>Workspace ready</p>
        </MvpStoreProvider>,
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "بياناتك الأصلية لم تتغيّر",
      );
      expect(screen.queryByText("Workspace ready")).not.toBeInTheDocument();
      expect(localStorage.getItem(storageKey)).toBe(saved);
    },
  );

  it("transfers selected production pieces directly to quality without changing their siblings", async () => {
    const { result } = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem(storageKey)).not.toBeNull();
    });
    const order = result.current.orders.find(
      (candidate) => candidate.id === "EXTERNAL-2026-0004",
    );
    assert.ok(order);
    const selected = order.items[0];
    assert.ok(selected);

    act(() => {
      result.current.completeAndTransferPieces(
        order.id,
        [selected.id],
        "الجودة والتغليف",
      );
    });

    const updated = result.current.orders.find(
      (candidate) => candidate.id === order.id,
    );
    assert.ok(updated);
    expect(updated.items[0]).toMatchObject({
      currentLocation: "في الجودة",
      deptStatus: "جاهزة للفحص",
    });
    expect(updated.items.slice(1)).toEqual(order.items.slice(1));
    expect(result.current.events[0]).toMatchObject({
      orderId: order.id,
      quantity: 1,
    });
  });
});
