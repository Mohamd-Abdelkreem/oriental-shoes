import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  makeDraftDefaults,
  toDraftPaper,
  toDraftPaperLines,
  fromDraftPaperLines,
  type DraftFormValues,
} from "@/features/sales/model/draft-form.model";
import {
  OrderPaperForm,
  type DraftPaperOptions,
  type OrderPaperDataState,
} from "./components/order-paper-form";

const options: DraftPaperOptions = {
  model: [],
  leatherBase: [],
  decoration: [],
  decorationColor: [],
  sole: [],
  soleAddition: [],
  soleColor: [],
  size: [],
};
const dataState: OrderPaperDataState = {
  kind: "draft",
  pricing: "unavailable",
  catalogOptions: options,
};
const paper = (values = makeDraftDefaults()) =>
  toDraftPaper(values, {
    ownerName: "Actual owner",
    createdAt: null,
    draftId: null,
    customer: null,
  });
it("shows unavailable financials and no invented factual fallback even when the legacy view carries prices", () => {
  const order = paper(),
    first = order.items[0];
  if (first === undefined) throw new Error("Expected physical piece");
  render(
    <OrderPaperForm
      order={{
        ...order,
        items: [{ ...first, unitPrice: "999.00", rowTotal: "999.00" }],
      }}
      mode="readOnly"
      dataState={dataState}
    />,
  );
  expect(
    screen.getByLabelText(`سعر ${first.pieceNumber ?? "القطعة"}`),
  ).toHaveTextContent("—");
  expect(
    screen.getByLabelText(`إجمالي ${first.pieceNumber ?? "القطعة"}`),
  ).toHaveTextContent("—");
  expect(screen.getByLabelText("الإجمالي غير متاح")).toHaveTextContent("—");
  expect(screen.getByLabelText("الباقي غير متاح")).toHaveTextContent("—");
  expect(screen.queryByText("999.00")).not.toBeInTheDocument();
  expect(screen.queryByText("ريم خالد")).not.toBeInTheDocument();
  expect(screen.queryByText("مطابقة العينة المعتمدة")).not.toBeInTheDocument();
  expect(screen.queryByText("٢٩ / ٠٣ / ١٤٤٨ هـ")).not.toBeInTheDocument();
  expect(screen.getByText("مسودة غير محفوظة")).toBeInTheDocument();
});
function EditableDraft({ onPaid }: { onPaid: (paid: string) => void }) {
  const [values, setValues] = useState<DraftFormValues>(() =>
    makeDraftDefaults(),
  );
  return (
    <OrderPaperForm
      order={paper(values)}
      lines={toDraftPaperLines(values)}
      mode="create"
      dataState={dataState}
      onLinesChange={(lines) => {
        setValues((current) => ({
          ...current,
          pieces: fromDraftPaperLines(lines),
        }));
      }}
      onTotalsChange={(totals) => {
        onPaid(totals.paid);
        setValues((current) => ({ ...current, paidAmount: totals.paid }));
      }}
    />
  );
}
it("retains empty production suggestions and actual custom provisional entry controls", async () => {
  render(<EditableDraft onPaid={() => {}} />);
  const products = within(screen.getByRole("table", { name: /جدول منتجات/u }));
  const model = products.getByRole("combobox", { name: /الموديل/u });
  fireEvent.click(model);
  expect(screen.queryAllByRole("option")).toHaveLength(0);
  const search = screen.getByPlaceholderText("ابحث في الموديل...");
  fireEvent.change(search, { target: { value: "موديل مبدئي" } });
  fireEvent.click(
    screen.getByRole("button", { name: /استخدام.*موديل مبدئي/u }),
  );
  await waitFor(() => expect(model).toHaveTextContent("موديل مبدئي"));
  expect(model).toHaveFocus();
  const side = within(
    screen.getByRole("table", { name: /الأرضية والإضافات/u }),
  );
  const addition = side.getByRole("combobox", { name: /الإضافة —/u });
  fireEvent.click(addition);
  fireEvent.change(screen.getByPlaceholderText("ابحث في الإضافة..."), {
    target: { value: "روضة - H" },
  });
  fireEvent.click(screen.getByRole("button", { name: /استخدام.*روضة - H/u }));
  expect(addition).toHaveTextContent("روضة - H");
  fireEvent.change(side.getByRole("textbox", { name: /الإضافات —/u }), {
    target: { value: "إضافات مستقلة" },
  });
  expect(side.getByRole("textbox", { name: /الإضافات —/u })).toHaveValue(
    "إضافات مستقلة",
  );
  expect(addition).toHaveTextContent("روضة - H");
});
it("keeps provisional paid text separate from unavailable totals and preserves factory redaction", () => {
  const changed = vi.fn();
  const order = paper();
  const rendered = render(
    <OrderPaperForm
      order={order}
      mode="create"
      dataState={dataState}
      onTotalsChange={changed}
    />,
  );
  fireEvent.change(screen.getByLabelText("المبلغ المدفوع"), {
    target: { value: "100.50" },
  });
  expect(changed).toHaveBeenCalledWith({
    total: undefined,
    paid: "100.50",
    balance: "",
  });
  rendered.rerender(
    <OrderPaperForm
      order={order}
      mode="readOnly"
      dataState={dataState}
      hideFinancials
    />,
  );
  expect(
    screen.getByText("البيانات المالية محجوبة عن أقسام المصنع"),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("المبلغ المدفوع")).not.toBeInTheDocument();
});
it("associates nested text/size/A/F/side-note errors with their actual elements and focus callbacks", () => {
  const order = paper(),
    first = order.items[0];
  if (first === undefined) throw new Error("Expected physical piece");
  const cells = new Map<string, HTMLElement>();
  const messages = Object.fromEntries(
    ["faceRight", "size", "aField", "fField", "sideNotes"].map((field) => [
      `${first.id}:${field}`,
      `راجع ${field}`,
    ]),
  );
  render(
    <>
      <button
        onClick={() => {
          cells.get(`${first.id}:faceRight`)?.focus();
        }}
      >
        الانتقال إلى أول خطأ
      </button>
      <OrderPaperForm
        order={order}
        mode="create"
        dataState={dataState}
        invalidCells={new Set(Object.keys(messages))}
        fieldErrorMessages={messages}
        onFieldElement={(id, field, element) => {
          if (element === null) cells.delete(`${id}:${field}`);
          else cells.set(`${id}:${field}`, element);
        }}
      />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "الانتقال إلى أول خطأ" }));
  expect(cells.get(`${first.id}:faceRight`)).toHaveFocus();
  for (const field of ["faceRight", "size", "aField", "fField", "sideNotes"]) {
    const control = cells.get(`${first.id}:${field}`);
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAccessibleDescription(`راجع ${field}`);
  }
});
