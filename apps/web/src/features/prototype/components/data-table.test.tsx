import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DataTable } from "./data-table";

const columns = [
  { header: "الاسم", accessor: "name" as const },
  { header: "القيمة", accessor: "value" as const },
];
const sampleData = Array.from({ length: 150 }, (_, index) => ({
  id: index + 1,
  name: `عنصر ${String(index + 1)}`,
  value: `قيمة ${String(index + 1)}`,
}));
const keyExtractor = (row: (typeof sampleData)[number]) => row.id;

function paginationIndicatorAfter(label: string): string {
  const indicator = screen.getByText(label).nextElementSibling;
  if (!indicator) {
    throw new Error(`pagination indicator after "${label}" is missing`);
  }
  return indicator.textContent;
}

it("navigates rows with numbered, next and previous controls and disables the boundaries", () => {
  render(
    <DataTable
      columns={columns}
      data={sampleData.slice(0, 25)}
      pageSize={10}
      keyExtractor={keyExtractor}
    />,
  );
  expect(screen.getByText("(إجمالي 25 عنصر)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "1" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("button", { name: "الصفحة السابقة" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  expect(screen.getByText("عنصر 11")).toBeInTheDocument();
  expect(screen.queryByText("عنصر 1")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "الصفحة السابقة" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "الصفحة السابقة" }));
  expect(screen.getByText("عنصر 1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "3" }));
  expect(screen.getByText("عنصر 25")).toBeInTheDocument();
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(6);
  expect(screen.getByRole("button", { name: "الصفحة التالية" })).toBeDisabled();
});

it.each([0, 5, 10])(
  "hides pagination when %i records fit on one page",
  (count) => {
    render(
      <DataTable
        columns={columns}
        data={sampleData.slice(0, count)}
        pageSize={10}
        keyExtractor={keyExtractor}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "الصفحة السابقة" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "الصفحة التالية" }),
    ).not.toBeInTheDocument();
  },
);

it("keeps all page numbers visible through the seven-page boundary", () => {
  render(
    <DataTable
      columns={columns}
      data={sampleData.slice(0, 70)}
      pageSize={10}
      keyExtractor={keyExtractor}
    />,
  );
  for (let page = 1; page <= 7; page++) {
    expect(
      screen.getByRole("button", { name: String(page) }),
    ).toBeInTheDocument();
  }
  expect(screen.queryByText("...")).not.toBeInTheDocument();
});

it("keeps the endpoints and neighboring pages accessible while navigating a long table", () => {
  render(
    <DataTable
      columns={columns}
      data={sampleData}
      pageSize={10}
      keyExtractor={keyExtractor}
    />,
  );
  expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
  expect(screen.getAllByText("...")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "15" }));
  expect(screen.getByText("عنصر 150")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "14" })).toBeInTheDocument();
  expect(screen.getAllByText("...")).toHaveLength(1);
  for (let previous = 0; previous < 7; previous++) {
    fireEvent.click(screen.getByRole("button", { name: "الصفحة السابقة" }));
  }
  for (const page of [1, 7, 8, 9, 15]) {
    expect(
      screen.getByRole("button", { name: String(page) }),
    ).toBeInTheDocument();
  }
  expect(screen.getByText("عنصر 71")).toBeInTheDocument();
  expect(screen.getAllByText("...")).toHaveLength(2);
});

it("clamps the displayed rows and custom row indices when filtering reduces the page count", () => {
  const indexedColumns = [
    {
      header: "التسلسل",
      render: (row: (typeof sampleData)[number], index: number) =>
        `${String(index + 1)}:${row.name}`,
    },
  ];
  const view = render(
    <DataTable
      columns={indexedColumns}
      data={sampleData.slice(0, 35)}
      pageSize={10}
      keyExtractor={keyExtractor}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "4" }));
  view.rerender(
    <DataTable
      columns={indexedColumns}
      data={sampleData.slice(0, 13)}
      pageSize={10}
      keyExtractor={keyExtractor}
    />,
  );
  expect(screen.getByText("11:عنصر 11")).toBeInTheDocument();
  expect(screen.getByText("13:عنصر 13")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "2" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("button", { name: "الصفحة التالية" })).toBeDisabled();
});

