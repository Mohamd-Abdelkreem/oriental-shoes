import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import { resolveManufacturingTargets } from "../model/manufacturing-view.model";
import { p03Ids } from "@/test/p03-fixtures";
import { FactoryTaskSummary } from "./factory-task-summary";

it("distinguishes the original start from later actual workers and honest unknown time", () => {
  const detail = manufacturingDetailFixture(2, "CUTTING", true),
    work = detail.work[0];
  if (!work) throw new Error("Missing work");
  work.lastAction = {
    eventId: p03Ids.source,
    commandId: p03Ids.command,
    operation: "CONTINUE",
    actor: {
      id: p03Ids.customer,
      fullName: "Colleague B",
      role: "USER",
      department: "CUTTING",
    },
    occurredAt: "2026-11-11T10:00:00.000Z",
  };
  const targets = [
    { orderId: p03Ids.order, expectedVersion: 2, pieceId: p03Ids.piece },
  ];
  const view = render(
    <FactoryTaskSummary
      source="persisted"
      data={detail}
      rows={resolveManufacturingTargets(detail, targets)}
    />,
  );
  expect(screen.getByText(/بدأ العمل: Original worker/u)).toBeInTheDocument();
  expect(screen.getByText(/آخر منفذ فعلي: Colleague B/u)).toBeInTheDocument();
  const legacy = manufacturingDetailFixture();
  view.rerender(
    <FactoryTaskSummary
      source="persisted"
      data={legacy}
      rows={resolveManufacturingTargets(legacy, targets)}
    />,
  );
  expect(screen.getByText(/وقت البدء غير مسجل/u)).toBeInTheDocument();
});
