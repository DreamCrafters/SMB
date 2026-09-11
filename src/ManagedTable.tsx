import { Children, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type TableHTMLAttributes, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { clampTableColumnWidth, getTableColumnWidth, isTableColumnId, tableDefinitions, tableLayoutLimits,
  type TableColumnId, type TableId, type TableLayout, type TableWidths } from "../server/src/contracts/tableLayouts";
import { useTableLayouts } from "./TableLayoutProvider";
import { TableLayoutRequestError } from "./services/tableLayouts";

type Props<T extends TableId> = TableHTMLAttributes<HTMLTableElement> & {
  tableId: T;
  columns?: readonly TableColumnId<T>[];
  captionPlacement?: "inside-scroll" | "outside-scroll";
  variant?: "html" | "grid";
};
type Header = { element: HTMLElement; index: number; label: string };
type Drag = { pointerId: number; startX: number; startWidth: number; index: number; width: number; button: HTMLButtonElement };

export function ManagedTable<T extends TableId>({ tableId, columns: selectedColumns, captionPlacement = "inside-scroll", variant = "html", children, className = "", style, ...props }: Props<T>) {
  const settings = useTableLayouts();
  const columns: readonly string[] = selectedColumns ?? tableDefinitions[tableId].columns;
  const columnsKey = columns.join("|");
  const root = useRef<HTMLTableElement & HTMLDivElement>(null);
  const [headers, setHeaders] = useState<Header[]>([]);
  const [draft, setDraft] = useState<TableLayout>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const drag = useRef<Drag | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const stored = settings?.layouts[tableId];
  const widths = columns.map((id) => (draft?.widths ?? stored?.widths)?.[id] ?? getTableColumnWidth(tableId, id));
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const validColumns = columns.length > 0 && columns.length <= tableLayoutLimits.maxColumns
    && new Set(columns).size === columns.length && columns.every((id) => isTableColumnId(tableId, id));

  useLayoutEffect(() => {
    const table = root.current;
    if (table === null) return;
    const next = readLeafHeaders(table, variant);
    setHeaders((current) => current.length === next.length && current.every((header, i) =>
      header.element === next[i].element && header.index === next[i].index && header.label === next[i].label) ? current : next);
  }, [children, columnsKey, variant]);
  useEffect(() => {
    setDraft(undefined); setMessage(""); setConflict(false);
  }, [tableId]);
  useEffect(() => () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    drag.current = undefined;
  }, []);

  const css = useMemo(() => ({
    ...style,
    ...Object.fromEntries(widths.map((width, index) => [`--table-column-${index}`, `${width}px`])),
    "--table-width": `${widths.reduce((total, width) => total + width, 0)}px`,
    "--table-grid-columns": columns.map((_, index) => `var(--table-column-${index})`).join(" "),
  }) as CSSProperties, [style, widths.join("|"), columnsKey]);

  function setWidth(index: number, width: number) {
    const id = columns[index];
    if (id === undefined || !Number.isFinite(width)) return;
    setDraft((current) => current === undefined ? current : { ...current, widths: { ...current.widths, [id]: clampTableColumnWidth(width) } });
  }
  function paintDrag() {
    frame.current = undefined;
    const current = drag.current;
    const element = root.current;
    if (current === undefined || element === null) return;
    element.style.setProperty(`--table-column-${current.index}`, `${current.width}px`);
    element.style.setProperty("--table-width", `${widthsRef.current.reduce((sum, width, index) => sum + (index === current.index ? current.width : width), 0)}px`);
    current.button.setAttribute("aria-valuenow", String(current.width));
    current.button.setAttribute("title", `${current.width} px`);
  }
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (saving || draft === undefined || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: widths[index], width: widths[index], index, button: event.currentTarget };
  }
  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (current === undefined || event.pointerId !== current.pointerId) return;
    current.width = clampTableColumnWidth(current.startWidth + event.clientX - current.startX);
    if (frame.current === undefined) frame.current = requestAnimationFrame(paintDrag);
  }
  function endDrag(cancel = false) {
    const current = drag.current;
    if (current === undefined) return;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    current.width = cancel ? current.startWidth : current.width;
    paintDrag();
    drag.current = undefined;
    if (current.button.hasPointerCapture(current.pointerId)) current.button.releasePointerCapture(current.pointerId);
    setWidth(current.index, current.width);
  }
  function begin() {
    setDraft({ tableId, revision: stored?.revision ?? 0, widths: { ...stored?.widths } });
    setMessage(""); setConflict(false);
  }
  async function save() {
    if (draft === undefined || settings === undefined || saving) return;
    setSaving(true); setMessage("");
    const overrides: TableWidths = Object.fromEntries(Object.entries(draft.widths).filter(([id, width]) => width !== getTableColumnWidth(tableId, id)));
    try {
      await settings.save({ ...draft, widths: overrides });
      setDraft(undefined); setMessage("Ширины сохранены для всех пользователей.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить ширины. Повторите попытку.");
      setConflict(error instanceof TableLayoutRequestError && error.status === 409);
    } finally { setSaving(false); }
  }
  const toolbar = settings?.canManage ? (
    <div className="table-layout-toolbar">
      {draft === undefined ? <button type="button" className="secondary-button" disabled={!validColumns || !settings.ready} onClick={begin}>Настроить колонки</button> : <>
        <span>Ширины для всех пользователей</span>
        <button type="button" className="primary-button" disabled={saving || conflict} onClick={() => void save()}>{saving ? "Сохраняем…" : "Сохранить"}</button>
        <button type="button" className="secondary-button" disabled={saving} onClick={() => { endDrag(true); setDraft(undefined); setMessage(""); }}>Отмена</button>
        <button type="button" className="secondary-button" disabled={saving} onClick={() => setDraft((current) => current && {
          ...current, widths: Object.fromEntries(Object.entries(current.widths).filter(([id]) => !columns.includes(id))),
        })}>Сбросить ширины</button>
      </>}
      {!settings.ready && <button type="button" className="secondary-button" disabled={saving} onClick={async () => {
        setSaving(true);
        try { await settings.reload(); setMessage(""); }
        catch { setMessage("Не удалось загрузить настройки таблиц. Повторите попытку."); }
        finally { setSaving(false); }
      }}>Загрузить настройки</button>}
      {message && <span role="status">{message}</span>}
      {conflict && <button type="button" className="secondary-button" disabled={saving} onClick={async () => {
        setSaving(true);
        try { await settings.reload(); setDraft(undefined); setConflict(false); setMessage("Актуальные настройки загружены. Можно настроить заново."); }
        catch { setMessage("Не удалось загрузить настройки. Повторите попытку."); }
        finally { setSaving(false); }
      }}>Загрузить актуальные</button>}
      {draft !== undefined && <details className="table-layout-numeric"><summary>Точная ширина</summary>
        <div className="table-layout-fields">{columns.map((id, index) => <label key={id}>
          <span>{headers.find((header) => header.index === index)?.label || `Колонка ${index + 1}`}</span>
          <ColumnWidthInput formId={settings.controlsFormId} aria-label={`Ширина: ${headers.find((header) => header.index === index)?.label || `Колонка ${index + 1}`}`} value={widths[index]} disabled={saving}
            onCommit={(value) => setWidth(index, value)} />
          <span>px</span>
        </label>)}</div>
      </details>}
    </div>
  ) : null;
  const caption = Children.toArray(children).filter((child) => isValidElement(child) && child.type === "caption");
  const content = Children.toArray(children).filter((child) => !isValidElement(child) || child.type !== "caption");
  const outsideCaption = variant === "html" && captionPlacement === "outside-scroll"
    ? caption.map((child, index) => (
        <div className="managed-table-caption" key={isValidElement(child) ? child.key ?? index : index}>
          {isValidElement<{ children?: ReactNode }>(child) ? child.props.children : child}
        </div>
      ))
    : null;
  const common = { ...props, ref: root, style: css, "data-table-id": tableId,
    className: `managed-table ${variant === "grid" ? "managed-table-grid" : ""} ${className}` };
  return <div className="managed-table-shell">
    {toolbar}
    {outsideCaption}
    <div className={`managed-table-scroll ${className.includes("history-table-scroll") ? "managed-table-history" : ""}`}>
      {variant === "grid" ? <div {...common} role="table">{children}</div> : <table {...common}>
        {captionPlacement === "inside-scroll" ? caption : null}
        <colgroup>{columns.map((id, index) => <col key={id} style={{ width: `var(--table-column-${index})` }} />)}</colgroup>
        {content}
      </table>}
    </div>
    {draft !== undefined && headers.map(({ element, index, label }) => columns[index] === undefined ? null : createPortal(
      <button type="button" className="table-column-resize" role="separator" aria-orientation="vertical" aria-label={`Ширина: ${label}`}
        aria-valuemin={tableLayoutLimits.minWidth} aria-valuemax={tableLayoutLimits.maxWidth} aria-valuenow={widths[index]} disabled={saving} title={`${widths[index]} px`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => startDrag(event, index)} onPointerMove={moveDrag} onPointerUp={() => endDrag()} onPointerCancel={() => endDrag(true)} onLostPointerCapture={() => endDrag(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { endDrag(true); return; }
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          setWidth(index, event.key === "Home" ? tableLayoutLimits.minWidth : event.key === "End" ? tableLayoutLimits.maxWidth
            : widths[index] + (event.key === "ArrowLeft" ? -1 : 1) * tableLayoutLimits.keyboardStep);
        }}
      />, element, columns[index]))}
  </div>;
}

