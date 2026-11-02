export function PaperCellValue({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  return (
    <div className="paper-cell-box paper-cell-box-readonly">
      <span className={`paper-cell-value ${className}`}>{value || "—"}</span>
    </div>
  );
}
