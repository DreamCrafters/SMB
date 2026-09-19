import type { DirectorAssignment, DirectorAssignmentPdfRequest } from "../contracts/directorAssignments.js";
import { renderPdfDocument } from "./pdfRenderer.js";

const statuses: Record<DirectorAssignment["status"], string> = {
  in_progress: "В работе", under_review: "На проверке", revision_requested: "На доработке", completed: "Завершено",
};
function date(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value.split("-").reverse().join(".") : value;
}
function responsible(row: DirectorAssignment) {
  return row.responsible?.fullName || row.source?.values[5] || "";
}
function coExecutors(row: DirectorAssignment) {
  return row.source && row.revision === 1 ? row.source.values[6] ?? "" : row.coExecutors.map(employee => employee.fullName).join(", ");
}

export function buildDirectorAssignmentsPdfDocument(assignments: DirectorAssignment[], mode: DirectorAssignmentPdfRequest["mode"]) {
  const base = {
    pageSize: "A4",
    defaultStyle: { font: "Roboto", fontSize: mode === "register" ? 9 : 11, lineHeight: 1.2 },
    footer: (page: number, count: number) => ({ text: `${page} / ${count}`, alignment: "center", fontSize: 8, margin: [0, 12, 0, 0] }),
  };
  if (mode === "register") return {
    ...base, pageOrientation: "landscape", pageMargins: [30, 30, 30, 40],
    info: { title: "Журнал поручений генерального директора" },
    content: [
      { text: "Поручения генерального директора", bold: true, fontSize: 15, margin: [0, 0, 0, 12] },
      { table: { headerRows: 1, widths: [60, "*", 110, 110, 60, 85], body: [
        ["Дата", "Суть поручения", "Исполнитель", "Соисполнители", "Срок", "Статус"].map(text => ({ text, bold: true, fillColor: "#eeeeee" })),
        ...assignments.map(row => [date(row.assignedOn) || "—", row.summary || "—", responsible(row) || "—", coExecutors(row) || "—", date(row.currentOccurrenceDate) || "—", `${statuses[row.status]}${row.needsClarification ? " · Требует уточнения" : ""}`]),
      ] }, layout: { paddingTop: () => 6, paddingBottom: () => 6 } },
    ],
  };
  const row = assignments[0];
  const field = (label: string, value: string, bottom = 12) => ({ text: [{ text: `${label} ` }, { text: value || "________________________________", bold: Boolean(value) }], margin: [0, 0, 0, bottom] });
  const blankLine = { canvas: [{ type: "line", x1: 0, y1: 16, x2: 465, y2: 16, lineWidth: 0.5 }], margin: [0, 0, 0, 8] };
  return {
    ...base, pageOrientation: "portrait", pageMargins: [85, 57, 43, 57],
    info: { title: `${row.kind} №${row.number}` },
    content: [
      { text: `${row.kind} №${row.number}`, alignment: "center", bold: true, fontSize: 14, margin: [0, 0, 0, 12] },
      { text: `От ${date(row.assignedOn) || "________________"}`, alignment: "center", margin: [0, 0, 0, 12] },
      { text: row.project || "Проект ________________________________", alignment: "center", margin: [0, 0, 0, 36] },
      field("Исполнитель", responsible(row)),
      field("Соисполнители", coExecutors(row)),
      field("Содержание (суть поручения)", row.summary, 20),
      field("Срок выполнения (дата)", date(row.currentOccurrenceDate), 32),
      { text: "Генеральный директор ____________________ место для подписи", margin: [0, 0, 0, 44] },
      field("Комментарии по выполнению", row.progress),
      blankLine,
      field("Фактически выполнено (дата)", date(row.completedOn)),
    ],
  };
}

export async function renderDirectorAssignmentsPdf(assignments: DirectorAssignment[], mode: DirectorAssignmentPdfRequest["mode"]) {
  return renderPdfDocument(buildDirectorAssignmentsPdfDocument(assignments, mode));
}
