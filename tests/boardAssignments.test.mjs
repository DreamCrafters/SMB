import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createBoardAssignment,
  applyBoardAssignmentAction,
  deleteBoardAssignmentDocument,
  requestBoardAssignment,
  requestBoardAssignments,
  uploadBoardAssignmentDocument,
} from "../.test-build/src/services/boardAssignments.js";

const permissions = {
  canView: true,
  canCreate: true,
  canExecute: false,
  canReview: true,
};

const summary = {
  id: "protocol-369-assignment-2-3",
  meetingDate: "2026-07-10",
  protocolNumber: "369",
  decisionNumber: "2.3",
  summary: "Подготовить анализ причин невыполнения плановых показателей",
  coExecutors: ["Экономист"],
  dueDate: "Каждый месяц, с 01.08.2026 по 31.12.2026",
  recurrence: "monthly",
  activeFrom: "2026-08-01",
  activeTo: "2026-12-31",
  currentOccurrenceDate: "2026-08-01",
  isOverdue: true,
  status: "in_progress",
  createdByDisplayName: "Протокол №369",
  createdAt: "2026-07-10T08:00:00.000Z",
  updatedAt: "2026-07-10T08:00:00.000Z",
};

const detail = {
  ...summary,
  details: "Представить Совету директоров письменный анализ.",
  sourceMaterial: {
    key: "protocol-369-2026-07-10",
    fileName: "Протокол 369 10.07.2026 v2.pdf",
  },
  documents: [{
    id: "document-1",
    fileName: "Протокол 369 10.07.2026 v2.pdf",
    sizeBytes: 412_000,
    uploadedAt: "2026-07-10T08:00:00.000Z",
  }],
  comments: [{
    id: "comment-1",
    authorDisplayName: "Фридман Е.М.",
    comment: "Работа выполнена.",
    statusAfter: "under_review",
    createdAt: "2026-07-20T10:00:00.000Z",
  }],
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("board assignments service filters the register and validates detail history", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    requests.push({ url: input.toString(), init });
    return input.toString().endsWith("/protocol-369-assignment-2-3")
      ? jsonResponse({ assignment: detail, permissions })
      : jsonResponse({
          assignments: [summary],
          permissions,
          boardMeetingReminder:
            "Необходимо подготовиться к Совету директоров на 15 число",
        });
  };

  try {
    const register = await requestBoardAssignments(
      {
        status: "in_progress",
        meetingDateFrom: "2026-07-01",
        meetingDateTo: "2026-07-31",
        query: "анализ",
      },
      { baseUrl: "http://api.test" },
    );
    const assignment = await requestBoardAssignment(
      "protocol-369-assignment-2-3",
      { baseUrl: "http://api.test" },
    );

    assert.equal(register.status, "ready");
    assert.equal(
      register.status === "ready"
        ? register.assignments[0]?.isOverdue
        : undefined,
      true,
    );
    assert.equal(
      register.status === "ready"
        ? register.boardMeetingReminder
        : undefined,
      "Необходимо подготовиться к Совету директоров на 15 число",
    );
    assert.equal(assignment.status, "ready");
    assert.equal(
      assignment.status === "ready"
        ? assignment.assignment.comments[0]?.authorDisplayName
        : undefined,
      "Фридман Е.М.",
    );
    assert.equal(
      requests[0].url,
      "http://api.test/api/board-assignments?status=in_progress&meetingDateFrom=2026-07-01&meetingDateTo=2026-07-31&query=%D0%B0%D0%BD%D0%B0%D0%BB%D0%B8%D0%B7",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("board assignments service sends create and immutable action comment payloads", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    requests.push({ url: input.toString(), init });
    return jsonResponse({ assignment: detail, permissions }, init.method === "POST" ? 201 : 200);
  };

  try {
    await createBoardAssignment({
      meetingDate: "2026-07-10",
      protocolNumber: "369",
      decisionNumber: "2.3",
      summary: summary.summary,
      details: detail.details,
      coExecutors: ["Экономист"],
      recurrence: "monthly",
      activeFrom: "2026-08-01",
      activeTo: "2026-12-31",
      comment: "Внесено по протоколу.",
    }, { baseUrl: "http://api.test" });
    await applyBoardAssignmentAction(
      summary.id,
      {
        action: "submit_for_review",
        comment: "Работа выполнена.",
      },
      { baseUrl: "http://api.test" },
    );

    assert.deepEqual(JSON.parse(requests[0].init.body), {
      meetingDate: "2026-07-10",
      protocolNumber: "369",
      decisionNumber: "2.3",
      summary: summary.summary,
      details: detail.details,
      coExecutors: ["Экономист"],
      recurrence: "monthly",
      activeFrom: "2026-08-01",
      activeTo: "2026-12-31",
      comment: "Внесено по протоколу.",
    });
    assert.deepEqual(JSON.parse(requests[1].init.body), {
      action: "submit_for_review",
      comment: "Работа выполнена.",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("board assignments service uploads raw PDFs and removes them by protected id", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    requests.push({ url: input.toString(), init });
    if (init.method === "DELETE") {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({
      document: {
        id: "document-5",
        fileName: "Протокол №369.pdf",
        sizeBytes: 9,
        uploadedAt: "2026-07-28T09:00:00.000Z",
      },
    }, 201);
  };

  try {
    const file = new File(
      [new TextEncoder().encode("%PDF-1.7")],
      "Протокол №369.pdf",
      { type: "application/pdf" },
    );
    const upload = await uploadBoardAssignmentDocument(
      summary.id,
      file,
      { baseUrl: "http://api.test" },
    );
    const removal = await deleteBoardAssignmentDocument(
      summary.id,
      "document-5",
      { baseUrl: "http://api.test" },
    );

    assert.equal(upload.status, "ready");
    assert.equal(removal.status, "ready");
    assert.equal(
      requests[0].url,
      "http://api.test/api/board-assignments/protocol-369-assignment-2-3/documents?fileName=%D0%9F%D1%80%D0%BE%D1%82%D0%BE%D0%BA%D0%BE%D0%BB+%E2%84%96369.pdf",
    );
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.headers["Content-Type"], "application/pdf");
    assert.equal(requests[0].init.body, file);
    assert.equal(
      requests[1].url,
      "http://api.test/api/board-assignments/protocol-369-assignment-2-3/documents/document-5",
    );
    assert.equal(requests[1].init.method, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("board assignments service does not expose network diagnostics to business users", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  try {
    const result = await requestBoardAssignments(
      {},
      { baseUrl: "http://private-api.test" },
    );

    assert.equal(result.status, "error");
    assert.equal(
      result.status === "error" ? result.message : "",
      "Не удалось загрузить поручения Совета директоров.",
    );
    assert.doesNotMatch(
      result.status === "error" ? result.message : "",
      /private-api|\/health|CORS|backend|server/iu,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("board assignments workspace keeps the register, cancel flow, and distinct access layouts", async () => {
  const source = await readFile(
    new URL("../src/BoardAssignments.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );

  for (const column of [
    "Дата заседания Совета директоров",
    "Краткое содержание поручения",
    "Соисполнители",
    "Срок исполнения",
    "Статус",
  ]) {
    assert.match(source, new RegExp(column, "u"));
  }
  assert.match(source, /className="board-assignment-link"/u);
  assert.match(source, /Комментарий/u);
  assert.match(source, /Отправить/u);
  assert.match(source, /Отмена/u);
  assert.match(source, /setSelectedId\(undefined\)/u);
  assert.match(source, /setCreateInput\(emptyCreateInput\)/u);
  assert.match(source, /setCoExecutorsText\(""\)/u);
  assert.match(source, /setCreateComment\(""\)/u);
  assert.match(source, /accept="application\/pdf,.pdf"/u);
  assert.match(source, /multiple/u);
  assert.match(source, /До 5 PDF-файлов/u);
  assert.match(source, /Удалить/u);
  assert.match(source, /Вернуть/u);
  for (const accessLayout of [
    "view-notice",
    "create-overview",
    "executor-overview",
    "executor-list",
    "review-overview",
    "review-queue",
  ]) {
    assert.match(styles, new RegExp(`\\.board-assignment-${accessLayout}`, "u"));
  }
  assert.match(source, /Отправить на проверку/u);
  assert.match(source, /Принять исполнение/u);
  assert.match(source, /Вернуть на доработку/u);
  assert.doesNotMatch(styles, /\.board-assignment-access-card/u);
});
