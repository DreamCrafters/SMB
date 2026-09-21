import assert from "node:assert/strict";
import test from "node:test";
import type { BoardAssignmentPrintRecord } from "../domain/boardAssignmentPdf.js";
import { buildBoardAssignmentsPdfDocument, renderBoardAssignmentsPdf } from "./boardAssignmentsPdf.js";

const record: BoardAssignmentPrintRecord = { assignment: {
  id: "assignment", meetingDate: "2026-09-01", protocolNumber: "118", decisionNumber: "1", summary: "Подготовить отчёт", details: "Полное содержание <текст>", coExecutors: ["Экономист"], dueDate: "2026-09-10", recurrence: "once", activeFrom: "2026-09-10", activeTo: "2026-09-10", currentOccurrenceDate: "2026-09-10", status: "in_progress", createdByDisplayName: "Автор", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z", documents: [], comments: [],
} };
test("board register PDF has required columns, full text and repeated headers across pages", async () => {
  const long = { assignment: { ...record.assignment, summary: "Полное длинное поручение ".repeat(700) + "КОНЕЦ" } };
  const definition = buildBoardAssignmentsPdfDocument([long], "register", "2026-09-21");
  assert.equal(definition.pageOrientation, "landscape");
  const serialized = JSON.stringify(definition);
  for (const value of [long.assignment.summary, "Дата", "Суть поручения", "Исполнитель", "Соисполнители", "Срок", "Статус", "Просрочено", "Экономист"]) assert.ok(serialized.includes(value));
  const pdf = await renderBoardAssignmentsPdf([long], "register", "2026-09-21");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.toString("latin1"), /\/FontFile2/u);
  assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b/gu) ?? []).length > 1);
});
test("board single PDF preserves protocol, full details and completion date from the snapshot", async () => {
  const completed = { ...record, assignment: { ...record.assignment, status: "completed" as const }, completedAt: "2026-09-10T21:30:00Z" };
  const definition = buildBoardAssignmentsPdfDocument([completed], "assignment", "2026-09-21");
  assert.equal(definition.pageOrientation, "portrait");
  const serialized = JSON.stringify(definition);
  for (const value of ["Протокол №118", "пункт 1", record.assignment.details, "11.09.2026", "Подпись", "Комментарии по выполнению", "Фактически выполнено"]) assert.ok(serialized.includes(value));
  assert.equal((await renderBoardAssignmentsPdf([completed], "assignment", "2026-09-21")).subarray(0, 5).toString(), "%PDF-");
});
