import assert from "node:assert/strict";
import test from "node:test";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import { buildDirectorAssignmentsPdfDocument, renderDirectorAssignmentsPdf } from "./directorAssignmentsPdf.js";

const assignment: DirectorAssignment = {
  id: "assignment-116", department: "", responsibleId: "", coExecutorIds: [], recurrence: "once", activeFrom: "2026-09-30", activeTo: "2026-09-30", urgency: "", importance: "", note: "", incomingNumber: "", sourceBoardAssignmentId: null, comments: [], documents: [], createdAt: "2026-09-19T00:00:00Z", updatedAt: "2026-09-19T00:00:00Z", postponedUntil: "",
  kind: "Поручение", number: "ГД-116", assignedOn: "2026-09-19", summary: "Подготовить отчёт <script> текст </script>",
  project: "Производство", responsible: null, coExecutors: [], revision: 1,
  source: { key: "old", originalStatus: "", originalDueDate: "", postponedUntil: "", values: ["", "", "", "", "", "Иванов И.И.", "Петров П.П."] },
  currentOccurrenceDate: "2026-09-30", status: "in_progress", progress: "", completedOn: "", needsClarification: true,
};

test("register PDF includes six required columns, historical names and complete long content", async () => {
  const row = { ...assignment, summary: "Длинное поручение ".repeat(700) + "КОНЕЦ" };
  const definition = buildDirectorAssignmentsPdfDocument([row], "register");
  assert.equal(definition.pageOrientation, "landscape");
  const text = JSON.stringify(definition);
  for (const expected of [row.summary, "Дата", "Суть поручения", "Исполнитель", "Соисполнители", "Срок", "Статус", "Иванов И.И.", "Петров П.П.", "30.09.2026", "Требует уточнения"]) assert.ok(text.includes(expected));
  const pdf = await renderDirectorAssignmentsPdf([row], "register");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.toString("latin1"), /\/FontFile2/u);
  assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b/gu) ?? []).length > 1);
});

test("individual PDF follows the reference form with signature and completion spaces", async () => {
  const definition = buildDirectorAssignmentsPdfDocument([assignment], "assignment");
  assert.equal(definition.pageOrientation, "portrait");
  const text = JSON.stringify(definition);
  for (const expected of ["Поручение №ГД-116", "19.09.2026", "Производство", assignment.summary, "Генеральный директор", "место для подписи", "Комментарии по выполнению", "Фактически выполнено (дата)"]) assert.ok(text.includes(expected));
  const pdf = await renderDirectorAssignmentsPdf([assignment], "assignment");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});