it("slices locally and pages when the pagination prop is omitted", () => {
  render(
    <DataTable
      columns={columns}
      data={sampleData.slice(0, 25)}
      pageSize={10}
      keyExtractor={keyExtractor}
    />,
  );
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
    11,
  );
  expect(screen.getByText("عنصر 1")).toBeInTheDocument();
  expect(screen.getByText("عنصر 10")).toBeInTheDocument();
  expect(screen.queryByText("عنصر 11")).not.toBeInTheDocument();
  expect(screen.getByText("(إجمالي 25 عنصر)")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "2" }));
  expect(screen.getByText("عنصر 11")).toBeInTheDocument();
  expect(screen.queryByText("عنصر 1")).not.toBeInTheDocument();
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
    11,
  );
});

it("renders the whole supplied server page without slicing it", () => {
  render(
    <DataTable
      columns={columns}
      data={sampleData.slice(0, 25)}
      pageSize={10}
      keyExtractor={keyExtractor}
      pagination={{
        page: 1,
        totalPages: 24,
        total: 240,
        onPageChange: () => {},
      }}
    />,
  );
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
    26,
  );
  expect(screen.getByText("عنصر 1")).toBeInTheDocument();
  expect(screen.getByText("عنصر 25")).toBeInTheDocument();
  expect(screen.getByText("(إجمالي 240 عنصر)")).toBeInTheDocument();
});

it("drives the pagination control from the controlled page metadata", () => {
  render(
    <DataTable
      columns={columns}
      data={sampleData.slice(0, 25)}
      pageSize={10}
      keyExtractor={keyExtractor}
      pagination={{
        page: 3,
        totalPages: 24,
        total: 240,
        onPageChange: () => {},
      }}
    />,
  );
  expect(paginationIndicatorAfter("صفحة")).toBe("3");
  expect(paginationIndicatorAfter("من")).toBe("24");
  expect(screen.getByText("(إجمالي 240 عنصر)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "3" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("button", { name: "24" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "23" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "الصفحة السابقة" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "الصفحة التالية" })).toBeEnabled();
});

it("reports the requested page to the owner and keeps its own rows unchanged", () => {
  const onPageChange = vi.fn();
  render(
    <DataTable
      columns={columns}
      data={sampleData.slice(0, 25)}
      pageSize={10}
      keyExtractor={keyExtractor}
      pagination={{ page: 1, totalPages: 24, total: 240, onPageChange }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "2" }));
  expect(onPageChange).toHaveBeenCalledWith(2);
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
    26,
  );
  expect(screen.getByText("عنصر 25")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "1" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

it("reports the neighbouring controlled pages to the owner", () => {
  const onPageChange = vi.fn();
  render(
    <DataTable
      columns={columns}
      data={sampleData.slice(0, 25)}
      pageSize={10}
      keyExtractor={keyExtractor}
      pagination={{ page: 3, totalPages: 24, total: 240, onPageChange }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "الصفحة التالية" }));
  expect(onPageChange).toHaveBeenCalledWith(4);
  fireEvent.click(screen.getByRole("button", { name: "الصفحة السابقة" }));
  expect(onPageChange).toHaveBeenCalledWith(2);
});

it("follows the controlled page prop instead of keeping an internal page", () => {
  const onPageChange = vi.fn();
  const view = render(
    <DataTable
      columns={columns}
      data={sampleData.slice(0, 25)}
      pageSize={10}
      keyExtractor={keyExtractor}
      pagination={{ page: 1, totalPages: 24, total: 240, onPageChange }}
    />,
  );
  const firstRow = within(screen.getByRole("table")).getAllByRole("row")[1];
  fireEvent.click(screen.getByRole("button", { name: "2" }));
  expect(onPageChange).toHaveBeenCalledWith(2);
  view.rerender(
    <DataTable
      columns={columns}
      data={sampleData.slice(0, 25)}
      pageSize={10}
      keyExtractor={keyExtractor}
      pagination={{ page: 1, totalPages: 24, total: 240, onPageChange }}
    />,
  );
  expect(screen.getByRole("button", { name: "1" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("button", { name: "2" })).not.toHaveAttribute(
    "aria-current",
  );
  expect(paginationIndicatorAfter("صفحة")).toBe("1");
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
    26,
  );
  expect(within(screen.getByRole("table")).getAllByRole("row")[1]).toBe(
    firstRow,
  );
});

it.each([0, 1])(
  "renders a controlled page count of %i without crashing",
  (totalPages) => {
    render(
      <DataTable
        columns={columns}
        data={sampleData.slice(0, 0)}
        pageSize={10}
        keyExtractor={keyExtractor}
        pagination={{ page: 1, totalPages, total: 0, onPageChange: () => {} }}
      />,
    );
    expect(screen.getByText("لا توجد سجلات")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "الصفحة التالية" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "الصفحة السابقة" }),
    ).not.toBeInTheDocument();
  },
);
