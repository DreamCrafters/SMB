import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

/** Preview stays in the DOM; the owner receives one completed move, never pointer moves. */
export function RowDragHandle({ label, disabled, onMove }: {
  label: string;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const cancelRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => cancelRef.current?.(), []);
  useEffect(() => { if (disabled) cancelRef.current?.(); }, [disabled]);

  function start(event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled || event.button !== 0 || cancelRef.current) return;
    const handle = event.currentTarget;
    const row = handle.closest<HTMLElement>("[data-reorder-row]");
    const list = row?.parentElement;
    if (!row || !list) return;
    event.preventDefault(); // Do not blur an edited name and save it midway through a drag.
    const rows = Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-reorder-row]"));
    const from = rows.indexOf(row);
    const bounds = rows.map((item) => item.getBoundingClientRect());
    let min = from;
    let max = from;
    while (min > 0 && rows[min - 1].dataset.reorderLocked !== "true") min--;
    while (max < rows.length - 1 && rows[max + 1].dataset.reorderLocked !== "true") max++;
    const scrollParents: HTMLElement[] = [];
    for (let parent = list.parentElement; parent; parent = parent.parentElement) {
      if (/(auto|scroll)/.test(window.getComputedStyle(parent).overflowY)) scrollParents.push(parent);
    }
    if (document.scrollingElement instanceof HTMLElement && !scrollParents.includes(document.scrollingElement)) {
      scrollParents.push(document.scrollingElement);
    }
    const scrollTops = scrollParents.map((parent) => parent.scrollTop);
    const startY = event.clientY;
    let y = startY;
    let target = from;
    let active = false;
    let frame = 0;
    let previousTime = 0;
    const pointerId = event.pointerId;
    const previousSelection = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const shift = () => scrollParents.reduce((total, parent, i) => total + parent.scrollTop - scrollTops[i], 0);
    function preview() {
      const scroll = shift();
      target = from;
      for (let i = min; i <= max; i++) {
        if (i < from && y < (bounds[i].top + bounds[i].bottom) / 2 - scroll) { target = i; break; }
        if (i > from && y > (bounds[i].top + bounds[i].bottom) / 2 - scroll) target = i;
      }
      // Keep the preview within the list, so transformed overflow cannot grow
      // scrollHeight and perpetuate edge scrolling beyond the final row.
      const draggedOffset = Math.max(bounds[min].top - bounds[from].top,
        Math.min(bounds[max].bottom - bounds[from].bottom, y - startY + scroll));
      rows.forEach((item, i) => {
        const delta = i === from ? draggedOffset
          : i >= target && i < from ? bounds[from].height
          : i > from && i <= target ? -bounds[from].height : 0;
        item.style.transform = `translateY(${delta}px)`;
      });
    }
    function tick(time: number) {
      if (active) {
        const step = Math.min(32, previousTime ? time - previousTime : 16) * 0.65;
        for (const parent of scrollParents) {
          const rect = parent === document.scrollingElement
            ? { top: 0, bottom: window.innerHeight } : parent.getBoundingClientRect();
          const top = Math.max(0, rect.top);
          const bottom = Math.min(window.innerHeight, rect.bottom);
          const direction = y < top + 40 ? -1 : y > bottom - 40 ? 1 : 0;
          const before = parent.scrollTop;
          if (direction) parent.scrollTop += direction * step;
          if (before !== parent.scrollTop) break;
        }
        preview();
      }
      previousTime = time;
      frame = window.requestAnimationFrame(tick);
    }
    function move(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      y = e.clientY;
      if (!active && Math.abs(y - startY) >= 5) {
        active = true;
        row!.classList.add("is-row-dragging");
        list!.classList.add("is-row-reordering");
      }
    }
    function finish(commit: boolean, e?: PointerEvent) {
      if (e && e.pointerId !== pointerId) return;
      if (commit && active) { if (e) y = e.clientY; preview(); }
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      cancelRef.current = undefined;
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
      rows.forEach((item) => { item.style.removeProperty("transform"); });
      row!.classList.remove("is-row-dragging");
      list!.classList.remove("is-row-reordering");
      document.body.style.userSelect = previousSelection;
      if (commit && active && target !== from && rows.every((item, index) => list!.children[index] === item)) onMove(from, target);
    }
    function up(e: PointerEvent) { finish(true, e); }
    function cancel() { finish(false); }
    function key(e: KeyboardEvent) { if (e.key === "Escape") { e.preventDefault(); cancel(); } }
    cancelRef.current = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    handle.addEventListener("lostpointercapture", cancel);
    handle.setPointerCapture?.(pointerId);
    frame = window.requestAnimationFrame(tick);
  }

  return <button type="button" className="row-drag-handle" disabled={disabled}
    aria-label={`Переместить ${label}`} title="Перетащите; Escape — отменить. Стрелки вверх/вниз — переместить с клавиатуры."
    onPointerDown={start}
    onKeyDown={(event) => {
      if (cancelRef.current || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const row = event.currentTarget.closest<HTMLElement>("[data-reorder-row]");
      const rows = Array.from(row?.parentElement?.querySelectorAll<HTMLElement>(":scope > [data-reorder-row]") ?? []);
      const from = row ? rows.indexOf(row) : -1;
      const to = from + (event.key === "ArrowUp" ? -1 : 1);
      if (from >= 0 && rows[to] && rows[to].dataset.reorderLocked !== "true") onMove(from, to);
    }}><span aria-hidden="true" className="row-drag-dots">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</span></button>;
}
