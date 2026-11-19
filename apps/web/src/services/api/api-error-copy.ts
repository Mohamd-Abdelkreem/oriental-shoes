const sessionCopy = "تعذّر التحقق من جلستك. سجّل الدخول مرة أخرى.";

const statusCopy: Readonly<Record<number, string>> = {
  0: "تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.",
  400: "تعذّر قبول بيانات الطلب. راجع القيم المدخلة ثم أعد المحاولة.",
  401: sessionCopy,
  403: "حسابك لا يملك الصلاحية المطلوبة لهذا الإجراء. راجع مسؤول النظام.",
  404: "البيانات المطلوبة غير متاحة. راجع الرابط أو ارجع إلى القائمة.",
  405: "هذا الإجراء غير متاح في هذه الصفحة. ارجع إلى القائمة واختر الإجراء المناسب.",
  409: "الإجراء يتعارض مع الحالة الحالية للبيانات. حدّث البيانات وراجع التغييرات.",
  413: "حجم البيانات المرسلة أكبر من المسموح. قلّل عدد العناصر أو حجم الملف.",
  415: "صيغة البيانات المرسلة غير مدعومة. راجع الملف أو البيانات المدخلة.",
  422: "بعض القيم المدخلة غير مقبولة. راجع الحقول المحددة وحاول مرة أخرى.",
  429: "تم تجاوز عدد المحاولات المسموح به. انتظر قليلًا ثم أعد المحاولة.",
  500: "حدث خطأ في الخادم أثناء معالجة الطلب. حدّث البيانات للتحقق من النتيجة.",
  501: "هذا الإجراء غير متاح حاليًا. تواصل مع مسؤول النظام.",
  502: "تعذّر استلام رد صالح من الخادم. حدّث البيانات للتحقق من النتيجة.",
  503: "الخدمة غير متاحة مؤقتًا. انتظر قليلًا ثم حدّث البيانات.",
  504: "انتهت مهلة انتظار الرد من الخادم. حدّث البيانات للتحقق من النتيجة.",
};

const commandConflict =
  "هذا الإجراء مرتبط بمحاولة سابقة ببيانات مختلفة. راجع حالة العملية قبل إرسال طلب جديد.";
const missingCommand =
  "نتيجة العملية غير متاحة. حدّث البيانات للتحقق من آخر حالة.";
const transactionConflict =
  "حدث تعارض أثناء تنفيذ العملية. تحقّق من آخر حالة قبل إعادة المحاولة.";
const changedSelection =
  "بعض العناصر المحددة تغيّرت أو لم تعد مؤهلة للإجراء. حدّث البيانات وراجع الاختيار.";

