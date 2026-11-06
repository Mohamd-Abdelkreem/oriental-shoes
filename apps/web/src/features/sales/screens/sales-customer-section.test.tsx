import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { customerSummarySchema } from "@template/contracts";
import { SalesCustomerSection } from "./sales-customer-section";

const customer = customerSummarySchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Shared name",
  phone: "+966500000001",
  email: null,
  address: null,
});
it("requires explicit result selection instead of inferring identity from typed name", () => {
  const search = vi.fn(),
    select = vi.fn(),
    clear = vi.fn();
  render(
    <SalesCustomerSection
      search=""
      onSearchChange={search}
      selectedCustomer={null}
      results={[customer]}
      queryState={{
        loading: false,
        fetching: false,
        error: null,
        onRetry: () => {},
      }}
      onSelect={select}
      onClear={clear}
      onCreateCustomer={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("رقم الهاتف أو اسم العميل:"), {
    target: { value: customer.name },
  });
  expect(search).toHaveBeenCalledWith(customer.name);
  expect(select).not.toHaveBeenCalled();
});
it("renders actual result/selection/clear actions and keeps loading/error distinct from no results", () => {
  const select = vi.fn(),
    clear = vi.fn(),
    retry = vi.fn();
  const props = {
    search: "Shared",
    onSearchChange: () => {},
    selectedCustomer: null,
    results: [customer],
    queryState: {
      loading: false,
      fetching: false,
      error: null,
      onRetry: retry,
    },
    onSelect: select,
    onClear: clear,
    onCreateCustomer: () => {},
  };
  const view = render(<SalesCustomerSection {...props} />);
  fireEvent.click(
    screen.getByRole("button", { name: /Shared name.*966500000001/u }),
  );
  expect(select).toHaveBeenCalledWith(customer);
  view.rerender(
    <SalesCustomerSection {...props} selectedCustomer={customer} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "إزالة اختيار العميل" }));
  expect(clear).toHaveBeenCalledTimes(1);
  view.rerender(
    <SalesCustomerSection
      {...props}
      results={[]}
      queryState={{
        loading: false,
        fetching: false,
        error: "تعذّر البحث",
        onRetry: retry,
      }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("تعذّر البحث");
  expect(screen.queryByText(/لا توجد نتائج مطابقة/u)).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "إعادة محاولة تحميل العملاء" }),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});
