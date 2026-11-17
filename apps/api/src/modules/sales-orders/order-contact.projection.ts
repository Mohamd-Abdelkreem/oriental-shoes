import type { AdministrationCorrectionValues } from "@template/contracts";

type OrderContact = Pick<
  AdministrationCorrectionValues,
  "customerName" | "customerPhone" | "customerEmail" | "customerAddress"
>;
export const effectiveOrderContact = (
  original: OrderContact,
  latest: OrderContact | null,
): OrderContact => {
  const values = latest ?? original;
  return {
    customerName: values.customerName,
    customerPhone: values.customerPhone,
    customerEmail: values.customerEmail,
    customerAddress: values.customerAddress,
  };
};
