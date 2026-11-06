import { act, renderHook } from "@testing-library/react";
import { useZodForm } from "@/shared/forms/form";
import { AxiosError, AxiosHeaders } from "axios";
import { expect, it } from "vitest";
import { customerCaptureSchema, customerSchema } from "@template/contracts";
import {
  applyCustomerCommandError,
  customerRoute,
  parseCustomerRoutePhone,
  makeCustomerDefaults,
  toCustomerPatch,
} from "./customer-form.model";

const id = "11111111-1111-4111-8111-111111111111",
  instant = "2026-11-05T00:00:00.000Z";
const customer = customerSchema.parse({
  id,
  name: "Saved",
  phone: "+966500000001",
  email: null,
  address: null,
  notes: null,
  version: 1,
  createdAt: instant,
  updatedAt: instant,
});
it("uses deliberate defaults and shared capture normalization rather than a second validator", () => {
  expect(makeCustomerDefaults()).toEqual({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  expect(
    customerCaptureSchema.parse({
      ...makeCustomerDefaults(),
      name: "  Saved  ",
      phone: "٠٥٠٠٠٠٠٠٠١",
    }),
  ).toEqual({
    name: "Saved",
    phone: "+966500000001",
    email: null,
    address: null,
    notes: null,
  });
  expect(makeCustomerDefaults(customer).phone).toBe(customer.phone);
});
it("patches only dirty supported fields, preserving omitted values and optional clears", () => {
  const values = {
    ...makeCustomerDefaults(customer),
    name: "New",
    email: "",
    address: "",
    notes: "  ",
  };
  expect(toCustomerPatch(values, { email: true, notes: true })).toEqual({
    email: null,
    notes: null,
  });
  expect(toCustomerPatch(values, {})).toEqual({});
  expect(toCustomerPatch(values, { name: true })).toEqual({ name: "New" });
});
it.each(["0500000001", "+966500000001", "00966500000001", "٠٥٠٠٠٠٠٠٠١"])(
  "builds only validated known routes for %s",
  (phone) => {
    expect(customerRoute(phone, "sales")).toBe(
      "/sales/customers/%2B966500000001",
    );
    expect(customerRoute(phone, "sales", true)).toBe(
      "/sales/customers/%2B966500000001/edit",
    );
    expect(customerRoute(phone, "admin")).toBe(
      "/admin/customers/%2B966500000001",
    );
  },
);
it("rejects arbitrary navigation and absent administrator edit routes", () => {
  expect(() => customerRoute("//evil.test", "sales")).toThrow();
  expect(() => customerRoute(customer.phone, "admin", true)).toThrow();
});
it("maps only the selected operation's known field prefix and keeps authority paths general", () => {
  const editor = renderHook(() =>
    useZodForm(customerCaptureSchema, {
      defaultValues: makeCustomerDefaults(customer),
    }),
  );
  const error = new AxiosError(
    "validation",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status: 400,
      statusText: "bad",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        success: false,
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid",
        requestId: "safe-request",
        timestamp: instant,
        path: "/api/v1/customers",
        errors: [
          { field: "body.customer.name", message: "Required" },
          { field: "body.patch.phone", message: "Wrong operation" },
          { field: "body.customer.ownerId", message: "Unsupported" },
        ],
      },
    },
  );
  let feedback = "";
  act(() => {
    feedback = applyCustomerCommandError(
      error,
      editor.result.current,
      "create",
    );
  });
  expect(feedback).toContain("safe-request");
  expect(editor.result.current.getFieldState("name").error?.message).toBe(
    "Required",
  );
  expect(editor.result.current.getFieldState("phone").error).toBeUndefined();
  editor.unmount();
});
it("leaves email identity nonunique and enforces the shared bounds", () => {
  const first = customerCaptureSchema.parse({
      name: "One",
      phone: "0500000001",
      email: "same@example.test",
    }),
    second = customerCaptureSchema.parse({
      name: "Two",
      phone: "0500000002",
      email: first.email,
    });
  expect(second.email).toBe(first.email);
  expect(second.phone).not.toBe(first.phone);
  for (const change of [
    { name: " " },
    { address: "x".repeat(2001) },
    { notes: "x".repeat(4001) },
    { email: "invalid" },
  ])
    expect(
      customerCaptureSchema.safeParse({ ...first, ...change }).success,
    ).toBe(false);
});

it("decodes exactly one route layer without widening the raw phone contract", () => {
  expect(parseCustomerRoutePhone("%2B966500000001")).toBe("+966500000001");
  expect(parseCustomerRoutePhone("0500000001")).toBe("+966500000001");
  for (const raw of ["%252B966500000001", "%E0%A4%A", "invalid"])
    expect(parseCustomerRoutePhone(raw)).toBeNull();
});
