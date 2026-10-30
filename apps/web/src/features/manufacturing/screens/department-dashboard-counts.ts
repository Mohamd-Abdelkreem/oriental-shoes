import type {
  DeptWorkingStatus,
  MvpOrder,
  PieceLocation,
} from "@/features/prototype/state/mvp-types";
import type {
  DashboardSectionId,
  DepartmentRole,
} from "./department-dashboard-config";

type PieceCountRules = {
  location: PieceLocation;
  incomingStatuses: DeptWorkingStatus[];
  inProgressStatuses: DeptWorkingStatus[];
  completedStatuses: DeptWorkingStatus[];
  completedLocations: PieceLocation[];
  includeRejections: boolean;
};

const departmentRules: Record<DepartmentRole, PieceCountRules> = {
  cutting: {
    location: "في القص",
    incomingStatuses: ["جاهزة للعمل"],
    inProgressStatuses: ["جاري العمل"],
    completedStatuses: ["مكتملة"],
    completedLocations: [
      "في الإنتاج",
      "في الجودة",
      "في المستودع",
      "تم التسليم",
    ],
    includeRejections: true,
  },
  production: {
    location: "في الإنتاج",
    incomingStatuses: ["جاهزة للعمل"],
    inProgressStatuses: ["جاري العمل"],
    completedStatuses: ["مكتملة"],
    completedLocations: ["في الجودة", "في المستودع", "تم التسليم"],
    includeRejections: true,
  },
  quality: {
    location: "في الجودة",
    incomingStatuses: ["جاهزة للفحص", "جاهزة للعمل"],
    inProgressStatuses: ["جاري الفحص", "جاري العمل"],
    completedStatuses: ["مجازة ومغلفة", "مكتملة"],
    completedLocations: ["في المستودع", "تم التسليم"],
    includeRejections: true,
  },
  warehouse: {
    location: "في المستودع",
    incomingStatuses: ["جاهزة للعمل"],
    inProgressStatuses: ["جاري العمل", "مكتملة"],
    completedStatuses: [],
    completedLocations: ["تم التسليم", "تم الاستلام"],
    includeRejections: false,
  },
};

export function dashboardPieceCounts(
  orders: MvpOrder[],
  role: DepartmentRole,
): Record<DashboardSectionId, number> {
  const pieces = orders.flatMap((order) =>
    order.items.filter((piece) => !piece.isDeleted),
  );
  const rules = departmentRules[role];
  return {
    incoming: pieces.filter(
      (piece) =>
        piece.currentLocation === rules.location &&
        (!piece.deptStatus ||
          rules.incomingStatuses.includes(piece.deptStatus)),
    ).length,
    inProgress: pieces.filter(
      (piece) =>
        piece.currentLocation === rules.location &&
        piece.deptStatus !== undefined &&
        rules.inProgressStatuses.includes(piece.deptStatus),
    ).length,
    returned: pieces.filter(
      (piece) =>
        piece.deptStatus === "بها مشكلة" ||
        piece.deptStatus === "مرتجعة للتصحيح" ||
        piece.currentLocation === "لدى الاعتماد بسبب مشكلة" ||
        Boolean(piece.problem) ||
        (rules.includeRejections && Boolean(piece.rejection)),
    ).length,
    completed: pieces.filter(
      (piece) =>
        (piece.deptStatus !== undefined &&
          rules.completedStatuses.includes(piece.deptStatus)) ||
        (piece.currentLocation !== undefined &&
          rules.completedLocations.includes(piece.currentLocation)),
    ).length,
  };
}
