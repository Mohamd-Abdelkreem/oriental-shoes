import type { ProductLine } from "@/features/prototype/state/mvp-types";
import { BOTTOM_12_BOX_PAIRS, TOP_5_BOXES } from "../paper/paper-options";

export function PaperCodeChoices({
  selected,
  target,
  onToggle,
}: {
  selected: readonly string[];
  target?: ProductLine | undefined;
  onToggle?: ((code: string) => void) | undefined;
}) {
  const choice = (box: { code: string; label: string }, top: boolean) => {
    const pressed = selected.includes(box.code);
    const className = pressed ? "selected" : "";
    const contents = top ? (
      <>
        <small>{box.label}</small>
        <b>{box.code}</b>
      </>
    ) : (
      box.code
    );
    if (!onToggle) {
      return top ? (
        <span className={className} title={box.label} key={box.code}>
          {contents}
        </span>
      ) : (
        <b className={className} title={box.label} key={box.code}>
          {contents}
        </b>
      );
    }
    return (
      <button
        key={box.code}
        type="button"
        className={`paper-code-choice selectable ${className}`}
        title={box.label}
        aria-label={`${box.label} (${box.code})`}
        aria-pressed={pressed}
        onClick={() => {
          onToggle(box.code);
        }}
      >
        {contents}
      </button>
    );
  };
  return (
    <>
      {target && (
        <p className="col-span-full text-xs font-semibold">
          أكواد {target.pieceNumber}
        </p>
      )}
      <div className="paper-code-strip">
        {TOP_5_BOXES.map((box) => choice(box, true))}
      </div>
      <div className="paper-code-groups">
        {BOTTOM_12_BOX_PAIRS.map(([first, second]) => (
          <span key={first.code}>
            {choice(first, false)}
            {choice(second, false)}
          </span>
        ))}
      </div>
    </>
  );
}
