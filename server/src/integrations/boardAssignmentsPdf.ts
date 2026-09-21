import type { BoardAssignmentPdfRequest } from "../contracts/boardAssignmentPdf.js";
import type { BoardAssignmentPrintRecord } from "../domain/boardAssignmentPdf.js";
import { isBoardAssignmentOverdueOn } from "../domain/boardAssignment.js";
import { renderPdfDocument } from "./pdfRenderer.js";

const statuses = { in_progress: "В работе", under_review: "На проверке", revision_requested: "На доработке", completed: "Завершено" };
const date = (value: string) => value.slice(0, 10).split("-").reverse().join(".");
export function buildBoardAssignmentsPdfDocument(records: BoardAssignmentPrintRecord[], mode: BoardAssignmentPdfRequest["mode"], today: string) {
  const base = {
    pageSize: "A4", pageMargins: [40, 40, 40, 45],
    defaultStyle: { font: "Roboto", fontSize: mode === "register" ? 9 : 11, lineHeight: 1.2 },
    footer: (page: number, count: number) => ({ text: `${page} / ${count}`, alignment: "center", fontSize: 8, margin: [0, 12, 0, 0] }),
  };
  if (mode === "register") return {
    ...base, pageOrientation: "landscape", info: { title: "Журнал поручений Совета директоров" },
    content: [
      { text: "Поручения Совета директоров", bold: true, fontSize: 15, margin: [0, 0, 0, 12] },
      { table: { headerRows: 1, widths: [60, "*", 75, 110, 60, 85], body: [
        ["Дата", "Суть поручения", "Исполнитель", "Соисполнители", "Срок", "Статус"].map(text => ({ text, bold: true, fillColor: "#eeeeee" })),
        ...records.map(({ assignment: row, completedAt }) => [date(row.meetingDate), `${row.summary}\nПротокол №${row.protocolNumber}, пункт ${row.decisionNumber}`, "—", row.coExecutors.join(", ") || "—", date(row.currentOccurrenceDate), !completedAt && isBoardAssignmentOverdueOn(row, today) ? "Просрочено" : statuses[row.status]]),
      ] }, layout: { paddingTop: () => 6, paddingBottom: () => 6 } },
    ],
  };
  const { assignment: row, completedAt } = records[0];
  const field = (label: string, text: string) => ({ text: `${label}: ${text || "________________________________"}`, margin: [0, 0, 0, 14] });
  return {
    ...base, pageOrientation: "portrait", info: { title: `Поручение СД: протокол ${row.protocolNumber}, пункт ${row.decisionNumber}` },
    content: [
      { text: "Поручение Совета директоров", bold: true, alignment: "center", fontSize: 14, margin: [0, 0, 0, 14] },
      { text: `От ${date(row.meetingDate)}\nПротокол №${row.protocolNumber}, пункт ${row.decisionNumber}`, alignment: "center", margin: [0, 0, 0, 30] },
      field("Исполнитель", ""), field("Соисполнители", row.coExecutors.join(", ")),
      field("Содержание (суть поручения)", row.summary), ...(row.details ? [field("Полное содержание", row.details)] : []),
      field("Срок выполнения (дата)", date(row.currentOccurrenceDate)),
      { text: "Подпись ________________________________", margin: [0, 20, 0, 35] },
      field("Комментарии по выполнению", ""),
      { canvas: [{ type: "line", x1: 0, y1: 16, x2: 510, y2: 16, lineWidth: 0.5 }], margin: [0, 0, 0, 14] },
      field("Фактически выполнено (дата)", completedAt ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow" }).format(new Date(completedAt)) : ""),
    ],
  };
}
export function renderBoardAssignmentsPdf(records: BoardAssignmentPrintRecord[], mode: BoardAssignmentPdfRequest["mode"], today: string) {
  return renderPdfDocument(buildBoardAssignmentsPdfDocument(records, mode, today));
}
