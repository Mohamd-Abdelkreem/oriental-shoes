const validationCopy: Readonly<Record<string, string>> = {
  "A draft needs one through 200 pieces.":
    "أدخل من قطعة واحدة إلى ٢٠٠ قطعة في المسودة.",
  "At least one supported field must be provided.":
    "عدّل حقلًا واحدًا على الأقل قبل الحفظ.",
  "Current password is not correct.": "كلمة المرور الحالية غير صحيحة.",
  "Draft capture exceeds its UTF-8 limit":
    "حجم بيانات المسودة أكبر من المسموح. اختصر الملاحظات أو قلّل عدد القطع.",
  "Enter a nonnegative decimal with at most two decimal places":
    "أدخل مبلغًا صفرًا أو أكبر وبحد أقصى منزلتين عشريتين.",
  "Enter a valid email": "أدخل بريدًا إلكترونيًا صحيحًا.",
  "Enter a valid Saudi mobile or fixed phone":
    "أدخل رقم جوال أو هاتف ثابت سعودي صحيحًا، مثل 0501234567.",
  "Invalid date": "أدخل تاريخًا صحيحًا.",
  "Invalid email address": "أدخل بريدًا إلكترونيًا صحيحًا.",
  "Invalid ISO date": "أدخل تاريخًا صحيحًا.",
  "Invalid ISO datetime": "أدخل تاريخًا ووقتًا صحيحين.",
  "Invalid URL": "أدخل رابطًا صحيحًا.",
  "Invalid UUID": "أعد اختيار العنصر من القائمة الحالية.",
  "New password must differ from current password.":
    "اختر كلمة مرور جديدة مختلفة عن كلمة المرور الحالية.",
  "Packing requires accepted pieces": "اختر قطعًا مقبولة في الفحص قبل التغليف.",
  "Password confirmation does not match.":
    "تأكيد كلمة المرور غير مطابق. أعد كتابة كلمة المرور نفسها.",
  "Piece identities must be distinct": "اختر كل قطعة مرة واحدة فقط.",
  "Piece identities must be distinct.": "اختر كل قطعة مرة واحدة فقط.",
  "Select a matching entry from the active catalog.":
    "اختر قيمة مطابقة من القائمة المعتمدة.",
  "Select distinct orders and at most 200 distinct physical pieces":
    "اختر كل طلب وقطعة مرة واحدة، بحد أقصى ٢٠٠ قطعة.",
  "Select one exact current catalog entry.":
    "اختر قيمة مطابقة من القائمة المعتمدة حاليًا.",
  "Select the matching source entry for this field.":
    "اختر القيمة من القائمة المعتمدة لهذا الحقل.",
  "Unsafe pagination window": "رقم الصفحة خارج النطاق. ارجع إلى بداية القائمة.",
  "must not contain null characters": "احذف المحارف غير المدعومة من هذا الحقل.",
  "must not contain only whitespace": "أدخل نصًا يحتوي على حروف أو أرقام.",
};

const fields: Readonly<Record<string, string>> = {
  address: "العنوان",
  contactNotes: "ملاحظات التواصل",
  currentPassword: "كلمة المرور الحالية",
  decision: "القرار",
  deliveryDate: "تاريخ التسليم",
  department: "القسم",
  email: "البريد الإلكتروني",
  fullName: "الاسم الكامل",
  leatherBase: "نوع الجلد",
  model: "الموديل",
  name: "الاسم",
  newPassword: "كلمة المرور الجديدة",
  notes: "الملاحظات",
  password: "كلمة المرور",
  passwordConfirmation: "تأكيد كلمة المرور",
  phone: "رقم الهاتف",
  reason: "السبب",
  size: "المقاس",
  sole: "النعل",
  target: "القسم المستهدف",
};

// The wire contract carries field messages as strings. Only recognize known
// reasons or bounded numeric limits; other server text never reaches the form.
export function validationMessage(message: string, path: string): string {
  if (Object.hasOwn(validationCopy, message))
    return validationCopy[message] ?? "راجع القيمة المدخلة.";

  const field = path.split(".").at(-1) ?? "";
  const label = Object.hasOwn(fields, field) ? fields[field] : undefined;
  const limit =
    /^(Too big|Too small): expected (string|array|number|int|bigint|value) to (?:have|be) (<=|>=|<|>)(-?\d{1,12}(?:\.\d{1,6})?)(?: (?:characters|items|elements))?$/u.exec(
      message,
    );
  const quantity = limit?.[4];
  if (limit && quantity !== undefined) {
    const [, kind, origin, operator] = limit;
    if (origin === "string") {
      if (kind === "Too small" && quantity === "1")
        return label ? `أدخل ${label}.` : "هذا الحقل مطلوب.";
      return kind === "Too big"
        ? `الحد الأقصى لطول النص ${quantity} حرفًا.`
        : `أدخل ${quantity} حرفًا على الأقل.`;
    }
    if (origin === "array")
      return kind === "Too big"
        ? `اختر ${quantity} عنصرًا على الأكثر.`
        : `اختر ${quantity} عنصرًا على الأقل.`;
    if (operator === ">") return `أدخل قيمة أكبر من ${quantity}.`;
    if (operator === "<") return `أدخل قيمة أقل من ${quantity}.`;
    return kind === "Too big"
      ? `أدخل قيمة لا تتجاوز ${quantity}.`
      : `أدخل قيمة لا تقل عن ${quantity}.`;
  }

  if (
    message === "Required" ||
    /^Invalid input: expected [\w.]+, received (?:undefined|null)$/u.test(
      message,
    )
  )
    return label ? `أدخل ${label}.` : "هذا الحقل مطلوب.";
  if (message.startsWith("Invalid input: expected int,"))
    return "أدخل عددًا صحيحًا دون كسور.";
  if (message.startsWith("Invalid input: expected number,"))
    return "أدخل رقمًا صحيح الصيغة.";
  if (message.startsWith("Unrecognized key"))
    return "توجد بيانات غير مدعومة. حدّث الصفحة وراجع الحقول المتاحة.";
  if (
    message.startsWith("Invalid option:") ||
    message.startsWith("Invalid discriminator value.")
  )
    return label
      ? `اختر قيمة متاحة لحقل ${label}.`
      : "اختر قيمة من الخيارات المتاحة.";

  if (field === "email") return "أدخل بريدًا إلكترونيًا صحيحًا.";
  if (field === "phone") return "أدخل رقم هاتف صحيحًا.";
  return label
    ? `راجع ${label} وأدخل قيمة صحيحة.`
    : "راجع القيمة المدخلة وأدخل قيمة صحيحة.";
}

export function localValidationMessage(message: string, path: string): string {
  return /\p{Script=Arabic}/u.test(message)
    ? message
    : validationMessage(message, path);
}
