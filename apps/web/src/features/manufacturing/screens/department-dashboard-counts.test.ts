import assert from "node:assert/strict";
import { expect, it } from "vitest";
import { makePiece, seedOrders } from "@/features/prototype/state/mvp-fixtures";
import { dashboardPieceCounts } from "./department-dashboard-counts";
import type { DepartmentRole } from "./department-dashboard-config";

const baseOrder = seedOrders[0];
assert.ok(baseOrder);
const order = {
  ...baseOrder,
  items: [
    makePiece("cut-ready", 0, "Model", {
      currentLocation: "في القص",
      deptStatus: "جاهزة للعمل",
    }),
    makePiece("cut-unstarted", 1, "Model", {
      currentLocation: "في القص",
      deptStatus: undefined,
    }),
    makePiece("cut-running", 2, "Model", {
      currentLocation: "في القص",
      deptStatus: "جاري العمل",
    }),
    makePiece("production-ready", 3, "Model", {
      currentLocation: "في الإنتاج",
      deptStatus: "جاهزة للعمل",
    }),
    makePiece("production-running", 4, "Model", {
      currentLocation: "في الإنتاج",
      deptStatus: "جاري العمل",
    }),
    makePiece("quality-ready", 5, "Model", {
      currentLocation: "في الجودة",
      deptStatus: "جاهزة للفحص",
    }),
    makePiece("quality-running", 6, "Model", {
      currentLocation: "في الجودة",
      deptStatus: "جاري الفحص",
    }),
    makePiece("warehouse-ready", 7, "Model", {
      currentLocation: "في المستودع",
      deptStatus: "جاهزة للعمل",
    }),
    makePiece("warehouse-received", 8, "Model", {
      currentLocation: "في المستودع",
      deptStatus: "مكتملة",
    }),
    makePiece("delivered", 9, "Model", {
      currentLocation: "تم التسليم",
      deptStatus: undefined,
    }),
    makePiece("received", 10, "Model", {
      currentLocation: "تم الاستلام",
      deptStatus: undefined,
    }),
    makePiece("deleted", 11, "Model", {
      currentLocation: "في الجودة",
      deptStatus: "مجازة ومغلفة",
      isDeleted: true,
    }),
    makePiece("problem", 12, "Model", {
      currentLocation: "لدى الاعتماد بسبب مشكلة",
      deptStatus: "بها مشكلة",
    }),
    makePiece("rejection", 13, "Model", {
      currentLocation: "في القص",
      deptStatus: undefined,
      rejection: {
        responsibleDept: "القص",
        reason: "Defect",
        notes: "Correct",
        cycle: 1,
        returnedAt: "2026-10-30",
      },
    }),
  ],
};

it.each<{
  role: DepartmentRole;
  expected: ReturnType<typeof dashboardPieceCounts>;
}>([
  {
    role: "cutting",
    expected: { incoming: 3, inProgress: 1, returned: 2, completed: 7 },
  },
  {
    role: "production",
    expected: { incoming: 1, inProgress: 1, returned: 2, completed: 5 },
  },
  {
    role: "quality",
    expected: { incoming: 1, inProgress: 1, returned: 2, completed: 3 },
  },
  {
    role: "warehouse",
    expected: { incoming: 1, inProgress: 1, returned: 1, completed: 2 },
  },
])("preserves the dashboard counting rules for $role", ({ role, expected }) => {
  expect(dashboardPieceCounts([order], role)).toEqual(expected);
});

it("shows zero counts for empty orders and deleted pieces", () => {
  expect(dashboardPieceCounts([], "quality")).toEqual({
    incoming: 0,
    inProgress: 0,
    returned: 0,
    completed: 0,
  });
  expect(
    dashboardPieceCounts(
      [
        {
          ...baseOrder,
          items: order.items.map((piece) => ({ ...piece, isDeleted: true })),
        },
      ],
      "quality",
    ),
  ).toEqual({ incoming: 0, inProgress: 0, returned: 0, completed: 0 });
});
