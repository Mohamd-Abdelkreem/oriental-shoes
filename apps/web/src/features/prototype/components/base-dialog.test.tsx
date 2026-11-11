import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BaseDialog } from "./base-dialog";

it("exposes the title, contains keyboard focus, closes with Escape and restores the trigger", () => {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const close = vi.fn(),
    initialFocusRef = createRef<HTMLButtonElement>();
  const view = render(
    <BaseDialog
      open
      onClose={close}
      title="تأكيد العمل"
      initialFocusRef={initialFocusRef}
    >
      <button ref={initialFocusRef}>أول</button>
      <button disabled>معطل</button>
      <button>آخر</button>
      <div style={{ display: "none" }}>
        <button>مخفي في الشاشة الحالية</button>
      </div>
      <fieldset disabled>
        <button>غير متاح</button>
      </fieldset>
    </BaseDialog>,
  );
  expect(screen.getByRole("dialog", { name: "تأكيد العمل" })).toHaveAttribute(
    "aria-modal",
    "true",
  );
  expect(screen.getByRole("button", { name: "أول" })).toHaveFocus();
  screen.getByRole("button", { name: "آخر" }).focus();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
  expect(screen.getByRole("button", { name: "إغلاق النافذة" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
  expect(screen.getByRole("button", { name: "آخر" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(trigger).toHaveFocus();
  trigger.remove();
});

it("restores an explicit opener after async preparation disabled and blurred it", () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const returnFocusRef = createRef<HTMLElement>();
  returnFocusRef.current = opener;
  opener.disabled = true;
  opener.blur();
  const view = render(
    <BaseDialog
      open
      title="مراجعة العمل"
      onClose={() => {}}
      returnFocusRef={returnFocusRef}
    >
      <button>تأكيد</button>
    </BaseDialog>,
  );
  expect(screen.getByRole("button", { name: "إغلاق النافذة" })).toHaveFocus();
  opener.disabled = false;
  view.unmount();
  expect(opener).toHaveFocus();
  opener.remove();
});