/** Resolve physical leaf columns across rowSpan/colSpan, ignoring summary and nested table rows. */
function readLeafHeaders(table: HTMLElement, variant: "html" | "grid"): Header[] {
  if (variant === "grid") return Array.from(table.querySelectorAll<HTMLElement>(":scope > [role='row'] > [role='columnheader']"))
    .map((element, index) => ({ element, index, label: element.textContent?.trim() || `Колонка ${index + 1}` }));
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>(":scope > thead > tr"));
  const occupied: number[] = [];
  const result: Header[] = [];
  rows.forEach((row, rowIndex) => {
    let column = 0;
    for (const cell of Array.from(row.cells)) {
      while ((occupied[column] ?? 0) > rowIndex) column++;
      const span = cell.colSpan;
      if (cell.tagName === "TH" && cell.scope !== "row" && span === 1) {
        result.push({ element: cell, index: column, label: cell.dataset.tableColumnLabel || cell.getAttribute("aria-label") || cell.textContent?.trim() || `Колонка ${column + 1}` });
      }
      for (let i = 0; i < span; i++) occupied[column + i] = rowIndex + (cell.rowSpan || rows.length);
      column += span;
    }
  });
  return result;
}


function ColumnWidthInput({ value, onCommit, disabled, formId, "aria-label": label }: {
  value: number; onCommit: (value: number) => void; disabled: boolean; formId: string; "aria-label": string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  function commit() {
    const parsed = Number(text);
    if (text.trim() === "" || !Number.isFinite(parsed)) { setText(String(value)); return; }
    const width = clampTableColumnWidth(parsed);
    setText(String(width)); onCommit(width);
  }
  return <input form={formId} aria-label={label} type="number" min={tableLayoutLimits.minWidth} max={tableLayoutLimits.maxWidth}
    step={1} value={text} disabled={disabled} onChange={(event) => setText(event.currentTarget.value)}
    onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} />;
}
