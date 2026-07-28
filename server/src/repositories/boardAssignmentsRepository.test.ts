import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  BoardAssignmentChangedError,
  createBoardAssignmentsRepository,
} from "./boardAssignmentsRepository.js";

const assignmentRow = {
  id: "assignment-1",
  meeting_date: "2026-07-10",
  protocol_number: "369",
  decision_number: "2.3",
  summary: "Подготовить анализ причин невыполнения плана",
  details: "Представить Совету директоров письменный анализ.",
  co_executors: JSON.stringify(["Экономист"]),
  due_date: "Ежемесячно до конца 2026 года",
  recurrence: "monthly",
  active_from: "2026-07-10",
  active_to: "2026-12-31",
  current_occurrence_date: "2026-07-10",
  status: "in_progress",
  source_material_key: "protocol-369-2026-07-10",
  source_material_file_name: "Протокол 369 10.07.2026 v2.pdf",
  created_by_user_id: "board-user",
  created_by_account_id: "board-access",
  created_by_display_name: "Белов Ю.И.",
  created_at: "2026-07-10T08:00:00.000Z",
  updated_at: "2026-07-10T08:00:00.000Z",
};

const commentRow = {
  id: "comment-1",
  assignment_id: "assignment-1",
  author_user_id: "board-user",
  author_account_id: "board-access",
  author_display_name: "Белов Ю.И.",
  comment_text: "Поручение внесено по протоколу.",
  status_after: "in_progress",
  created_at: "2026-07-10T08:00:00.000Z",
};

const documentRow = {
  id: "document-1",
  assignment_id: "assignment-1",
  storage_key: null,
  file_name: "Приложение к протоколу.pdf",
  mime_type: "application/pdf",
  byte_size: 1_024,
  pdf_data: Buffer.from("%PDF-test"),
  uploaded_by_display_name: "Белов Ю.И.",
  created_at: "2026-07-10T08:00:00.000Z",
  deleted_at: null,
};

