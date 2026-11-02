import { useCallback, useEffect, useState, type RefObject } from "react";

export type PaperCellMenuPosition = {
  top: number;
  left: number;
  width: number;
};

export function usePaperCellMenuPosition({
  isOpen,
  triggerRef,
  menuRef,
  closeMenu,
}: {
  isOpen: boolean;
  triggerRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  closeMenu: () => void;
}) {
  const [position, setPosition] = useState<PaperCellMenuPosition | null>(null);
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const bounds = triggerRef.current.getBoundingClientRect();
    const estimatedHeight = 310;
    const opensUpward =
      window.innerHeight - bounds.bottom < estimatedHeight &&
      bounds.top > estimatedHeight;
    const width = Math.max(bounds.width, 240);
    const left = Math.max(
      8,
      Math.min(bounds.left, window.innerWidth - width - 8),
    );
    setPosition({
      top: opensUpward
        ? Math.max(8, bounds.top - estimatedHeight - 4)
        : bounds.bottom + 4,
      left,
      width,
    });
  }, [triggerRef]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return;
      closeMenu();
    };
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [isOpen, updatePosition, triggerRef, menuRef, closeMenu]);

  return { position, updatePosition };
}
