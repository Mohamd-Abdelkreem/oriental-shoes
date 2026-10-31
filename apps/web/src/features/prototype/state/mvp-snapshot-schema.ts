import { orderTypeValues } from "@/features/orders/order-types";
import { z } from "zod";
import type { Snapshot } from "./mvp-provider";

const currentDepartment = (department: unknown): unknown => {
  if (department === "العمليات الخاصة") return "الإنتاج والإصلاح";
  if (department === "قسم العمليات الخاصة") return "قسم الإنتاج والإصلاح";
  if (department === "في العمليات الخاصة") return "في الإنتاج";
  return department;
};

const currentOrderStatus = (status: unknown): unknown =>
  status === "بالعمليات الخاصة" || status === "قيد العمليات الخاصة"
    ? "قيد الإنتاج"
    : status;

const roleSchema = z.preprocess(
  (role) => (role === "special" ? "production" : role),
  z.enum([
    "admin",
    "sales",
    "approval",
    "cutting",
    "production",
    "quality",
    "warehouse",
  ]),
);

// Unknown fields and historical events must survive a workspace migration.
const stageSchema = z.preprocess(
  currentDepartment,
  z.enum([
    "القص",
    "الإنتاج والإصلاح",
    "الجودة والتغليف",
    "المستودع",
    "مع المندوب",
    "تم الاستلام",
    "ملغاة",
  ]),
);

const pieceLocationSchema = z.preprocess(
  currentDepartment,
  z.enum([
    "في القص",
    "في الإنتاج",
    "في الجودة",
    "في المستودع",
    "لدى الاعتماد بسبب مشكلة",
    "مع المندوب",
    "تم الاستلام",
    "تم التسليم",
    "ملغاة",
  ]),
);

const deptWorkingStatusSchema = z.enum([
  "جاهزة للعمل",
  "جاري العمل",
  "مكتملة",
  "بها مشكلة",
  "جاهزة للفحص",
  "جاري الفحص",
  "مجازة ومغلفة",
  "مرتجعة للتصحيح",
]);

const pieceProblemSchema = z.looseObject({
  reportedByDept: z.preprocess(currentDepartment, z.string()),
  reportedByWorker: z.string(),
  reason: z.string(),
  notes: z.string(),
  reportedAt: z.string(),
  status: z
    .enum(["pending", "resolved", "sent_to_sales", "deleted"])
    .optional(),
  approvalAction: z
    .enum(["return_to_dept", "send_to_sales", "delete"])
    .optional(),
  approvalNotes: z.string().optional(),
  salesNotes: z.string().optional(),
  resolvedAt: z.string().optional(),
});

const pieceRejectionSchema = z.looseObject({
  responsibleDept: z.preprocess(
    currentDepartment,
    z.enum(["القص", "الإنتاج والإصلاح"]),
  ),
  reason: z.string(),
  notes: z.string(),
  cycle: z.number(),
  returnedAt: z.string(),
  resolved: z.boolean().optional(),
});

