import { fireEvent, render, screen } from "@testing-library/react";
import { Clock, Layers } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AdminFilterTabs } from "./admin-filter-tabs";

describe("AdminFilterTabs", () => {
  it("preserves exact accessible names with counts, tracks active tab state, and notifies selection", () => {
    const onSelect = vi.fn();
    render(
      <AdminFilterTabs
        activeTab="PENDING"
        onSelect={onSelect}
        items={[
          {
            id: "PENDING",
            label: "بانتظار الاعتماد",
            count: 4,
            tone: "amber",
            icon: Clock,
          },
          {
            id: "ALL",
            label: "كل الحالات",
            count: undefined,
            tone: "slate",
            icon: Layers,
          },
        ]}
      />,
    );

    const active = screen.getByRole("button", { name: "بانتظار الاعتماد (4)" });
    const fallback = screen.getByRole("button", { name: "كل الحالات (—)" });

    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(fallback).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(fallback);
    expect(onSelect).toHaveBeenCalledWith("ALL");
  });
});
