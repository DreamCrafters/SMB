import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createBoardAssignment,
  applyBoardAssignmentAction,
  requestBoardAssignment,
  requestBoardAssignments,
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
  dueDate: "До 24.07.2026",
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
      : jsonResponse({ assignments: [summary], permissions });
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
      dueDate: "До 24.07.2026",
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
      dueDate: "До 24.07.2026",
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

test("board assignments workspace keeps the required table and cancel-without-save flow", async () => {
  const source = await readFile(
    new URL("../src/BoardAssignments.tsx", import.meta.url),
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
});