const quantitySegmentSchema = z.looseObject({
  id: z.string(),
  itemId: z.string(),
  stage: stageSchema,
  quantity: z.number(),
  state: z.string(),
  source: z.preprocess(currentDepartment, z.string()).optional(),
  note: z.string().optional(),
  cycle: z.number().optional(),
  worker: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

const productLineSchema = z.looseObject({
  id: z.string(),
  pieceNumber: z.string().optional(),
  model: z.string(),
  quantity: z.number(),
  size: z.string(),
  leatherBase: z.string(),
  decoration: z.string(),
  decorationColor: z.string(),
  face: z.string(),
  faceRight: z.string().optional(),
  faceLeft: z.string().optional(),
  mixing: z.string().optional(),
  sole: z.string(),
  soleColor: z.string(),
  additions: z.string(),
  aField: z.string().optional(),
  fField: z.string().optional(),
  sideNotes: z.string().optional(),
  unitPrice: z.string().optional(),
  rowTotal: z.string().optional(),
  currentLocation: pieceLocationSchema.optional(),
  deptStatus: deptWorkingStatusSchema.optional(),
  responsibleWorker: z.string().optional(),
  problem: pieceProblemSchema.optional(),
  rejection: pieceRejectionSchema.optional(),
  isDeleted: z.boolean().optional(),
  deletedReason: z.string().optional(),
  deletedAt: z.string().optional(),
  previousValues: z.record(z.string(), z.string()).optional(),
});

const cartonSchema = z.looseObject({
  id: z.string(),
  orderId: z.string(),
  number: z.string(),
  note: z.string().optional(),
});

const deliveryAttemptSchema = z.looseObject({
  id: z.string(),
  status: z.enum([
    "مع المندوب",
    "تعذر التسليم",
    "إعادة محاولة التسليم",
    "تم الاستلام",
  ]),
  time: z.string(),
  actor: z.string(),
  note: z.string().optional(),
});

const qualityCorrectionCycleSchema = z.looseObject({
  id: z.string(),
  itemId: z.string(),
  segmentId: z.string(),
  quantity: z.number(),
  responsible: z.preprocess(
    currentDepartment,
    z.enum(["القص", "الإنتاج والإصلاح"]),
  ),
  reason: z.string(),
  instructions: z.string(),
  cycle: z.number(),
  date: z.string().optional(),
  actor: z.string().optional(),
  resolved: z.boolean().optional(),
});

const mvpOrderSchema = z.looseObject({
  id: z.string(),
  type: z.enum(orderTypeValues),
  customer: z.string(),
  phone: z.string(),
  address: z.string(),
  salesperson: z.string(),
  created: z.string(),
  createdIso: z.string().optional(),
  delivery: z.string(),
  deliveryIso: z.string().optional(),
  status: z.preprocess(currentOrderStatus, z.string()),
  cancelled: z.number(),
  warehouse: z.number(),
  items: z.array(productLineSchema),
  segments: z.array(quantitySegmentSchema),
  hijriDate: z.string().optional(),
  generalNotes: z.string().optional(),
  responsibleSignature: z.string().optional(),
  total: z.string().optional(),
  paid: z.string().optional(),
  balance: z.string().optional(),
  repairNote: z.string().optional(),
  adjustmentRequested: z.string().optional(),
  adjustmentReason: z.string().optional(),
  adjustmentActionTaken: z.string().optional(),
  returnReason: z.string().optional(),
  reviewer: z.string().optional(),
  returnedAt: z.string().optional(),
  cartonCount: z.string().optional(),
  cartonNumbers: z.string().optional(),
  cartons: z.array(cartonSchema).optional(),
  packagingNote: z.string().optional(),
  deliveryNote: z.string().optional(),
  deliveryAttempts: z.array(deliveryAttemptSchema).optional(),
  corrections: z.array(qualityCorrectionCycleSchema).optional(),
  selectedBoxes: z.array(z.string()).optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  deliveryDate: z.string().optional(),
  createdAt: z.string().optional(),
  notes: z.string().optional(),
  salesRep: z.string().optional(),
  cancelledQuantity: z.number().optional(),
  stage: stageSchema.optional(),
  warehouseLocation: z.string().optional(),
  deliveryNotes: z.string().optional(),
  remedyCount: z.number().optional(),
  reopenedBy: z.string().optional(),
  reopenedAt: z.string().optional(),
  reopenReason: z.string().optional(),
  failureReason: z.string().optional(),
});

const mvpEmployeeSchema = z.looseObject({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  requested: roleSchema,
  role: roleSchema.optional(),
  status: z.enum(["بانتظار الموافقة", "مرفوض", "فعال", "موقوف"]),
  password: z.string(),
  registered: z.string(),
});

const mvpCustomerSchema = z.looseObject({
  name: z.string(),
  phone: z.string(),
  address: z.string(),
  email: z.string(),
  notes: z.string(),
});

const logEventSchema = z.looseObject({
  id: z.string(),
  orderId: z.string(),
  event: z.string(),
  actor: z.string(),
  role: z.string(),
  time: z.string(),
  timestamp: z.string().optional(),
  quantity: z.number().optional(),
  source: z.string().optional(),
  destination: z.string().optional(),
  note: z.string().optional(),
  stage: z.string().optional(),
});

export const snapshotSchema: z.ZodType<Snapshot> = z.looseObject({
  orders: z.array(mvpOrderSchema),
  employees: z.array(mvpEmployeeSchema),
  customers: z.array(mvpCustomerSchema),
  events: z.array(logEventSchema),
  sessionRole: roleSchema.nullable(),
});
