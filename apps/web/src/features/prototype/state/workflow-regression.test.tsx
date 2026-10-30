import assert from "node:assert/strict";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";

import { MvpStoreProvider, useMvpStore } from "./mvp-provider";
import { storageKey } from "./mvp-selectors";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MvpStoreProvider>{children}</MvpStoreProvider>
);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

it.each([1, 2, 3])(
  "transfers the completed production quantity %i without losing or duplicating pieces",
  async (quantity) => {
    const { result } = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem(storageKey)).not.toBeNull();
    });
    const order = result.current.orders.find(
      (candidate) => candidate.id === "EXTERNAL-2026-0005",
    );
    assert.ok(order);
    const segment = order.segments.find(
      (candidate) => candidate.stage === "الإنتاج والإصلاح",
    );
    assert.ok(segment);

    const previousEvents = result.current.events;
    act(() => {
      result.current.completeManufacturingSegment({
        orderId: order.id,
        segmentId: segment.id,
        quantity,
        actor: "Worker",
      });
    });

    const updated = result.current.orders.find(
      (candidate) => candidate.id === order.id,
    );
    assert.ok(updated);
    expect(
      updated.segments
        .filter((candidate) => candidate.stage === "الجودة والتغليف")
        .reduce((sum, candidate) => sum + candidate.quantity, 0),
    ).toBe(quantity);
    expect(
      updated.segments
        .filter((candidate) => candidate.stage === "الإنتاج والإصلاح")
        .reduce((sum, candidate) => sum + candidate.quantity, 0),
    ).toBe(segment.quantity - quantity);
    expect(
      updated.items.filter((piece) => piece.currentLocation === "في الجودة"),
    ).toHaveLength(quantity);
    expect(
      updated.items.filter((piece) => piece.currentLocation === "في الإنتاج"),
    ).toHaveLength(segment.quantity - quantity);
    expect(updated.items.slice(0, 3)).toEqual(order.items.slice(0, 3));
    expect(updated.items.slice(3 + quantity)).toEqual(
      order.items.slice(3 + quantity),
    );
    expect(
      updated.segments.reduce((sum, candidate) => sum + candidate.quantity, 0),
    ).toBe(
      order.segments.reduce((sum, candidate) => sum + candidate.quantity, 0),
    );
    expect(
      updated.segments.some(
        (candidate) => candidate.state === "مكتمل في المرحلة",
      ),
    ).toBe(false);
    expect(result.current.events.slice(2)).toEqual(previousEvents);
    expect(result.current.events.slice(0, 2)).toEqual([
      expect.objectContaining({
        orderId: order.id,
        quantity,
        source: "الإنتاج والإصلاح",
        destination: "الجودة والتغليف",
      }),
      expect.objectContaining({ orderId: order.id, quantity }),
    ]);
  },
);

it.each(["accept", "reject"] as const)(
  "applies the quality decision %s to a piece with no pre-existing problem",
  async (decision) => {
    const { result } = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem(storageKey)).not.toBeNull();
    });
    const order = result.current.orders.find(
      (candidate) => candidate.id === "EXTERNAL-2026-0006",
    );
    assert.ok(order);
    const piece = order.items[0];
    assert.ok(piece);
    expect(piece.problem).toBeUndefined();

    act(() => {
      result.current.qualityInspectPiece(order.id, piece.id, decision, {
        responsibleDept: "الإنتاج والإصلاح",
        reason: "Stitching defect",
        notes: "Repair instructions",
      });
    });

    const updated = result.current.orders.find(
      (candidate) => candidate.id === order.id,
    );
    assert.ok(updated);
    expect(updated.items[0]?.currentLocation).toBe(
      decision === "accept" ? "في المستودع" : "في الإنتاج",
    );
    expect(updated.items.slice(1)).toEqual(order.items.slice(1));
    expect(updated.warehouse).toBe(decision === "accept" ? 1 : 0);
    expect(updated.items[0]?.deptStatus).toBe(
      decision === "accept" ? "مجازة ومغلفة" : "مرتجعة للتصحيح",
    );
    if (decision === "reject") {
      expect(updated.items[0]?.rejection).toMatchObject({
        responsibleDept: "الإنتاج والإصلاح",
        reason: "Stitching defect",
        notes: "Repair instructions",
        cycle: 1,
      });
    }
  },
);

it("can finish the remaining production pieces after a partial transfer", async () => {
  const { result } = renderHook(useMvpStore, { wrapper });
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  const previousEvents = result.current.events;
  for (const quantity of [1, 2]) {
    act(() => {
      result.current.completeManufacturingSegment({
        orderId: "EXTERNAL-2026-0005",
        segmentId: "s-05p",
        quantity,
        actor: "Worker",
      });
    });
  }
  const order = result.current.orders.find(
    (candidate) => candidate.id === "EXTERNAL-2026-0005",
  );
  assert.ok(order);
  expect(
    order.items.filter((piece) => piece.currentLocation === "في الجودة"),
  ).toHaveLength(3);
  expect(
    order.segments.filter((segment) => segment.stage === "الإنتاج والإصلاح"),
  ).toHaveLength(0);
  expect(
    order.segments
      .filter((segment) => segment.stage === "الجودة والتغليف")
      .reduce((sum, segment) => sum + segment.quantity, 0),
  ).toBe(3);
  expect(result.current.events.slice(4)).toEqual(previousEvents);
});

it.each([0, -1, 1.5, 4, Number.NaN])(
  "rejects an invalid manufacturing quantity %s without changing orders or history",
  async (quantity) => {
    const { result } = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem(storageKey)).not.toBeNull();
    });
    const orders = result.current.orders;
    const events = result.current.events;
    act(() => {
      result.current.completeManufacturingSegment({
        orderId: "EXTERNAL-2026-0005",
        segmentId: "s-05p",
        quantity,
        actor: "Worker",
      });
    });
    expect(result.current.orders).toEqual(orders);
    expect(result.current.events).toEqual(events);
  },
);
