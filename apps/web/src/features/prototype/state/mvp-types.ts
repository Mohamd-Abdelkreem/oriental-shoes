import type { Role } from "@/features/prototype/fixtures/prototype-data";

export type Stage =
  | "القص"
  | "الإنتاج والإصلاح"
  | "العمليات الخاصة"
  | "الجودة والتغليف"
  | "المستودع"
  | "مع المندوب"
  | "تم الاستلام"
  | "ملغاة";

export type PieceLocation =
  | "في القص"
  | "في العمليات الخاصة"
  | "في الإنتاج"
  | "في الجودة"
  | "في المستودع"
  | "لدى الاعتماد بسبب مشكلة"
  | "مع المندوب"
  | "تم الاستلام"
  | "تم التسليم"
  | "ملغاة";

export type DeptWorkingStatus =
  | "جاهزة للعمل"
  | "جاري العمل"
  | "مكتملة"
  | "بها مشكلة"
  | "جاهزة للفحص"
  | "جاري الفحص"
  | "مجازة ومغلفة"
  | "مرتجعة للتصحيح";

export type PieceProblem = {
  reportedByDept: string;
  reportedByWorker: string;
  reason: string;
  notes: string;
  reportedAt: string;
  status?: "pending" | "resolved" | "sent_to_sales" | "deleted" | undefined;
  approvalAction?: "return_to_dept" | "send_to_sales" | "delete" | undefined;
  approvalNotes?: string | undefined;
  salesNotes?: string | undefined;
  resolvedAt?: string | undefined;
};

export type PieceRejection = {
  responsibleDept: "القص" | "الإنتاج والإصلاح" | "العمليات الخاصة";
  reason: string;
  notes: string;
  cycle: number;
  returnedAt: string;
  resolved?: boolean | undefined;
};

export type QuantitySegment = {
  id: string;
  itemId: string;
  stage: Stage;
  quantity: number;
  state: string;
  source?: string | undefined;
  note?: string | undefined;
  cycle?: number | undefined;
  worker?: string | undefined;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
};

export type ProductLine = {
  id: string;
  pieceNumber?: string | undefined; // e.g. "القطعة 01"
  model: string;
  quantity: number; // Always 1 for each piece row
  size: string;
  leatherBase: string;
  decoration: string;
  decorationColor: string;
  face: string;
  faceRight?: string | undefined; // م١
  faceLeft?: string | undefined; // م٢
  mixing?: string | undefined; // م٣
  sole: string;
  soleColor: string;
  additions: string;
  aField?: string | undefined;
  fField?: string | undefined;
  sideNotes?: string | undefined;
  unitPrice?: string | undefined;
  rowTotal?: string | undefined;
  // Per-piece manufacturing tracking
  currentLocation?: PieceLocation | undefined;
  deptStatus?: DeptWorkingStatus | undefined;
  responsibleWorker?: string | undefined;
  specialOpRequired?: boolean | undefined;
  specialOpNote?: string | undefined;
  problem?: PieceProblem | undefined;
  rejection?: PieceRejection | undefined;
  isDeleted?: boolean | undefined;
  deletedReason?: string | undefined;
  deletedAt?: string | undefined;
  previousValues?: Record<string, string> | undefined;
};

export type Carton = {
  id: string;
  orderId: string;
  number: string;
  note?: string | undefined;
};

export type DeliveryAttempt = {
  id: string;
  status:
    "مع المندوب" | "تعذر التسليم" | "إعادة محاولة التسليم" | "تم الاستلام";
  time: string;
  actor: string;
  note?: string | undefined;
};

export type QualityCorrectionCycle = {
  id: string;
  itemId: string;
  segmentId: string;
  quantity: number;
  responsible: "القص" | "الإنتاج والإصلاح" | "العمليات الخاصة";
  reason: string;
  instructions: string;
  cycle: number;
  date?: string | undefined;
  actor?: string | undefined;
  resolved?: boolean | undefined;
};

export type MvpOrder = {
  id: string;
  type: "SHOP" | "EXTERNAL" | "REPAIR";
  customer: string;
  phone: string;
  address: string;
  salesperson: string;
  created: string;
  createdIso?: string | undefined;
  delivery: string;
  deliveryIso?: string | undefined;
  status: string;
  cancelled: number;
  warehouse: number;
  items: ProductLine[];
  segments: QuantitySegment[];
  hijriDate?: string | undefined;
  generalNotes?: string | undefined;
  responsibleSignature?: string | undefined;
  total?: string | undefined;
  paid?: string | undefined;
  balance?: string | undefined;
  repairNote?: string | undefined;
  returnReason?: string | undefined;
  reviewer?: string | undefined;
  returnedAt?: string | undefined;
  cartonCount?: string | undefined;
  cartonNumbers?: string | undefined;
  cartons?: Carton[] | undefined;
  packagingNote?: string | undefined;
  deliveryNote?: string | undefined;
  deliveryAttempts?: DeliveryAttempt[] | undefined;
  corrections?: QualityCorrectionCycle[] | undefined;
  selectedBoxes?: string[] | undefined;
  // Convenience aliases for UI consistency
  customerName?: string | undefined;
  customerPhone?: string | undefined;
  deliveryDate?: string | undefined;
  createdAt?: string | undefined;
  notes?: string | undefined;
  salesRep?: string | undefined;
  cancelledQuantity?: number | undefined;
  stage?: Stage | undefined;
  warehouseLocation?: string | undefined;
  deliveryNotes?: string | undefined;
  remedyCount?: number | undefined;
  reopenedBy?: string | undefined;
  reopenedAt?: string | undefined;
  reopenReason?: string | undefined;
  failureReason?: string | undefined;
};

export type MvpEmployee = {
  name: string;
  email: string;
  phone: string;
  requested: Role;
  role?: Role | undefined;
  status: "بانتظار الموافقة" | "مرفوض" | "فعال" | "موقوف";
  password: string;
  registered: string;
};

export type MvpCustomer = {
  name: string;
  phone: string;
  address: string;
  email: string;
  notes: string;
};

export type LogEvent = {
  id: string;
  orderId: string;
  event: string;
  actor: string;
  role: string;
  time: string;
  timestamp?: string | undefined;
  quantity?: number | undefined;
  source?: string | undefined;
  destination?: string | undefined;
  note?: string | undefined;
  stage?: string | undefined;
};

export type MvpEvent = LogEvent;
