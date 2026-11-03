import type { ProductLine } from "@/features/prototype/state/mvp-types";

export const DECORATION_OPTIONS = [
  "جلد بني محبب",
  "جلد تمساح أسود",
  "جلد نعام جملي",
  "شامواه كحلي",
  "تطريز يدوي فاخر",
  "سادة بدون تطعيم",
  "جلد ثعبان طبيعي رمادي",
  "شامواه عسلي ناعم",
  "جلد كافيار أسود",
  "حزام تطريز مذهب",
  "قص ليزر هندسي",
  "بروش معدني شرقي",
  "تطعيم جلد هافان فاخر",
  "تطريز سيفين ونخلة",
  "جلد جملي مفرغ",
  "درز جلد دبل عريض",
] as const;

export const DECORATION_COLOR_OPTIONS = [
  "بني داكن",
  "أسود ملكي",
  "عسلي فاتح",
  "كحلي داكن",
  "بيج صحراوي",
  "مطابق للأساس",
  "هافان دافئ",
  "رمادي فحمي",
  "زيتي ملكي",
  "عنابي داكن",
  "برونزي ميتاليك",
  "جملي كلاسيكي",
  "أبيض عاجي",
  "ذهبي مطفي",
  "طوبي شرقي",
] as const;

export const LEATHER_BASE_OPTIONS = [
  "جلد طبيعي أسود",
  "جلد طبيعي بني",
  "جلد عسلي إيطالي",
  "جلد تمساح فاخر",
  "جلد هافان طبيعي",
  "شامواه أسود ملكي",
  "جلد نعام طبيعي فاخر",
  "جلد بقر إيطالي محبب",
  "جلد غزال طري",
  "جلد كافيار بارز",
  "جلد ثعبان طبيعي",
  "جلد جملي كلاسيكي",
  "جلد زيتي غامق",
  "جلد نبيذي فاخر (بورغندي)",
  "جلد كحلي ملكي",
  "جلد طبيعي كستنائي",
] as const;

export const MODEL_OPTIONS = [
  "شرقي ملكي كلاسيك",
  "شرقي وطني فاخر",
  "كاجوال مطرز خفيف",
  "رسمي مناسبات",
  "شرقي زبيري مطور",
  "شرقي كلاسيك تطريز يدوي",
  "شرقي نجد أصيل",
  "شرقي حجازي مميز",
  "شرقي عصري مريح",
  "شرقي ملكي نعل جلد",
  "شرقي إيطالي خفيف",
  "شرقي كاجوال جلد طبيعي",
  "شرقي كلاسيك نعل ربل",
  "حذاء سهرة ملكي مخمل",
  "حذاء رسمي جلد لامع",
  "زبيري كلاسيك مخرم",
  "شرقي شبابي عصري",
  "شرقي مريح دعاسة طبية",
] as const;

export const SOLE_OPTIONS = [
  "R.D1/2 ربل مدعم",
  "R.O ربل إيطالي عادي",
  "R.D ربل دبل فاخر",
  "N.D نعل دبل خفيف",
  "R.M ربل مموج مرن",
  "N نعل كلاسيكي خفيف",
  "R.C ربل لباد ممتص للصدمات",
  "R.N ربل مع نعل طبيعي",
  "R.R ربر مع ربر فائق المرونة",
  "R.P ربر طبقة واحدة خفيف",
  "N1/2 نعل نصف دبل",
  "T تكنك خفيف الوزن",
  "K كعب خشبي مقوى",
  "S نعل مربع كلاسيكي",
  "H روضة مريح للمشي",
  "X مكسي فاخر",
] as const;

export const SOLE_COLOR_OPTIONS = [
  "١٢ عسلي",
  "٠١ أسود",
  "٠٤ بني غامق",
  "٠٨ بيج طبيعي",
  "١٥ جملي",
  "٠٢ بني محروق",
  "٠٣ كحلي داكن",
  "٠٩ رصاصي مطفي",
  "١٠ هافان دافئ",
  "١٨ عنابي",
] as const;

export const SOLE_ADDITION_OPTIONS = [
  "بدون إضافة",
  "فرشة طبية مريحة",
  "دعاسة سيليكون مضغوطة",
  "تبطين إضافي لكعب القدم",
  "دعامة قوس القدم (Arch Support)",
  "فرشة فوم ذاكرة (Memory Foam)",
  "كعب مخفي بارتفاع 2 سم",
  "كعب مخفي بارتفاع 3 سم",
  "نقش حروف الاسم بالليزر",
  "تغليف هدايا ملكي مع كرت إهداء",
  "معالجة مقاومة للماء والرطوبة",
  "طبقة عازلة للحرارة",
  "نعل دبل إضافي",
  "حقن ربل مانع للانزلاق",
] as const;

export const SIZE_OPTIONS = [
  "٣٨",
  "٣٩",
  "٤٠",
  "٤١",
  "٤٢",
  "٤٣",
  "٤٤",
  "٤٥",
  "٤٦",
  "٤٧",
  "٤٨",
] as const;

export const COLUMN_OPTIONS_MAP: Readonly<
  Partial<Record<keyof ProductLine, readonly string[]>>
> = {
  decoration: DECORATION_OPTIONS,
  decorationColor: DECORATION_COLOR_OPTIONS,
  leatherBase: LEATHER_BASE_OPTIONS,
  model: MODEL_OPTIONS,
  sole: SOLE_OPTIONS,
  soleAddition: SOLE_ADDITION_OPTIONS,
  soleColor: SOLE_COLOR_OPTIONS,
  size: SIZE_OPTIONS,
};

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
