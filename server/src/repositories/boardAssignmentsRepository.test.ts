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
      dueDate: "До 24.07.2026",
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
  assert.equal(
    saved.sourceMaterial?.fileName,
    "Протокол 369 10.07.2026 v2.pdf",
  );
  assert.equal(saved.comments[0]?.authorDisplayName, "Белов Ю.И.");
  assert.match(queries[0]?.sql ?? "", /insert into board_assignments/u);
  assert.match(queries[1]?.sql ?? "", /insert into board_assignment_comments/u);
  assert.deepEqual(queries[1]?.parameters?.slice(0, 3), [
    "comment-1",
    "assignment-1",
    "board-user",
  ]);
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