test("board assignment repository stores the task and immutable initial comment", async () => {
  const queries: Array<{ sql: string; parameters?: readonly unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: readonly unknown[]) {
      queries.push({ sql, parameters });

      if (sql.includes("from board_assignments assignments") && sql.includes("where assignments.id = ?")) {
        return [[assignmentRow], []];
      }
      if (sql.includes("from board_assignment_comments")) {
        return [[commentRow], []];
      }
      if (sql.includes("from board_assignment_documents")) {
        return [[documentRow], []];
      }

      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const ids = ["assignment-1", "comment-1"];
  const repository = createBoardAssignmentsRepository(pool, {
    createId: () => ids.shift() ?? "unexpected-id",
    now: () => new Date("2026-07-10T08:00:00.000Z"),
  });

  const saved = await repository.create({
    assignment: {
      meetingDate: "2026-07-10",
      protocolNumber: "369",
      decisionNumber: "2.3",
      summary: "Подготовить анализ причин невыполнения плана",
      details: "Представить Совету директоров письменный анализ.",
      coExecutors: ["Экономист"],
      recurrence: "monthly",
      activeFrom: "2026-07-10",
      activeTo: "2026-12-31",
      comment: "Поручение внесено по протоколу.",
    },
    actor: {
      userId: "board-user",
      accountId: "board-access",
      displayName: "Белов Ю.И.",
    },
  });

  assert.equal(saved.id, "assignment-1");
  assert.equal(saved.dueDate, "Ежемесячно до конца 2026 года");
  assert.equal(saved.recurrence, "monthly");
  assert.equal(saved.currentOccurrenceDate, "2026-07-10");
  assert.equal(
    saved.sourceMaterial?.fileName,
    "Протокол 369 10.07.2026 v2.pdf",
  );
  assert.deepEqual(saved.documents, [{
    id: "document-1",
    fileName: "Приложение к протоколу.pdf",
    sizeBytes: 1_024,
    uploadedAt: "2026-07-10T08:00:00.000Z",
  }]);
  assert.equal(saved.comments[0]?.authorDisplayName, "Белов Ю.И.");
  assert.match(queries[0]?.sql ?? "", /insert into board_assignments/u);
  assert.match(queries[1]?.sql ?? "", /insert into board_assignment_comments/u);
  assert.deepEqual(queries[1]?.parameters?.slice(0, 3), [
    "comment-1",
    "assignment-1",
    "board-user",
  ]);
});

test("board assignment repository stores a fifth PDF and rejects a sixth", async () => {
  let activeDocumentCount = 4;
  let insertCount = 0;
  const queries: Array<{ sql: string; parameters?: readonly unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: readonly unknown[]) {
      queries.push({ sql, parameters });

      if (sql.includes("from board_assignments assignments") && sql.includes("for update")) {
        return [[{
          status: "in_progress",
          document_count: activeDocumentCount,
        }], []];
      }
      if (sql.includes("insert into board_assignment_documents")) {
        insertCount += 1;
        activeDocumentCount += 1;
      }

      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const repository = createBoardAssignmentsRepository(pool, {
    createId: () => "document-5",
    now: () => new Date("2026-07-28T14:00:00.000Z"),
  });
  const input = {
    assignmentId: "assignment-1",
    fileName: "Финансовое приложение.pdf",
    pdf: Buffer.from("%PDF-1.7\n"),
    actor: {
      userId: "board-user",
      accountId: "board-access",
      displayName: "Белов Ю.И.",
    },
  };

  const saved = await repository.addDocument(input);
  const rejected = await repository.addDocument(input);

  assert.deepEqual(saved, {
    kind: "saved",
    document: {
      id: "document-5",
      fileName: "Финансовое приложение.pdf",
      sizeBytes: 9,
      uploadedAt: "2026-07-28T14:00:00.000Z",
    },
  });
  assert.deepEqual(rejected, { kind: "limit_reached" });
  assert.equal(insertCount, 1);
  const insert = queries.find((query) =>
    query.sql.includes("insert into board_assignment_documents")
  );
  assert.equal(insert?.parameters?.[3], "Финансовое приложение.pdf");
  assert.deepEqual(insert?.parameters?.[6], Buffer.from("%PDF-1.7\n"));
});

test("board assignment repository soft-deletes a live document but keeps its PDF readable", async () => {
  const queries: Array<{ sql: string; parameters?: readonly unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: readonly unknown[]) {
      queries.push({ sql, parameters });

      if (sql.includes("from board_assignment_documents documents") && sql.includes("for update")) {
        return [[{
          id: documentRow.id,
          file_name: documentRow.file_name,
          byte_size: documentRow.byte_size,
          created_at: documentRow.created_at,
          assignment_status: "in_progress",
          deleted_at: null,
        }], []];
      }
      if (
        sql.includes("from board_assignment_documents documents") &&
        sql.includes("where documents.id = ?")
      ) {
        return [[documentRow], []];
      }

      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const repository = createBoardAssignmentsRepository(pool, {
    now: () => new Date("2026-07-28T14:30:00.000Z"),
  });

  const removed = await repository.removeDocument({
    assignmentId: "assignment-1",
    documentId: "document-1",
  });
  const stored = await repository.readDocument("document-1");

  assert.deepEqual(removed, {
    kind: "removed",
    document: {
      id: "document-1",
      fileName: "Приложение к протоколу.pdf",
      sizeBytes: 1_024,
      uploadedAt: "2026-07-10T08:00:00.000Z",
    },
  });
  assert.equal(stored?.fileName, "Приложение к протоколу.pdf");
  assert.deepEqual(stored?.pdf, Buffer.from("%PDF-test"));
  const softDelete = queries.find((query) =>
    query.sql.includes("update board_assignment_documents")
  );
  assert.match(softDelete?.sql ?? "", /set deleted_at = \?/u);
});

test("board assignment repository limits the executor list to active occurrences", async () => {
  let querySql = "";
  let queryParameters: readonly unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: readonly unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[assignmentRow], []];
    },
  } as unknown as DatabasePool;
  const repository = createBoardAssignmentsRepository(pool);

  const rows = await repository.list({}, { activeOn: "2026-07-27" });

  assert.equal(rows.length, 1);
  assert.match(querySql, /assignments\.status in \('in_progress', 'revision_requested'\)/u);
  assert.match(querySql, /assignments\.current_occurrence_date <= \?/u);
  assert.match(
    querySql,
    /assignments\.current_occurrence_date\s+between assignments\.active_from and assignments\.active_to/u,
  );
  assert.deepEqual(queryParameters, ["2026-07-27"]);
});

