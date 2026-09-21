import assert from "node:assert/strict";
import test from "node:test";
import type { BoardAssignment, BoardAssignmentsRepository } from "../repositories/boardAssignmentsRepository.js";
import { selectBoardAssignmentsForPdf } from "./boardAssignmentPdf.js";

const assignment: BoardAssignment = { id: "board-1", meetingDate: "2026-09-01", protocolNumber: "117", decisionNumber: "3", summary: "Подготовить отчёт", details: "Полное содержание", coExecutors: ["Соисполнитель"], dueDate: "2026-09-10", recurrence: "once", activeFrom: "2026-09-10", activeTo: "2026-09-10", currentOccurrenceDate: "2026-09-10", status: "in_progress", createdByDisplayName: "Автор", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z", documents: [], comments: [] };
const repository = {
  async readById(id: string) { return id === assignment.id ? assignment : undefined; },
  async readCompletionById(id: string) { return id === "snapshot" ? { id, assignmentId: assignment.id, occurrenceDate: "2026-08-10", completedAt: "2026-08-11T00:00:00Z", completedByDisplayName: "Принял", assignment: { ...assignment, summary: "Историческое содержание", status: "completed" as const } } : undefined; },
} as BoardAssignmentsRepository;
const request = { mode: "register", source: "current", entries: [{ id: assignment.id, expectedUpdatedAt: assignment.updatedAt }] };
test("board PDF selection checks executor visibility, stale records and input", async () => {
  assert.equal((await selectBoardAssignmentsForPdf(repository, request, false, "2026-09-01")).records[0].assignment.summary, assignment.summary);
  await assert.rejects(selectBoardAssignmentsForPdf(repository, request, true, "2026-09-01"), /недоступно/u);
  assert.equal((await selectBoardAssignmentsForPdf(repository, request, true, "2026-09-11")).records.length, 1);
  await assert.rejects(selectBoardAssignmentsForPdf(repository, { ...request, entries: [{ id: assignment.id, expectedUpdatedAt: "stale" }] }, false, "2026-09-11"), /Обновите/u);
  await assert.rejects(selectBoardAssignmentsForPdf(repository, { ...request, entries: [] }, false, "2026-09-11"), /выбор/u);
});
test("board PDF history reads the requested immutable completion", async () => {
  const result = await selectBoardAssignmentsForPdf(repository, { ...request, source: "history", entries: [{ id: "snapshot", expectedUpdatedAt: assignment.updatedAt }] }, true, "2026-09-11");
  assert.equal(result.records[0].assignment.summary, "Историческое содержание");
  assert.equal(result.records[0].completedAt, "2026-08-11T00:00:00Z");
});

test("malformed source and mode cannot bypass executor visibility", async () => {
  for (const source of [["current"], ["history"], {}, null, 1]) {
    await assert.rejects(selectBoardAssignmentsForPdf(repository, { ...request, source }, true, "2026-09-01"), /выбор/u);
  }
  for (const mode of [["register"], ["assignment"], {}, null, 1]) {
    await assert.rejects(selectBoardAssignmentsForPdf(repository, { ...request, mode }, true, "2026-09-01"), /выбор/u);
  }
});
