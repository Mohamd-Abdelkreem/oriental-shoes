const orderTypeDefinitions = {
  SHOP: { label: "طلب تفصيل معرض", paperTitle: "أمر تفصيل / ط خ" },
  EXTERNAL: { label: "طلب مبيعات خارجية", paperTitle: "طلب تفصيل خارجي" },
  REPAIR: { label: "طلب إصلاح", paperTitle: "أمر إصلاح" },
  GIFT: { label: "أمر هدية", paperTitle: "أمر هدية" },
  READY: { label: "أمر تفصيل جاهز", paperTitle: "أمر تفصيل جاهز" },
  ACCESSORY: {
    label: "أمر تفصيل إكسسوارات",
    paperTitle: "أمر تفصيل إكسسوارات",
  },
  ADJUSTMENT: { label: "أمر تعديل", paperTitle: "أمر تعديل" },
} as const;

export type OrderType = keyof typeof orderTypeDefinitions;
export const orderTypeValues = Object.keys(orderTypeDefinitions) as OrderType[];
export const orderTypeOptions = orderTypeValues.map((value) => ({
  value,
  label: orderTypeDefinitions[value].label,
}));
export const orderTypeLabels = Object.fromEntries(
  orderTypeOptions.map(({ value, label }) => [value, label]),
) as Record<OrderType, string>;

export function getPaperFormTitle(type?: string): string {
  const orderType = orderTypeValues.find((value) => value === type) ?? "SHOP";
  return orderTypeDefinitions[orderType].paperTitle;
}
