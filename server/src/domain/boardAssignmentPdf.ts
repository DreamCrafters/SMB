import type { BoardAssignmentPdfRequest } from "../contracts/boardAssignmentPdf.js";
import type { BoardAssignment, BoardAssignmentsRepository } from "../repositories/boardAssignmentsRepository.js";
import { isBoardAssignmentActiveOn } from "./boardAssignment.js";

export class BoardAssignmentPdfError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export type BoardAssignmentPrintRecord = { assignment: BoardAssignment; completedAt?: string };

export async function selectBoardAssignmentsForPdf(repository: BoardAssignmentsRepository, value: unknown, canExecute: boolean, today: string): Promise<{ mode: BoardAssignmentPdfRequest["mode"]; records: BoardAssignmentPrintRecord[] }> {
  const invalid = () => new BoardAssignmentPdfError("Проверьте выбор поручений для PDF.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const request = value as Record<string, unknown>;
  if (Object.keys(request).some(key => !["mode", "source", "entries"].includes(key)) || (request.mode !== "register" && request.mode !== "assignment") || (request.source !== "current" && request.source !== "history")) throw invalid();
  if (!Array.isArray(request.entries) || !request.entries.length || (request.mode === "assignment" && request.entries.length !== 1)) throw invalid();
  const ids = new Set<string>();
  const records: BoardAssignmentPrintRecord[] = [];
  for (const raw of request.entries) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid();
    const entry = raw as Record<string, unknown>;
    if (Object.keys(entry).some(key => !["id", "expectedUpdatedAt"].includes(key)) || typeof entry.id !== "string" || !/^[a-zA-Z0-9-]{1,120}$/u.test(entry.id) || typeof entry.expectedUpdatedAt !== "string" || entry.expectedUpdatedAt.length > 40 || ids.has(entry.id)) throw invalid();
    ids.add(entry.id);
    const snapshot = request.source === "history" ? await repository.readCompletionById(entry.id) : undefined;
    const assignment = request.source === "history" ? snapshot?.assignment : await repository.readById(entry.id);
    if (!assignment || (request.source === "current" && canExecute && !isBoardAssignmentActiveOn(assignment, today))) throw new BoardAssignmentPdfError("Поручение недоступно.", 404);
    if (assignment.updatedAt !== entry.expectedUpdatedAt) throw new BoardAssignmentPdfError("Поручение изменилось. Обновите список перед выгрузкой.", 409);
    records.push({ assignment, ...(snapshot ? { completedAt: snapshot.completedAt } : {}) });
  }
  return { mode: request.mode as BoardAssignmentPdfRequest["mode"], records };
}