const codeCopy: Readonly<Record<string, string>> = {
  ACCOUNT_RESTRICTED:
    "حالة حسابك الحالية تمنع تنفيذ الإجراء. تواصل مع إدارة المصنع.",
  ADMINISTRATION_COMMAND_CONFLICT: commandConflict,
  ADMINISTRATION_COMMAND_NOT_FOUND: missingCommand,
  ADMINISTRATION_CORRECTION_UNCHANGED:
    "القيم المدخلة مطابقة للبيانات الحالية. عدّل قيمة واحدة على الأقل قبل الحفظ.",
  ADMINISTRATION_SELECTION_CONFLICT: changedSelection,
  ADMINISTRATION_TRANSACTION_CONFLICT: transactionConflict,
  APPROVAL_COMMAND_CONFLICT: commandConflict,
  APPROVAL_COMMAND_NOT_FOUND: missingCommand,
  APPROVAL_EVENT_NOT_FOUND: "حركة الاعتماد المطلوبة غير متاحة في سجل الطلب.",
  APPROVAL_ISSUE_CONFLICT:
    "حالة المشكلة تغيّرت. حدّث بيانات الطلب قبل اتخاذ قرار جديد.",
  APPROVAL_ISSUE_NOT_FOUND:
    "المشكلة المحددة غير متاحة. حدّث بيانات الطلب وراجع المشكلات المفتوحة.",
  APPROVAL_PROPOSAL_CONFLICT:
    "مقترح التعديل تغيّر أو تم التعامل معه. حدّث بيانات الطلب وراجع المقترح الحالي.",
  APPROVAL_TRANSACTION_CONFLICT: transactionConflict,
  AUTH_IDENTITY_CHANGED:
    "الحساب المرتبط بالجلسة تغيّر. سجّل الدخول بالحساب المطلوب للمتابعة.",
  AUTH_REAUTHENTICATION_REQUIRED: "سجّل الدخول مرة أخرى للمتابعة.",
  CONTRACT_ERROR: "ردّ الخادم غير متوقع. حدّث البيانات للتحقق من النتيجة.",
  CUSTOMER_NOT_FOUND: "بيانات العميل غير متاحة. راجع قائمة العملاء.",
  CUSTOMER_PHONE_CONFLICT:
    "رقم الهاتف مسجّل لعميل آخر. راجع الرقم أو اختر العميل الموجود.",
  CUSTOMER_VERSION_CONFLICT:
    "بيانات العميل تغيّرت أثناء التعديل. حدّثها وراجع التغييرات قبل الحفظ.",
  DEPARTMENT_ACCESS_DENIED:
    "حسابك لا يملك صلاحية الوصول لهذا القسم. راجع مسؤول النظام.",
  DRAFT_NOT_FOUND: "المسودة المطلوبة غير متاحة. حدّث قائمة المسودات.",
  DRAFT_PIECE_CONFLICT:
    "إحدى القطع المحددة غير متاحة في المسودة. حدّث المسودة وراجع القطع قبل الحفظ.",
  DRAFT_STATE_CONFLICT:
    "حالة المسودة الحالية تمنع تعديلها. حدّث بياناتها وراجع الحالة.",
  DRAFT_VERSION_CONFLICT:
    "المسودة تغيّرت أثناء التعديل. راجع النسخة الحالية قبل الحفظ.",
  INVALID_JSON: "تعذّر قراءة البيانات المرسلة. حدّث الصفحة وأعد المحاولة.",
  MANUFACTURING_COMMAND_CONFLICT: commandConflict,
  MANUFACTURING_COMMAND_NOT_FOUND: missingCommand,
  MANUFACTURING_SELECTION_CONFLICT: changedSelection,
  MANUFACTURING_TRANSACTION_CONFLICT: transactionConflict,
  MANUFACTURING_WORK_UNCHANGED:
    "بيانات التصنيع مطابقة للقيم الحالية. عدّل البيانات قبل الحفظ.",
  ORDER_CALENDAR_UNAVAILABLE:
    "تقويم العمل غير متاح لإرسال الطلب. احفظ المسودة وتواصل مع الإدارة.",
  ORDER_CATALOG_UNAVAILABLE:
    "لا تتوفر قوائم أو أسعار معتمدة لإرسال الطلب. احفظ المسودة وراجع الإدارة.",
  ORDER_CORRECTION_CONFLICT:
    "التصحيح يغيّر قطعًا أو بيانات ثابتة في الطلب. راجع المسموح بتعديله.",
  ORDER_CUSTOMER_CHANGED:
    "بيانات العميل تغيّرت. راجع بياناته الحالية قبل إرسال الطلب.",
  ORDER_NOT_FOUND: "الطلب المطلوب غير متاح. حدّث قائمة الطلبات.",
  ORDER_NUMBER_UNAVAILABLE:
    "تعذّر إصدار رقم للطلب حاليًا. احفظ المسودة وأعد المحاولة لاحقًا.",
  ORDER_PAID_UNCHANGED: "المبلغ المدفوع مطابق للقيمة المسجلة بالفعل.",
  ORDER_PRINT_NOT_APPROVED: "الطباعة متاحة بعد اعتماد طلب التصنيع.",
  ORDER_PRINT_REAPPROVAL_PENDING:
    "الطلب بانتظار اعتماد التعديلات. حدّث بيانات الطلب بعد الاعتماد للطباعة.",
  ORDER_PRINT_RETURNED:
    "أُعيد الطلب للمراجعة. الطباعة متاحة بعد اعتماده من جديد.",
  ORDER_QUOTE_CHANGED:
    "السعر أو بيانات التسعير تغيّرت. راجع عرض السعر الحالي قبل الإرسال.",
  ORDER_REVISION_NOT_FOUND:
    "نسخة الطلب المطلوبة غير متاحة. اختر نسخة من سجل الطلب.",
  ORDER_STATE_CONFLICT:
    "حالة الطلب الحالية تمنع تنفيذ الإجراء. حدّث بيانات الطلب وراجع الحالة.",
  ORDER_VERSION_CONFLICT:
    "الطلب تغيّر أثناء العمل عليه. حدّث البيانات وراجع التغييرات قبل المتابعة.",
  QUALITY_COMMAND_CONFLICT: commandConflict,
  QUALITY_COMMAND_NOT_FOUND: missingCommand,
  QUALITY_SELECTION_CONFLICT: changedSelection,
  QUALITY_TRANSACTION_CONFLICT: transactionConflict,
  QUALITY_WORK_UNCHANGED:
    "نتائج الفحص مطابقة للقيم الحالية. عدّل النتائج قبل الحفظ.",
  REPORT_SCOPE_TOO_LARGE:
    "نطاق التقرير كبير. قلّل الفترة أو ضيّق الفلاتر ثم أعد المحاولة.",
  SALES_COMMAND_CONFLICT: commandConflict,
  SALES_COMMAND_NOT_FOUND: missingCommand,
  SALES_TRANSACTION_CONFLICT: transactionConflict,
  STAFF_ACCESS_CONFLICT:
    "صلاحيات الموظف تغيّرت. حدّث بيانات الحساب وراجع الصلاحيات قبل الحفظ.",
  STAFF_ADMIN_TARGET_FORBIDDEN:
    "إدارة حسابات مديري النظام غير متاحة من شاشة الموظفين.",
  STAFF_COMMAND_CONFLICT: commandConflict,
  STAFF_NOT_FOUND: "حساب الموظف غير متاح. حدّث قائمة الموظفين.",
  STAFF_TRANSITION_CONFLICT:
    "حالة حساب الموظف الحالية تمنع الإجراء. حدّث بياناته وراجع الحالة.",
  VALIDATION_ERROR: "راجع القيم الموضّحة في الحقول قبل المتابعة.",
  WAREHOUSE_COMMAND_CONFLICT: commandConflict,
  WAREHOUSE_COMMAND_NOT_FOUND: missingCommand,
  WAREHOUSE_SELECTION_CONFLICT: changedSelection,
  WAREHOUSE_TRANSACTION_CONFLICT: transactionConflict,
};

