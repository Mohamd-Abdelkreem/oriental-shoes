import type { MvpOrder } from "./mvp-types";
import { makePiece } from "./fixture-builders";
import { makeSegment } from "./mvp-selectors";

export const deliveryOrders: MvpOrder[] = [
  // 10. 100% Ready for Delivery in Warehouse
  {
    id: "EXTERNAL-2026-0002",
    type: "EXTERNAL",
    customer: "سعود المنصور",
    phone: "0501112233",
    address: "طريق المدينة، جدة",
    salesperson: "ريم خالد",
    created: "٢٨ أغسطس ٢٠٢٦",
    createdIso: "2026-08-28",
    delivery: "١٥ سبتمبر ٢٠٢٦",
    deliveryIso: "2026-09-15",
    status: "جاهز للتسليم",
    cancelled: 0,
    warehouse: 4,
    items: [
      makePiece("i-02-1", 0, "OS-175", {
        size: "٤٣",
        leatherBase: "جلد تمساح أسود",
        currentLocation: "في المستودع",
        deptStatus: "مكتملة",
      }),
      makePiece("i-02-2", 1, "OS-175", {
        size: "٤٣",
        leatherBase: "جلد تمساح أسود",
        currentLocation: "في المستودع",
        deptStatus: "مكتملة",
      }),
      makePiece("i-02-3", 2, "OS-175", {
        size: "٤٣",
        leatherBase: "جلد تمساح أسود",
        currentLocation: "في المستودع",
        deptStatus: "مكتملة",
      }),
      makePiece("i-02-4", 3, "OS-175", {
        size: "٤٣",
        leatherBase: "جلد تمساح أسود",
        currentLocation: "في المستودع",
        deptStatus: "مكتملة",
      }),
    ],
    segments: [
      makeSegment(
        "s-02",
        "i-02-1",
        "المستودع",
        4,
        "مستلم",
        "مكتمل ١٠٠٪ في المستودع ومجهز في كراتين",
      ),
    ],
    cartonCount: "٢",
    cartonNumbers: "C-41، C-42",
    packagingNote: "كراتين فاخرة مع أكياس قماشية وحافظة خشبية",
  },
  // 11. Out with Representative
  {
    id: "SHOP-2026-0005",
    type: "SHOP",
    customer: "فارس القحطاني",
    phone: "0536001882",
    address: "حي الشاطئ، جدة",
    salesperson: "ليان سعد",
    created: "٢٥ أغسطس ٢٠٢٦",
    createdIso: "2026-08-25",
    delivery: "١٢ سبتمبر ٢٠٢٦",
    deliveryIso: "2026-09-12",
    status: "خرج مع المندوب",
    cancelled: 0,
    warehouse: 3,
    items: [
      makePiece("i-05-1", 0, "OS-201", {
        size: "٤٢",
        currentLocation: "مع المندوب",
        deptStatus: "مكتملة",
      }),
      makePiece("i-05-2", 1, "OS-201", {
        size: "٤٢",
        currentLocation: "مع المندوب",
        deptStatus: "مكتملة",
      }),
      makePiece("i-05-3", 2, "OS-201", {
        size: "٤٢",
        currentLocation: "مع المندوب",
        deptStatus: "مكتملة",
      }),
    ],
    segments: [
      makeSegment(
        "s-05",
        "i-05-1",
        "مع المندوب",
        3,
        "خرج مع المندوب",
        "خرجت الشحنة مع المندوب فهد الحربي",
      ),
    ],
    deliveryAttempts: [
      {
        id: "da-5",
        status: "مع المندوب",
        time: "١٢ سبتمبر · ١١:٣٠",
        actor: "سارة محمد",
        note: "تم تسليم الشحنة لمندوب التوصيل فهد الحربي",
      },
    ],
  },
  // 12. Failed Delivery
  {
    id: "REPAIR-2026-0001",
    type: "REPAIR",
    customer: "مازن فؤاد",
    phone: "0568322910",
    address: "حي النسيم، جدة",
    salesperson: "ريم خالد",
    created: "٢٠ أغسطس ٢٠٢٦",
    createdIso: "2026-08-20",
    delivery: "٠٥ سبتمبر ٢٠٢٦",
    deliveryIso: "2026-09-05",
    status: "تعذر التسليم",
    cancelled: 0,
    warehouse: 1,
    items: [
      makePiece("i-r1", 0, "إصلاح كعب", {
        unitPrice: "120",
        rowTotal: "120",
        currentLocation: "في المستودع",
        deptStatus: "بها مشكلة",
      }),
    ],
    segments: [
      makeSegment(
        "s-r1",
        "i-r1",
        "المستودع",
        1,
        "جاهز لمحاولة أخرى",
        "العميل لم يرد على الاتصال",
      ),
    ],
    deliveryNote: "الهاتف مغلق طوال اليوم، تم الاتصال ٣ مرات دون رد",
    deliveryAttempts: [
      {
        id: "da-r1",
        status: "تعذر التسليم",
        time: "٠٥ سبتمبر · ١٨:١٥",
        actor: "سارة محمد",
        note: "الهاتف مغلق ولم يتم الوصول للعنوان",
      },
    ],
  },
  // 13. Fully Delivered
  {
    id: "EXTERNAL-2026-0001",
    type: "EXTERNAL",
    customer: "مؤسسة خطوة",
    phone: "0558871200",
    address: "حي الروضة، مكة",
    salesperson: "ريم خالد",
    created: "١٥ أغسطس ٢٠٢٦",
    createdIso: "2026-08-15",
    delivery: "٣٠ أغسطس ٢٠٢٦",
    deliveryIso: "2026-08-30",
    status: "تم الاستلام",
    cancelled: 0,
    warehouse: 2,
    items: [
      makePiece("i-d1-1", 0, "OS-166", {
        currentLocation: "تم الاستلام",
        deptStatus: "مكتملة",
      }),
      makePiece("i-d1-2", 1, "OS-166", {
        currentLocation: "تم الاستلام",
        deptStatus: "مكتملة",
      }),
    ],
    segments: [
      makeSegment(
        "s-d1",
        "i-d1-1",
        "تم الاستلام",
        2,
        "تم الاستلام",
        "استلم العميل الطلب بالكامل",
      ),
    ],
    deliveryAttempts: [
      {
        id: "da-1",
        status: "تم الاستلام",
        time: "٣٠ أغسطس · ١٧:٤٠",
        actor: "سارة محمد",
        note: "تم تسليم الطلب للعميل واستلام الإشعار",
      },
    ],
  },
  // 14. Completely Cancelled Order
  {
    id: "SHOP-2026-0002",
    type: "SHOP",
    customer: "عبدالله سالم",
    phone: "0504412098",
    address: "حي الفيصلية، جدة",
    salesperson: "ريم خالد",
    created: "١٥ أغسطس ٢٠٢٦",
    createdIso: "2026-08-15",
    delivery: "٣٠ أغسطس ٢٠٢٦",
    deliveryIso: "2026-08-30",
    status: "ملغي بالكامل",
    cancelled: 2,
    warehouse: 0,
    items: [
      makePiece("i-c2-1", 0, "OS-140", {
        isDeleted: true,
        currentLocation: "ملغاة",
      }),
      makePiece("i-c2-2", 1, "OS-140", {
        isDeleted: true,
        currentLocation: "ملغاة",
      }),
    ],
    segments: [
      makeSegment(
        "s-c2",
        "i-c2",
        "ملغاة",
        2,
        "ملغاة",
        "إلغاء بناءً على طلب العميل قبل بدء القص",
      ),
    ],
    returnReason:
      "تم الإلغاء الكامل من الإدارة بناءً على طلب العميل لاسترداد المبلغ",
  },
];
