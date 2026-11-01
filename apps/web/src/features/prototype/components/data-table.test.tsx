import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
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