test("board assignment repository filters the register without interpolating user input", async () => {
  let querySql = "";
  let queryParameters: readonly unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: readonly unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[assignmentRow], []];
    },
  } as unknown as DatabasePool;
  const repository = createBoardAssignmentsRepository(pool);

  const rows = await repository.list({
    status: "in_progress",
    meetingDateFrom: "2026-07-01",
    meetingDateTo: "2026-07-31",
    query: "анализ",
  });

  assert.equal(rows[0]?.protocolNumber, "369");
  assert.match(querySql, /assignments\.status = \?/u);
  assert.match(querySql, /assignments\.meeting_date >= \?/u);
  assert.match(querySql, /lower\(assignments\.summary\) like \?/u);
  assert.match(querySql, /lower\(assignments\.due_date\) like \?/u);
  assert.doesNotMatch(querySql, /\blimit\b/u);
  assert.doesNotMatch(querySql, /анализ/u);
  assert.deepEqual(queryParameters, [
    "in_progress",
    "2026-07-01",
    "2026-07-31",
    "%анализ%",
    "%анализ%",
    "%анализ%",
    "%анализ%",
    "%анализ%",
    "%анализ%",
  ]);
});

test("board assignment repository applies a guarded status transition and appends history", async () => {
  const queries: Array<{ sql: string; parameters?: readonly unknown[] }> = [];
  let detailReadCount = 0;
  const pool = {
    async query(sql: string, parameters?: readonly unknown[]) {
      queries.push({ sql, parameters });

      if (sql.includes("for update")) {
        return [[assignmentRow], []];
      }
      if (sql.includes("update board_assignments")) {
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes("insert into board_assignment_comments")) {
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes("from board_assignments assignments") && sql.includes("where assignments.id = ?")) {
        detailReadCount += 1;
        return [[{ ...assignmentRow, status: "under_review" }], []];
      }
      if (sql.includes("from board_assignment_comments")) {
        return [[
          commentRow,
          {
            ...commentRow,
            id: "comment-2",
            author_user_id: "director-user",
            author_account_id: "director-access",
            author_display_name: "Фридман Е.М.",
            comment_text: "Работа выполнена.",
            status_after: "under_review",
            created_at: "2026-07-20T10:00:00.000Z",
          },
        ], []];
      }
      if (sql.includes("from board_assignment_documents")) {
        return [[documentRow], []];
      }

      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createBoardAssignmentsRepository(pool, {
    createId: () => "comment-2",
    now: () => new Date("2026-07-20T10:00:00.000Z"),
  });

  const current = await repository.readByIdForUpdate("assignment-1");
  assert.equal(current?.status, "in_progress");
  const saved = await repository.applyAction({
    assignmentId: "assignment-1",
    expectedStatus: "in_progress",
    status: "under_review",
    commentStatus: "under_review",
    currentOccurrenceDate: "2026-07-10",
    comment: "Работа выполнена.",
    actor: {
      userId: "director-user",
      accountId: "director-access",
      displayName: "Фридман Е.М.",
    },
  });

  assert.equal(detailReadCount, 1);
  assert.equal(saved.status, "under_review");
  assert.equal(saved.comments.at(-1)?.comment, "Работа выполнена.");
  const update = queries.find((query) =>
    query.sql.includes("update board_assignments")
  );
  assert.match(update?.sql ?? "", /where id = \? and status = \?/u);
  assert.deepEqual(update?.parameters, [
    "under_review",
    "2026-07-10",
    "2026-07-20 10:00:00.000",
    "assignment-1",
    "in_progress",
  ]);
});

test("board assignment repository detects a concurrent status change", async () => {
  const pool = {
    async query(sql: string) {
      if (sql.includes("update board_assignments")) {
        return [{ affectedRows: 0 }, []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createBoardAssignmentsRepository(pool);

  await assert.rejects(
    repository.applyAction({
      assignmentId: "assignment-1",
      expectedStatus: "in_progress",
      status: "under_review",
      commentStatus: "under_review",
      currentOccurrenceDate: "2026-07-10",
      comment: "Работа выполнена.",
      actor: {
        userId: "director-user",
        accountId: "director-access",
        displayName: "Фридман Е.М.",
      },
    }),
    BoardAssignmentChangedError,
  );
});

test("board assignment repository edits the live version and records both states", async () => {
  const queries: Array<{ sql: string; parameters?: readonly unknown[] }> = [];
  const editedRow = {
    ...assignmentRow,
    meeting_date: "2026-07-12",
    protocol_number: "370",
    decision_number: "3.1",
    summary: "Уточнённое содержание",
    details: "Уточнённое полное содержание.",
    co_executors: JSON.stringify(["Экономист", "Главный инженер"]),
    due_date: "Каждую неделю, с 15.07.2026 по 31.12.2026",
    recurrence: "weekly",
    active_from: "2026-07-15",
    active_to: "2026-12-31",
    current_occurrence_date: "2026-08-12",
    updated_at: "2026-07-28T10:00:00.000Z",
  };
  const pool = {
    async query(sql: string, parameters?: readonly unknown[]) {
      queries.push({ sql, parameters });

      if (sql.includes("update board_assignments")) {
        return [{ affectedRows: 1 }, []];
      }
      if (
        sql.includes("from board_assignments assignments") &&
        sql.includes("where assignments.id = ?")
      ) {
        return [[editedRow], []];
      }
      if (sql.includes("from board_assignment_comments")) {
        return [[
          commentRow,
          {
            ...commentRow,
            id: "edit-comment",
            comment_text: "Исправлены сроки и содержание.",
            created_at: "2026-07-28T10:00:00.000Z",
          },
        ], []];
      }
      if (sql.includes("from board_assignment_documents")) {
        return [[documentRow], []];
      }

      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const ids = ["edit-comment", "edit-revision"];
  const repository = createBoardAssignmentsRepository(pool, {
    createId: () => ids.shift() ?? "unexpected-id",
    now: () => new Date("2026-07-28T10:00:00.000Z"),
  });
  const saved = await repository.update({
    assignmentId: "assignment-1",
    expectedUpdatedAt: "2026-07-10T08:00:00.000Z",
    currentOccurrenceDate: "2026-08-12",
    current: {
      ...mapFixtureAssignment(),
      currentOccurrenceDate: "2026-08-10",
    },
    assignment: {
      meetingDate: "2026-07-12",
      protocolNumber: "370",
      decisionNumber: "3.1",
      summary: "Уточнённое содержание",
      details: "Уточнённое полное содержание.",
      coExecutors: ["Экономист", "Главный инженер"],
      recurrence: "weekly",
      activeFrom: "2026-07-15",
      activeTo: "2026-12-31",
      comment: "Исправлены сроки и содержание.",
    },
    actor: {
      userId: "board-user-2",
      accountId: "board-access-2",
      displayName: "Другой член Совета",
    },
  });

  assert.equal(saved.summary, "Уточнённое содержание");
  assert.equal(saved.currentOccurrenceDate, "2026-08-12");
  const update = queries.find((query) =>
    query.sql.includes("update board_assignments")
  );
  assert.match(update?.sql ?? "", /status <> 'completed'/u);
  assert.deepEqual(update?.parameters?.slice(-2), [
    "assignment-1",
    "2026-07-10 08:00:00.000",
  ]);
  const revision = queries.find((query) =>
    query.sql.includes("insert into board_assignment_edit_revisions")
  );
  assert.ok(revision);
  assert.equal(revision.parameters?.[4], "Исправлены сроки и содержание.");
  assert.match(
    String(revision.parameters?.[2]),
    /Подготовить анализ причин невыполнения плана/u,
  );
  assert.match(String(revision.parameters?.[3]), /Уточнённое содержание/u);
});

test("board assignment repository snapshots an accepted occurrence before advancing the repeat", async () => {
  const queries: Array<{ sql: string; parameters?: readonly unknown[] }> = [];
  const nextRow = {
    ...assignmentRow,
    current_occurrence_date: "2026-08-10",
    status: "in_progress",
    updated_at: "2026-07-28T12:00:00.000Z",
  };
  const completedComment = {
    ...commentRow,
    id: "completion-comment",
    author_display_name: "Лариков А.Т.",
    comment_text: "Исполнение принято.",
    status_after: "completed",
    created_at: "2026-07-28T12:00:00.000Z",
  };
  const pool = {
    async query(sql: string, parameters?: readonly unknown[]) {
      queries.push({ sql, parameters });

      if (sql.includes("update board_assignments")) {
        return [{ affectedRows: 1 }, []];
      }
      if (
        sql.includes("from board_assignments assignments") &&
        sql.includes("where assignments.id = ?")
      ) {
        return [[nextRow], []];
      }
      if (sql.includes("from board_assignment_comments")) {
        return [[commentRow, completedComment], []];
      }
      if (sql.includes("from board_assignment_documents")) {
        return [[documentRow], []];
      }

      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const ids = ["completion-comment", "completion-snapshot"];
  const repository = createBoardAssignmentsRepository(pool, {
    createId: () => ids.shift() ?? "unexpected-id",
    now: () => new Date("2026-07-28T12:00:00.000Z"),
  });

  const saved = await repository.applyAction({
    assignmentId: "assignment-1",
    expectedStatus: "under_review",
    status: "in_progress",
    commentStatus: "completed",
    currentOccurrenceDate: "2026-08-10",
    completedOccurrenceDate: "2026-07-10",
    comment: "Исполнение принято.",
    actor: {
      userId: "chair-user",
      accountId: "chair-access",
      displayName: "Лариков А.Т.",
    },
  });

  assert.equal(saved.status, "in_progress");
  assert.equal(saved.currentOccurrenceDate, "2026-08-10");
  const snapshotInsert = queries.find((query) =>
    query.sql.includes("insert into board_assignment_completion_snapshots")
  );
  assert.ok(snapshotInsert);
  const snapshot = JSON.parse(
    String(snapshotInsert.parameters?.[3]),
  ) as {
    status: string;
    currentOccurrenceDate: string;
    comments: Array<{ comment: string; statusAfter: string }>;
    documents: Array<{ id: string; fileName: string }>;
  };
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.currentOccurrenceDate, "2026-07-10");
  assert.deepEqual(snapshot.comments.at(-1), {
    id: "completion-comment",
    authorDisplayName: "Лариков А.Т.",
    comment: "Исполнение принято.",
    statusAfter: "completed",
    createdAt: "2026-07-28T12:00:00.000Z",
  });
  assert.deepEqual(snapshot.documents, [{
    id: "document-1",
    fileName: "Приложение к протоколу.pdf",
    sizeBytes: 1_024,
    uploadedAt: "2026-07-10T08:00:00.000Z",
  }]);
});

test("board assignment repository reads completed snapshots independently of the live row", async () => {
  const completedSnapshot = {
    ...mapFixtureAssignment(),
    currentOccurrenceDate: "2026-07-10",
    status: "completed" as const,
  };
  let listSql = "";
  let listParameters: readonly unknown[] = [];
  const completionRow = {
    id: "completion-1",
    assignment_id: "assignment-1",
    occurrence_date: "2026-07-10",
    snapshot: JSON.stringify(completedSnapshot),
    completed_by_display_name: "Лариков А.Т.",
    completed_at: "2026-07-28T12:00:00.000Z",
  };
  const pool = {
    async query(sql: string, parameters?: readonly unknown[]) {
      if (sql.includes("from board_assignment_completion_snapshots")) {
        listSql = sql;
        listParameters = parameters ?? [];
        return [[completionRow], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createBoardAssignmentsRepository(pool);

  const completions = await repository.listCompletions({
    meetingDateFrom: "2026-07-01",
    query: "анализ",
  });

  assert.equal(completions[0]?.id, "completion-1");
  assert.equal(completions[0]?.assignment.status, "completed");
  assert.equal(completions[0]?.occurrenceDate, "2026-07-10");
  assert.match(listSql, /json_extract\(completions\.snapshot/u);
  assert.match(listSql, /order by completions\.completed_at desc/u);
  assert.deepEqual(listParameters, [
    "2026-07-01",
    "%анализ%",
    "%анализ%",
    "%анализ%",
    "%анализ%",
    "%анализ%",
  ]);
});

function mapFixtureAssignment() {
  return {
    id: assignmentRow.id,
    meetingDate: assignmentRow.meeting_date,
    protocolNumber: assignmentRow.protocol_number,
    decisionNumber: assignmentRow.decision_number,
    summary: assignmentRow.summary,
    details: assignmentRow.details,
    coExecutors: ["Экономист"],
    dueDate: assignmentRow.due_date,
    recurrence: "monthly" as const,
    activeFrom: assignmentRow.active_from,
    activeTo: assignmentRow.active_to,
    currentOccurrenceDate: assignmentRow.current_occurrence_date,
    status: "in_progress" as const,
    sourceMaterial: {
      key: assignmentRow.source_material_key,
      fileName: assignmentRow.source_material_file_name,
    },
    documents: [{
      id: documentRow.id,
      fileName: documentRow.file_name,
      sizeBytes: documentRow.byte_size,
      uploadedAt: documentRow.created_at,
    }],
    createdByDisplayName: assignmentRow.created_by_display_name,
    createdAt: assignmentRow.created_at,
    updatedAt: assignmentRow.updated_at,
    comments: [{
      id: commentRow.id,
      authorDisplayName: commentRow.author_display_name,
      comment: commentRow.comment_text,
      statusAfter: "in_progress" as const,
      createdAt: commentRow.created_at,
    }],
  };
}