// Some endpoints use the same generic code for distinct, public reasons.
const knownReasons: Readonly<Record<string, string>> = {
  "BAD_REQUEST:Current password is not correct.":
    "كلمة المرور الحالية غير صحيحة. اكتبها مرة أخرى.",
  "BAD_REQUEST:Invalid or expired verification token.":
    "رابط تأكيد البريد غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.",
  "BAD_REQUEST:New password must differ from current password.":
    "اختر كلمة مرور جديدة مختلفة عن كلمة المرور الحالية.",
  "BAD_REQUEST:Refresh token is required.": sessionCopy,
  "BAD_REQUEST:The effective date range must contain valid ordered calendar dates.":
    "أدخل تاريخي بداية ونهاية صحيحين، واجعل النهاية في يوم البداية أو بعده.",
  "CONFLICT:A conflicting transaction is in progress. Retry the request.":
    transactionConflict,
  "CONFLICT:A related record prevents this operation.":
    "توجد بيانات مرتبطة بهذا السجل تمنع تنفيذ الإجراء. راجعها ثم حاول مرة أخرى.",
  "CONFLICT:A unique constraint prevents this operation.":
    "توجد بيانات مسجّلة بالقيمة نفسها. راجع القيم أو اختر السجل الموجود.",
  "CONFLICT:Email is already in use.":
    "البريد الإلكتروني مسجّل بالفعل. استخدم بريدًا مختلفًا أو راجع الحساب الموجود.",
  "FORBIDDEN:Origin is not allowed by CORS.":
    "عنوان الموقع الحالي غير مسموح له بالاتصال بالخادم. افتح رابط النظام المعتمد.",
  "FORBIDDEN:Account is suspended.":
    "الحساب موقوف حاليًا. تواصل مع إدارة المصنع لإعادة تفعيله.",
  "FORBIDDEN:CSRF validation failed.":
    "تعذّر التحقق من أمان الجلسة. حدّث الصفحة أو سجّل الدخول مرة أخرى.",
  "FORBIDDEN:Only administrators can manage staff accounts.":
    "إدارة حسابات الموظفين متاحة لمديري النظام فقط.",
  "SERVICE_UNAVAILABLE:Registration is temporarily unavailable. Please try again.":
    "تعذّر إرسال رسالة تأكيد البريد. أعد المحاولة بعد قليل.",
  "UNAUTHORIZED:Invalid credentials.":
    "البريد الإلكتروني أو كلمة المرور غير صحيحة. راجع البيانات وحاول مرة أخرى.",
  "UNAUTHORIZED:Invalid or expired reset token.":
    "رابط استعادة كلمة المرور غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.",
};

export const unexpectedErrorCopy =
  "تعذّر إكمال الطلب. إذا تكررت المشكلة، تواصل مع الدعم.";

export function apiErrorCopy(
  status: number,
  code: string,
  message = "",
): string {
  const reason = `${code}:${message}`;
  const knownReason = Object.hasOwn(knownReasons, reason)
    ? knownReasons[reason]
    : undefined;
  const knownCode = Object.hasOwn(codeCopy, code) ? codeCopy[code] : undefined;
  return knownReason ?? knownCode ?? statusCopy[status] ?? unexpectedErrorCopy;
}
