import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { TableId, TableLayout } from "../server/src/contracts/tableLayouts";
import { requestTableLayouts, saveTableLayout } from "./services/tableLayouts";

type LayoutContext = {
  layouts: Partial<Record<TableId, TableLayout>>;
  canManage: boolean;
  ready: boolean;
  controlsFormId: string;
  reload: () => Promise<void>;
  save: (layout: TableLayout) => Promise<TableLayout>;
};
const Context = createContext<LayoutContext | undefined>(undefined);
export const useTableLayouts = () => useContext(Context);

export function TableLayoutProvider({ children, canConfigure = false }: { children: ReactNode; canConfigure?: boolean }) {
  const controlsFormId = useId();
  const [layouts, setLayouts] = useState<LayoutContext["layouts"]>({});
  const [canManage, setCanManage] = useState(canConfigure);
  const [ready, setReady] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    const response = await requestTableLayouts();
    if (current !== generation.current) return;
    setLayouts(Object.fromEntries(response.layouts.map((layout) => [layout.tableId, layout])));
    setCanManage(response.canManage);
    setReady(true);
  }, []);
  useEffect(() => {
    void reload().catch(() => { /* Tables retain their defined widths when settings are unavailable. */ });
    return () => { generation.current++; };
  }, [reload]);
  const save = useCallback(async (layout: TableLayout) => {
    const updated = await saveTableLayout(layout);
    generation.current++;
    setLayouts((current) => ({ ...current, [updated.tableId]: updated }));
    return updated;
  }, []);
  const value = useMemo(() => ({ layouts, canManage, ready, controlsFormId, reload, save }), [layouts, canManage, ready, controlsFormId, reload, save]);
  return <Context.Provider value={value}>{children}<form id={controlsFormId} hidden onSubmit={(event) => event.preventDefault()} /><TableTextTooltip /></Context.Provider>;
}

/** One delegated tooltip for the page; no observers or state per cell. */
function TableTextTooltip() {
  const [tip, setTip] = useState<{ text: string; left: number; top: number; maxHeight: number }>();
  const active = useRef<HTMLElement | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hide = useCallback(() => {
    active.current?.removeAttribute("aria-describedby");
    active.current = null;
    setTip(undefined);
  }, []);
  useEffect(() => {
    function show(event: Event) {
      if (!(event.target instanceof Element)) return;
      const cell = event.target.closest("td, th, [role='cell'], [role='columnheader']");
      const target = event.target.closest<HTMLElement>(".table-cell-text")
        ?? cell?.querySelector<HTMLElement>(".table-cell-text") ?? null;
      if (target === null || target.closest(".table-text-tooltip") !== null) return;
      clearTimeout(timeout.current);
      if (target.scrollHeight <= target.clientHeight + 1 && target.scrollWidth <= target.clientWidth + 1) {
        hide(); return;
      }
      if (active.current === target) return;
      const rect = target.getBoundingClientRect();
      hide();
      active.current = target;
      target.setAttribute("aria-describedby", "table-full-text");
      const width = Math.min(480, window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 16;
      const top = below >= 160 ? rect.bottom + 6 : 12;
      setTip({ text: target.innerText || target.textContent || "", left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top, maxHeight: Math.max(80, Math.min(360, window.innerHeight - top - 12)) });
    }
    function leave(event: Event) {
      if (active.current === null) return;
      const next = (event as MouseEvent).relatedTarget;
      if (next instanceof Element && (next.closest(".table-text-tooltip") || next.closest(".table-cell-text") === active.current
        || (active.current !== null && next.closest("td, th, [role='cell'], [role='columnheader']") === active.current.closest("td, th, [role='cell'], [role='columnheader']")))) return;
      clearTimeout(timeout.current);
      timeout.current = setTimeout(hide, 180);
    }
    function key(event: KeyboardEvent) { if (event.key === "Escape") hide(); }
    function scroll(event: Event) {
      if (event.target instanceof Element && event.target.closest(".table-text-tooltip")) return;
      hide();
    }
    document.addEventListener("mouseover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("click", show);
    document.addEventListener("mouseout", leave);
    document.addEventListener("focusout", leave);
    document.addEventListener("keydown", key);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", hide);
    return () => {
      clearTimeout(timeout.current);
      active.current?.removeAttribute("aria-describedby");
      document.removeEventListener("mouseover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("click", show);
      document.removeEventListener("mouseout", leave);
      document.removeEventListener("focusout", leave);
      document.removeEventListener("keydown", key);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", hide);
    };
  }, [hide]);
  return tip === undefined ? null : createPortal(
    <div id="table-full-text" role="tooltip" className="table-text-tooltip" style={{ left: tip.left, top: tip.top, maxHeight: tip.maxHeight }}
      onMouseEnter={() => clearTimeout(timeout.current)} onMouseLeave={hide}>
      {tip.text}
    </div>, document.body);
}
