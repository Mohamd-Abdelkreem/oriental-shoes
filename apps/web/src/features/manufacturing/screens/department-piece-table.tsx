"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckSquare, Eye, Square } from "lucide-react";
import {
  useMvpStore,
  typeLabels,
  formatPieceSequence,
  type MvpOrder,
  type ProductLine,
  type Role,
} from "@/features/prototype/state/mvp-store";
import { roleUsers } from "@/features/prototype/fixtures/prototype-data";

import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";
import { getDeptLocation } from "./get-dept-location";
import { getDeptArabicName } from "./get-dept-arabic-name";
import type { PieceTableRow } from "./piece-table-row";
import { getNextDeptForPiece } from "./get-next-dept-for-piece";
import { getDeptSpecsSummary } from "./get-dept-specs-summary";
import { PieceLocationBadge } from "./piece-location-badge";
import { OrderAllPiecesModal } from "./order-all-pieces-modal";
import { PieceReportProblemModal } from "./piece-report-problem-modal";
import { QualityInspectPieceModal } from "./quality-inspect-piece-modal";

export function DepartmentPieceTable({
  rows,
  allPiecesModalOrder,
  onSelectOrder,
  activeTab,
  selectedPieceKeys,
  onToggleSelect,
  deptRole,
  emptyTitle,
  emptySubtitle,
  showToast,
}: {
  rows: PieceTableRow[];
  allPiecesModalOrder: MvpOrder | null;
  onSelectOrder: (order: MvpOrder | null) => void;
  activeTab: "ready" | "in_progress" | "completed" | "problems";
  selectedPieceKeys: string[];
  onToggleSelect: (key: string) => void;
  deptRole: Exclude<Role, "admin" | "sales" | "approval">;
  emptyTitle?: string | undefined;
  emptySubtitle?: string | undefined;
  showToast: (message: string) => void;
}) {
  const store = useMvpStore();
  const targetLocation = getDeptLocation(deptRole);
  const deptRoleName = getDeptArabicName(deptRole);
  const currentWorker = roleUsers[deptRole].name || "فني القسم";
  const [problemModalData, setProblemModalData] = useState<{
    order: MvpOrder;
    piece: ProductLine;
  } | null>(null);
  const [qualityInspectData, setQualityInspectData] = useState<{
    order: MvpOrder;
    piece: ProductLine;
  } | null>(null);

  return (
    <>
      {/* 5. Per-Piece Manufacturing Table */}
      <OrientalTable<PieceTableRow>
        data={rows}
        keyExtractor={(row) => row.id}
        emptyTitle={
          emptyTitle ||
          `لا توجد قطع في تبويب ${activeTab === "ready" ? "جاهزة للعمل" : activeTab === "in_progress" ? "جاري العمل" : activeTab === "completed" ? "المنجز والمحوّل" : "المشكلات"}`
        }
        emptySubtitle={
          emptySubtitle ||
          "تظهر قطع الأحذية المعتمدة والمحولة إلى هذا القسم تلقائياً"
        }
        columns={[
          {
            header: "تحديد",
            render: (row) => (
              <button
                type="button"
                onClick={() => {
                  onToggleSelect(row.id);
                }}
                className="p-1 text-slate-500 hover:text-slate-800"
              >
                {selectedPieceKeys.includes(row.id) ? (
                  <CheckSquare size={16} className="text-teal-700" />
                ) : (
                  <Square size={16} />
                )}
              </button>
            ),
          },
          {
            header: "رقم القطعة والتسلسل",
            render: (row) => (
              <div className="space-y-1">
                <span className="inline-block rounded border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-950">
                  {row.piece.pieceNumber || formatPieceSequence(row.pieceIndex)}
                </span>
                <span className="block text-[10px] text-slate-400">
                  القطعة {row.pieceIndex + 1} من {row.totalPiecesInOrder}
                </span>
              </div>
            ),
          },
          {
            header: "أمر التفصيل والعميل",
            render: (row) => (
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/${deptRole === "special" ? "special-operations" : deptRole}/tasks/${row.order.id}`}
                    className="font-mono font-bold text-teal-800 hover:underline"
                  >
                    {row.order.id}
                  </Link>
                  <span className="py-0.2 rounded bg-slate-100 px-1.5 text-[10px] text-slate-700">
                    {typeLabels[row.order.type]}
                  </span>
                </div>
                <strong className="block text-slate-800">
                  {row.order.customer || row.order.customerName}
                </strong>
                <span className="block text-[10px] text-slate-500">
                  التسليم: {row.order.deliveryDate || row.order.delivery}
                </span>
              </div>
            ),
          },
          {
            header: "الموديل والمواصفات الفنية",
            render: (row) => (
              <div className="max-w-[220px] space-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <strong className="font-mono font-bold text-slate-900">
                    {row.piece.model}
                  </strong>
                  <span className="py-0.2 rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-800">
                    مقاس {row.piece.size}
                  </span>
                </div>
                <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                  {getDeptSpecsSummary(deptRole, row.piece)}
                </p>
              </div>
            ),
          },
          {
            header: "مكان القطعة الآن",
            render: (row) => (
              <div className="space-y-1">
                <PieceLocationBadge location={row.piece.currentLocation} />
              </div>
            ),
          },
          {
            header: "حالة التشغيل بالقسم",
            render: (row) => (
              <div className="space-y-1">
                <OrientalStatusPill
                  tone={statusTone(row.piece.deptStatus || "جاهزة للعمل")}
                >
                  {row.piece.deptStatus || "جاهزة للعمل"}
                </OrientalStatusPill>
                {row.piece.problem && (
                  <span className="block rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                    مشكلة: {row.piece.problem.reason}
                  </span>
                )}
              </div>
            ),
          },
          {
            header: "الموظف المسؤول",
            render: (row) => (
              <div className="text-xs">
                {row.piece.responsibleWorker ? (
                  <span className="font-medium text-indigo-700">
                    {row.piece.responsibleWorker}
                  </span>
                ) : (
                  <span className="text-slate-400">غير معين</span>
                )}
              </div>
            ),
          },
          {
            header: "الإجراءات المتاحة",
            render: (row) => {
              const target = getNextDeptForPiece(deptRole, row.piece);
              return (
                <div className="flex flex-col gap-1.5">
                  {/* Ready Action: Start work */}
                  {activeTab === "ready" &&
                    row.piece.currentLocation === targetLocation && (
                      <button
                        type="button"
                        onClick={() => {
                          store.startPieceWork(
                            row.order.id,
                            [row.piece.id],
                            currentWorker,
                            deptRoleName,
                          );
                          showToast(
                            `تم بدء العمل على ${row.piece.pieceNumber || "القطعة"} بواسطة ${currentWorker}`,
                          );
                        }}
                        className="btn-pill btn-teal justify-center px-2.5 py-1 text-xs whitespace-nowrap"
                      >
                        بدء العمل
                      </button>
                    )}

                  {/* In Progress Action: Complete & Transfer */}
                  {activeTab === "in_progress" &&
                    row.piece.currentLocation === targetLocation && (
                      <button
                        type="button"
                        onClick={() => {
                          store.completeAndTransferPieces(
                            row.order.id,
                            [row.piece.id],
                            target.nextStage,
                            `إنجاز من ${deptRoleName}`,
                          );
                          showToast(
                            `تم إنجاز ${row.piece.pieceNumber || "القطعة"} وتحويلها إلى ${target.label}`,
                          );
                        }}
                        className="btn-pill btn-teal justify-center px-2.5 py-1 text-xs whitespace-nowrap"
                      >
                        إنهاء وتحويل
                      </button>
                    )}

                  {/* Quality Inspection Action */}
                  {deptRole === "quality" &&
                    row.piece.currentLocation === "في الجودة" && (
                      <button
                        type="button"
                        onClick={() => {
                          setQualityInspectData({
                            order: row.order,
                            piece: row.piece,
                          });
                        }}
                        className="btn-pill justify-center bg-teal-800 px-2.5 py-1 text-xs whitespace-nowrap text-white hover:bg-teal-900"
                      >
                        فحص الجودة
                      </button>
                    )}

                  {/* Warehouse Receive Action */}
                  {deptRole === "warehouse" &&
                    row.piece.currentLocation === "في المستودع" &&
                    row.piece.deptStatus !== "مكتملة" && (
                      <button
                        type="button"
                        onClick={() => {
                          store.receiveWarehousePiece(
                            row.order.id,
                            row.piece.id,
                          );
                          showToast(
                            `تم تأكيد استلام ${row.piece.pieceNumber || "القطعة"} بالمستودع`,
                          );
                        }}
                        className="btn-pill justify-center bg-emerald-700 px-2.5 py-1 text-xs whitespace-nowrap text-white hover:bg-emerald-800"
                      >
                        تأكيد الاستلام بالمستودع
                      </button>
                    )}

                  {/* Report Problem button */}
                  {row.piece.currentLocation !== "لدى الاعتماد بسبب مشكلة" &&
                    row.piece.currentLocation !== "في المستودع" &&
                    row.piece.currentLocation !== "تم التسليم" && (
                      <button
                        type="button"
                        onClick={() => {
                          setProblemModalData({
                            order: row.order,
                            piece: row.piece,
                          });
                        }}
                        className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-center text-[11px] whitespace-nowrap text-rose-700 hover:bg-rose-100 hover:text-rose-900"
                      >
                        تسجيل مشكلة
                      </button>
                    )}

                  {/* View All Pieces Modal button */}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectOrder(row.order);
                    }}
                    className="btn-pill btn-secondary inline-flex items-center justify-center gap-1 px-2 py-1 text-xs whitespace-nowrap"
                    title="عرض جميع قطع هذا الأمر ومواقعها الحالية"
                  >
                    <Eye size={12} />
                    <span>عرض جميع قطع الأمر</span>
                  </button>
                </div>
              );
            },
          },
        ]}
      />

      {/* Modals */}
      {allPiecesModalOrder && (
        <OrderAllPiecesModal
          order={allPiecesModalOrder}
          onClose={() => {
            onSelectOrder(null);
          }}
          deptRole={deptRole}
          onReportProblem={(piece) => {
            setProblemModalData({ order: allPiecesModalOrder, piece });
          }}
        />
      )}

      {problemModalData && (
        <PieceReportProblemModal
          order={problemModalData.order}
          piece={problemModalData.piece}
          deptName={deptRoleName}
          workerName={currentWorker}
          onClose={() => {
            setProblemModalData(null);
          }}
        />
      )}

      {qualityInspectData && (
        <QualityInspectPieceModal
          order={qualityInspectData.order}
          piece={qualityInspectData.piece}
          onClose={() => {
            setQualityInspectData(null);
          }}
        />
      )}
    </>
  );
}
