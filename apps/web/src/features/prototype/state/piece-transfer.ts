import type {
  DeptWorkingStatus,
  PieceLocation,
  ProductLine,
} from "./mvp-types";

function transferDestination(stage: string): {
  currentLocation: PieceLocation;
  deptStatus: DeptWorkingStatus;
} {
  if (["الجودة والتغليف", "في الجودة", "الجودة"].includes(stage)) {
    return { currentLocation: "في الجودة", deptStatus: "جاهزة للفحص" };
  }
  if (["المستودع", "في المستودع"].includes(stage)) {
    return { currentLocation: "في المستودع", deptStatus: "جاهزة للعمل" };
  }
  return { currentLocation: "في الإنتاج", deptStatus: "جاهزة للعمل" };
}

export function transferredPieces(
  pieces: ProductLine[],
  pieceIds: string[],
  stage: string,
): ProductLine[] {
  const selectedIds = new Set(pieceIds);
  const destination = transferDestination(stage);
  return pieces.map((piece) =>
    selectedIds.has(piece.id)
      ? {
          ...piece,
          ...destination,
          responsibleWorker: undefined,
          rejection: undefined,
        }
      : piece,
  );
}
