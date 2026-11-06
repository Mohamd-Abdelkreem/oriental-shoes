import { describe, expect, it } from "vitest";
import {
  customerCaptureSchema,
  customerPatchSchema,
  customerListQuerySchema,
  customerSummarySchema,
  normalizeSaudiCustomerPhone,
} from "./customers.schema.ts";

const capture = { name: "  عميل اختبار  ", phone: "0500000001" };
describe("shared customer capture and identity", () => {
  it.each([
    "0500000001",
    "٠٥٠ ٠٠٠-٠٠٠١",
    "+966 50 000 0001",
    "00966500000001",
    "۰۵۰۰۰۰۰۰۰۱",
  ])("unifies equivalent Saudi phone %s", (phone) => {
    expect(customerCaptureSchema.parse({ ...capture, phone })).toEqual({
      name: "عميل اختبار",
      phone: "+966500000001",
      email: null,
      address: null,
      notes: null,
    });
  });
  it("accepts fixed lines without turning format validation into ownership verification", () => {
    expect(normalizeSaudiCustomerPhone("0112000001")).toBe("+966112000001");
  });
  it.each([
    "+201000000001",
    "05001",
    "966500000001",
    "500000001",
    "009660500000001",
    "0500000001 ext 2",
    "911",
    "0".repeat(65),
  ])("rejects unsupported phone %s", (phone) => {
    expect(customerCaptureSchema.safeParse({ ...capture, phone }).success).toBe(
      false,
    );
  });
  it("normalizes optional values and permits shared email on different phones", () => {
    const a = customerCaptureSchema.parse({
      ...capture,
      email: " SHARED@EXAMPLE.TEST ",
      address: " ",
      notes: " Notes ",
    });
    const b = customerCaptureSchema.parse({
      ...capture,
      phone: "0500000002",
      email: a.email,
    });
    expect(a).toMatchObject({
      email: "shared@example.test",
      address: null,
      notes: "Notes",
    });
    expect(b.email).toBe(a.email);
  });
  it("preserves omitted patches and explicitly clears only optional values", () => {
    expect(customerPatchSchema.parse({ notes: "new" })).toEqual({
      notes: "new",
    });
    expect(customerPatchSchema.parse({ email: "", address: null })).toEqual({
      email: null,
      address: null,
    });
  });
  it.each([
    {},
    { name: " " },
    { phone: null },
    { name: null },
    { ownerId: "actor" },
    { notes: "x\u0000y" },
    { email: "invalid" },
  ])("rejects incomplete or privileged patch %j", (patch) => {
    expect(customerPatchSchema.safeParse(patch).success).toBe(false);
  });
  it("bounds search and pagination without accepting hidden owner filters", () => {
    expect(
      customerListQuerySchema.parse({
        search: " MIXED@Example.test ",
        page: "2",
      }),
    ).toEqual({ page: 2, limit: 25, search: "MIXED@Example.test" });
    expect(
      customerListQuerySchema.safeParse({ ownerId: "other" }).success,
    ).toBe(false);
    expect(
      customerListQuerySchema.safeParse({ search: "x".repeat(151) }).success,
    ).toBe(false);
  });
  it("omits private notes and revisions from strict selection summaries", () => {
    const summary = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "C",
      phone: "+966500000001",
      email: null,
      address: null,
    };
    expect(customerSummarySchema.parse(summary)).toEqual(summary);
    expect(
      customerSummarySchema.safeParse({ ...summary, notes: "private" }).success,
    ).toBe(false);
    expect(
      customerSummarySchema.safeParse({ ...summary, version: 1 }).success,
    ).toBe(false);
  });
});
