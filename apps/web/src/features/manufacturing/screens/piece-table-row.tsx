"use client";

import type {
  MvpOrder,
  ProductLine,
  PieceLocation,
  DeptWorkingStatus,
} from "@/features/prototype/state/mvp-store";

export type PieceTableRow = {
  id: string; // unique row id
  order: MvpOrder;
  piece: ProductLine;
  pieceIndex: number;
  totalPiecesInOrder: number;
  currentLocation: PieceLocation;
  deptStatus: DeptWorkingStatus;
  lastUpdate: string;
};
