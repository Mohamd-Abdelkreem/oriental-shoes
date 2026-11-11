import type {
  MvpOrder,
  ProductLine,
  QuantitySegment,
  Role,
  Stage,
} from "@/features/prototype/state/mvp-store";
import type { DepartmentTab } from "./department-order-tabs";
import type { PieceTableRow } from "./piece-table-row";

import type {
  SalesOrderType,
  ManufacturingDepartment,
  ManufacturingPiecesData,
  ManufacturingPiecesQuery,
  ManufacturingOrderSummary,
} from "@template/contracts";
import type {
  ManufacturingPieceTarget,
  ManufacturingWorkRow,
  ManufacturingWorkGroup,
  ManufacturingGroupDetailState,
  ManufacturingSelectionPresentation,
} from "../model/manufacturing-view.model";

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

export type ManufacturingRowCallbacks = Readonly<{
  onReceiveAndStart: (targets: readonly ManufacturingPieceTarget[]) => void;
  onContinue: (targets: readonly ManufacturingPieceTarget[]) => void;
  onCompleteTransfer: (targets: readonly ManufacturingPieceTarget[]) => void;
  onReportIssue: (target: ManufacturingPieceTarget) => void;
}>;
export type ManufacturingTableMode = "grouped" | "flat";
export type ManufacturingTypeFilter = SalesOrderType | "ALL";
export type ManufacturingTablePagination = Readonly<{
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}>;
export type ManufacturingTableResult =
  | Readonly<{
      queryStatus: "loading";
      rows: readonly [];
      groups: readonly [];
      counts: null;
      pagination: null;
      failure: null;
    }>
  | Readonly<{
      queryStatus: "error";
      rows: readonly [];
      groups: readonly [];
      counts: null;
      pagination: null;
      failure: string;
    }>
  | Readonly<{
      queryStatus: "ready" | "refreshing";
      rows: readonly ManufacturingWorkRow[];
      groups: readonly ManufacturingOrderSummary[];
      counts: Readonly<ManufacturingPiecesData["counts"]>;
      pagination: ManufacturingTablePagination;
      failure: string | null;
    }>;
export type PersistedDepartmentTableProps = Readonly<{
  source: "persisted";
  department: ManufacturingDepartment;
  view: ManufacturingPiecesQuery["view"];
  searchValue: string;
  searchError: string | null;
  onSearchChange: (value: string) => void;
  typeFilter: ManufacturingTypeFilter;
  typeFilterLocked: boolean;
  onTypeFilterChange: (value: ManufacturingTypeFilter) => void;
  onClearFilters: () => void;
  mode: ManufacturingTableMode;
  onModeChange: (mode: ManufacturingTableMode) => void;
  busy: boolean;
  onRetry: () => void;
  selectedTargets: readonly ManufacturingPieceTarget[];
  onToggleSelect: (target: ManufacturingPieceTarget) => void;
  onToggleSelectMultiple: (
    targets: readonly ManufacturingPieceTarget[],
    select: boolean,
  ) => void;
  onClearSelection: () => void;
  expandedOrderIds: readonly string[];
  groupDetails: ReadonlyMap<string, ManufacturingGroupDetailState>;
  onToggleExpand: (summary: ManufacturingOrderSummary) => void;
  selection: ManufacturingSelectionPresentation;
  onLoadGroup: (
    summary: ManufacturingOrderSummary,
  ) => Promise<ManufacturingWorkGroup>;
  callbacks: ManufacturingRowCallbacks;
}> &
  ManufacturingTableResult;

export type PersistedDepartmentPieceActionsProps = Readonly<{
  source: "persisted";
  row: ManufacturingWorkRow;
  appearance: "table" | "card";
  busy: boolean;
  callbacks: ManufacturingRowCallbacks;
}>;
export type PersistedDepartmentOrderCardProps = Readonly<{
  source: "persisted";
  summary: ManufacturingOrderSummary;
  group: ManufacturingWorkGroup | null;
  expanded: boolean;
  loading: boolean;
  busy: boolean;
  failure: string | null;
  selectedTargets: readonly ManufacturingPieceTarget[];
  onToggleExpand: () => void;
  onRetry: () => void;
  onToggleSelect: (target: ManufacturingPieceTarget) => void;
  onToggleSelectMultiple: (
    targets: readonly ManufacturingPieceTarget[],
    select: boolean,
  ) => void;
  callbacks: ManufacturingRowCallbacks;
}>;
export type PersistedDepartmentBatchActionsProps = Readonly<{
  source: "persisted";
  department: ManufacturingDepartment;
  view: ManufacturingPiecesQuery["view"];
  selectedTargets: readonly ManufacturingPieceTarget[];
  selection: ManufacturingSelectionPresentation;
  busy: boolean;
  callbacks: ManufacturingRowCallbacks;
  onClearSelection: () => void;
}>;
