import type {
  MvpOrder,
  ProductLine,
  QuantitySegment,
  Role,
  Stage,
} from "@/features/prototype/state/mvp-store";
import type { DepartmentTab } from "./department-order-tabs";
import type { PieceTableRow } from "./piece-table-row";

export type DepartmentPieceTableProps = {
  rows: PieceTableRow[];
  activeTab: DepartmentTab;
  selectedPieceKeys: string[];
  onToggleSelect: (key: string) => void;
  onToggleSelectMultiple?:
    ((keys: string[], select: boolean) => void) | undefined;
  deptRole: Exclude<Role, "admin" | "sales" | "approval">;
  stageName: Stage;
  actionButtonLabel?: string | undefined;
  onAction?: ((order: MvpOrder, segment?: QuantitySegment) => void) | undefined;
  emptyTitle?: string | undefined;
  emptySubtitle?: string | undefined;
};

export type DepartmentPieceContext = Pick<
  DepartmentPieceTableProps,
  "activeTab" | "deptRole" | "stageName" | "actionButtonLabel" | "onAction"
>;
export type PieceModalTarget = { order: MvpOrder; piece: ProductLine };
export type OrderPieceGroup = { order: MvpOrder; rows: PieceTableRow[] };
