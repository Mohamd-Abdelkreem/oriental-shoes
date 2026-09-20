export const DECORATION_OPTIONS = [
  "جلد بني محبب",
  "جلد تمساح أسود",
  "جلد نعام جملي",
  "شامواه كحلي",
  "تطريز يدوي فاخر",
  "سادة بدون تطعيم",
] as const;

export const DECORATION_COLOR_OPTIONS = [
  "بني داكن",
  "أسود ملكي",
  "عسلي فاتح",
  "كحلي داكن",
  "بيج صحراوي",
  "مطابق للأساس",
] as const;

export const LEATHER_BASE_OPTIONS = [
  "جلد طبيعي أسود",
  "جلد طبيعي بني",
  "جلد عسلي إيطالي",
  "جلد تمساح فاخر",
  "جلد هافان طبيعي",
  "شامواه أسود ملكي",
] as const;

export const FACE_RIGHT_OPTIONS = [
  "جلد طبيعي",
  "شمواه فاخر",
  "خيط حرير مبروم",
  "تطريز مزدوج",
  "سادة",
] as const;

export const FACE_LEFT_OPTIONS = [
  "شمواه أسود",
  "جلد مطاطي",
  "تبطين جلد طبيعي",
  "سادة بدون م٢",
] as const;

export const MIXING_OPTIONS = [
  "خيط تطريز دقيق",
  "تقفيل يدوي مقوى",
  "درز فرنسي خفيف",
  "سادة بدون م٣",
] as const;

export const FACE_OPTIONS = [
  "وجه سادة كلاسيكي",
  "وجه مقلم بتطريز",
  "وجه شرقي ملكي",
  "وجه مخرم صيفي",
  "وجه مطرز يدوي",
] as const;

export const MODEL_OPTIONS = [
  "شرقي ملكي كلاسيك",
  "شرقي وطني فاخر",
  "كاجوال مطرز خفيف",
  "رسمي مناسبات",
  "شرقي زبيري مطور",
] as const;

export const SOLE_OPTIONS = [
  "R.D1/2 ربل مدعم",
  "R.O ربل إيطالي عادي",
  "R.D ربل دبل فاخر",
  "N.D نعل دبل خفيف",
  "R.M ربل مموج مرن",
  "N نعل كلاسيكي خفيف",
] as const;

export const SOLE_COLOR_OPTIONS = [
  "١٢ عسلي",
  "٠١ أسود",
  "٠٤ بني غامق",
  "٠٨ بيج طبيعي",
  "١٥ جملي",
] as const;

export const ADDITIONS_OPTIONS = [
  "فرشة طبية مريحة",
  "دعاسة سيليكون مضغوطة",
  "تبطين إضافي لكعب القدم",
  "نقش حروف الاسم بالليزر",
  "بدون إضافات",
] as const;

export const SIZE_OPTIONS = [
  "٣٩",
  "٤٠",
  "٤١",
  "٤٢",
  "٤٣",
  "٤٤",
  "٤٥",
  "٤٦",
  "٤٧",
] as const;

// The 17 Selectable Boxes in Original Layout
export type SelectableBox = {
  code: string;
  label: string;
};

export const TOP_5_BOXES: SelectableBox[] = [
  { code: "X", label: "مكسي" },
  { code: "H", label: "روضة" },
  { code: "S", label: "مربع" },
  { code: "K", label: "كعب" },
  { code: "T", label: "تكنك" },
];

export const BOTTOM_12_BOX_PAIRS: [SelectableBox, SelectableBox][] = [
  [
    { code: "N.D", label: "نعل دبل" },
    { code: "N1/2", label: "نعل ١/٢" },
  ],
  [
    { code: "R.R", label: "ربر مع ربر" },
    { code: "N", label: "نعل" },
  ],
  [
    { code: "R.M", label: "ربر مموج" },
    { code: "R.M1/2", label: "ربر مموج مصنفر" },
  ],
  [
    { code: "R.C", label: "ربر لباد" },
    { code: "R.N", label: "ربر مع نعل" },
  ],
  [
    { code: "R.D", label: "ربر دبل" },
    { code: "R.D1/2", label: "ربر دبل ١/٢" },
  ],
  [
    { code: "R.O", label: "ربر عادي" },
    { code: "R.P", label: "ربر طبقة واحدة" },
  ],
];

export function formatPieceSequence(index: number): string {
  return `القطعة ${String(index + 1).padStart(2, "0")}`;
}
