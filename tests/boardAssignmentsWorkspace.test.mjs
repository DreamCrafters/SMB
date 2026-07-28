import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const DOM_GLOBAL_NAMES = [
  "document",
  "Element",
  "Event",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "MouseEvent",
  "navigator",
  "Node",
  "window",
  "IS_REACT_ACT_ENVIRONMENT",
];

test("board assignment executor sees active cards and submits without choosing a status", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  const summary = {
    id: "assignment-1",
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.3",
    summary: "Подготовить анализ причин невыполнения плана",
    coExecutors: ["Экономист"],
    dueDate: "Каждый месяц, с 01.08.2026 по 31.12.2026",
    recurrence: "monthly",
    activeFrom: "2026-08-01",
    activeTo: "2026-12-31",
    currentOccurrenceDate: "2026-08-01",
    status: "in_progress",
    createdByDisplayName: "Белов Ю.И.",
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T08:00:00.000Z",
  };
  const permissions = {
    canView: true,
    canCreate: false,
    canExecute: true,
    canReview: false,
  };
  let actionRequest;

  try {
    const { BoardAssignmentsWorkspace } = await vite.ssrLoadModule(
      "/src/BoardAssignments.tsx",
    );
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      if (url.pathname === "/api/board-assignments") {
        return jsonResponse({ assignments: [summary], permissions });
      }
      if (
        url.pathname === "/api/board-assignments/assignment-1/action" &&
        init?.method === "POST"
      ) {
        actionRequest = JSON.parse(String(init.body));
        return jsonResponse({
          assignment: {
            ...summary,
            status: "under_review",
            details: "Представить Совету директоров письменный анализ.",
            comments: [],
          },
          permissions,
        });
      }
      if (url.pathname === "/api/board-assignments/assignment-1") {
        return jsonResponse({
          assignment: {
            ...summary,
            details: "Представить Совету директоров письменный анализ.",
            sourceMaterial: {
              key: "protocol-369-2026-07-10",
              fileName: "Протокол 369 10.07.2026 v2.pdf",
            },
            comments: [
              {
                id: "comment-1",
                authorDisplayName: "Фридман Е.М.",
                comment: "Комментарий один.",
                statusAfter: "in_progress",
                createdAt: "2026-07-20T10:00:00.000Z",
              },
              {
                id: "comment-2",
                authorDisplayName: "Лариков А.Т.",
                comment: "Комментарий два.",
                statusAfter: "revision_requested",
                createdAt: "2026-07-21T10:00:00.000Z",
              },
            ],
          },
          permissions,
        });
      }

      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    await React.act(async () => {
      root.render(
        React.createElement(BoardAssignmentsWorkspace, {
          isAdminPreviewMode: false,
          onShowToast() {},
        }),
      );
    });
    await waitFor(React, () =>
      rootElement.querySelector(".board-assignment-link") !== null
    );

    assert.match(
      rootElement.querySelector(".board-assignment-executor-overview")
          ?.textContent ?? "",
      /Активные поручения/u,
    );
    assert.notEqual(
      rootElement.querySelector(".board-assignment-executor-card"),
      null,
    );
    assert.equal(rootElement.querySelector("table"), null);
    assert.equal(
      rootElement.querySelector(".board-assignment-filters select"),
      null,
    );

    await React.act(async () => {
      rootElement.querySelector(".board-assignment-link").click();
    });
    await waitFor(React, () =>
      rootElement.querySelector(".board-assignment-comments pre") !== null
    );

    const comments = rootElement.querySelector(
      ".board-assignment-comments pre",
    )?.textContent ?? "";
    assert.match(
      comments,
      /\d{2}\.\d{2}\.\d{4}.*Фридман Е\.М\.\nКомментарий один\.\n\n\d{2}\.\d{2}\.\d{4}.*Лариков А\.Т\.\nКомментарий два\./u,
    );
    assert.equal(findLabel(rootElement, "Комментарий") !== undefined, true);
    assert.equal(findLabel(rootElement, "Статус"), undefined);
    const submitButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Отправить на проверку",
    );
    assert.ok(submitButton);
    assert.match(
      rootElement.querySelector(".board-assignment-details")?.textContent ?? "",
      /Каждый месяц.*01\.08\.2026.*31\.12\.2026/su,
    );

    const cancel = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Отмена",
    );
    assert.ok(cancel);
    const detailDialog = rootElement.querySelector('[role="dialog"]');
    const detailBackdrop = rootElement.querySelector(
      ".admin-db-modal-backdrop",
    );
    assert.ok(detailDialog);
    assert.ok(detailBackdrop);
    await React.act(async () => {
      detailDialog.dispatchEvent(
        new globalThis.MouseEvent("mousedown", { bubbles: true }),
      );
    });
    assert.notEqual(rootElement.querySelector('[role="dialog"]'), null);
    await React.act(async () => {
      detailBackdrop.dispatchEvent(
        new globalThis.MouseEvent("mousedown", { bubbles: true }),
      );
    });
    assert.equal(rootElement.querySelector('[role="dialog"]'), null);

    await React.act(async () => {
      rootElement.querySelector(".board-assignment-link").click();
    });
    await waitFor(React, () =>
      rootElement.querySelector(".board-assignment-comments pre") !== null
    );
    const actionComment = findLabel(
      rootElement,
      "Комментарий",
    )?.querySelector("textarea");
    assert.ok(actionComment);
    await React.act(async () => {
      setTextAreaValue(actionComment, "Работа выполнена, материалы приложены.");
    });
    const directSubmit = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Отправить на проверку",
    );
    assert.ok(directSubmit);
    await React.act(async () => directSubmit.click());
    await waitFor(React, () =>
      rootElement.querySelector('[role="dialog"]') === null
    );
    assert.deepEqual(actionRequest, {
      action: "submit_for_review",
      comment: "Работа выполнена, материалы приложены.",
    });

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    globalThis.fetch = previousFetch;
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("board assignment creation offers one-time and recurring schedule choices", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { BoardAssignmentsWorkspace } = await vite.ssrLoadModule(
      "/src/BoardAssignments.tsx",
    );
    globalThis.fetch = async () => jsonResponse({
      assignments: [],
      permissions: {
        canView: true,
        canCreate: true,
        canExecute: false,
        canReview: false,
      },
    });
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    await React.act(async () => {
      root.render(
        React.createElement(BoardAssignmentsWorkspace, {
          isAdminPreviewMode: false,
          onShowToast() {},
        }),
      );
    });
    await waitFor(React, () =>
      rootElement.querySelector(".board-assignment-create-overview") !== null
    );
    assert.match(
      rootElement.querySelector(".board-assignment-create-overview")
          ?.textContent ?? "",
      /Создать новое поручение.*0.*в реестре/su,
    );
    assert.equal(
      rootElement.querySelector(".board-assignment-access-card"),
      null,
    );

    const addButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Добавить поручение",
    );
    assert.ok(addButton);
    await React.act(async () => addButton.click());

    const recurrenceSelect = findLabel(
      rootElement,
      "Периодичность",
    )?.querySelector("select");
    assert.deepEqual(
      Array.from(recurrenceSelect?.options ?? []).map((option) =>
        option.textContent?.trim()
      ),
      ["Каждый день", "Каждую неделю", "Каждый месяц", "Каждый год", "Один раз"],
    );
    assert.equal(findLabel(rootElement, "Действует с") !== undefined, true);
    assert.equal(findLabel(rootElement, "Действует по") !== undefined, true);
    const documentInput = rootElement.querySelector(
      '.board-assignment-document-fields input[type="file"]',
    );
    assert.ok(documentInput);
    assert.equal(documentInput.multiple, true);
    assert.equal(documentInput.accept, "application/pdf,.pdf");
    assert.match(
      rootElement.querySelector(".board-assignment-document-fields")
        ?.textContent ?? "",
      /До 5 PDF-файлов.*10 МБ/u,
    );

    const meetingDateInput = findLabel(
      rootElement,
      "Дата заседания",
    )?.querySelector("input");
    assert.ok(meetingDateInput);
    await React.act(async () => {
      setInputValue(meetingDateInput, "2026-07-10");
    });
    assert.equal(
      findLabel(rootElement, "Действует с")?.querySelector("input")?.value,
      "2026-07-10",
    );
    assert.equal(
      findLabel(rootElement, "Действует по")?.querySelector("input")?.value,
      "2026-07-10",
    );

    const createDialog = rootElement.querySelector('[role="dialog"]');
    const createBackdrop = rootElement.querySelector(
      ".admin-db-modal-backdrop",
    );
    assert.ok(createDialog);
    assert.ok(createBackdrop);
    await React.act(async () => {
      createDialog.dispatchEvent(
        new globalThis.MouseEvent("mousedown", { bubbles: true }),
      );
    });
    assert.notEqual(rootElement.querySelector('[role="dialog"]'), null);
    await React.act(async () => {
      createBackdrop.dispatchEvent(
        new globalThis.MouseEvent("mousedown", { bubbles: true }),
      );
    });
    assert.equal(rootElement.querySelector('[role="dialog"]'), null);

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    globalThis.fetch = previousFetch;
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("board assignment reviewer gets a decision queue with direct actions", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  const permissions = {
    canView: true,
    canCreate: true,
    canExecute: false,
    canReview: true,
  };
  const awaitingReview = {
    id: "assignment-review",
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.4",
    summary: "Представить отчёт о выполнении поручения",
    coExecutors: ["Экономист"],
    dueDate: "Один раз, 28.07.2026",
    recurrence: "once",
    activeFrom: "2026-07-28",
    activeTo: "2026-07-28",
    currentOccurrenceDate: "2026-07-28",
    status: "under_review",
    createdByDisplayName: "Белов Ю.И.",
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-28T08:00:00.000Z",
  };
  const completed = {
    ...awaitingReview,
    id: "assignment-completed",
    summary: "Ранее принятое поручение",
    status: "completed",
  };
  let actionRequest;

  try {
    const { BoardAssignmentsWorkspace } = await vite.ssrLoadModule(
      "/src/BoardAssignments.tsx",
    );
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (url.pathname === "/api/board-assignments") {
        return jsonResponse({
          assignments: [awaitingReview, completed],
          permissions,
        });
      }
      if (
        url.pathname === "/api/board-assignments/assignment-review/action" &&
        init?.method === "POST"
      ) {
        actionRequest = JSON.parse(String(init.body));
        return jsonResponse({
          assignment: {
            ...awaitingReview,
            status: "completed",
            details: "Проверить представленный результат.",
            comments: [],
          },
          permissions,
        });
      }
      if (url.pathname === "/api/board-assignments/assignment-review") {
        return jsonResponse({
          assignment: {
            ...awaitingReview,
            details: "Проверить представленный результат.",
            comments: [],
          },
          permissions,
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    await React.act(async () => {
      root.render(
        React.createElement(BoardAssignmentsWorkspace, {
          isAdminPreviewMode: false,
          onShowToast() {},
        }),
      );
    });
    await waitFor(React, () =>
      rootElement.querySelector(".board-assignment-review-overview") !== null
    );

    assert.match(
      rootElement.querySelector(".board-assignment-review-overview")
          ?.textContent ?? "",
      /Ожидают решения.*1/su,
    );
    assert.equal(
      rootElement.querySelectorAll(".board-assignment-review-card").length,
      1,
    );
    assert.notEqual(rootElement.querySelector("table"), null);

    const reviewButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Проверить исполнение",
    );
    assert.ok(reviewButton);
    await React.act(async () => reviewButton.click());
    await waitFor(React, () =>
      findLabel(rootElement, "Комментарий к решению") !== undefined
    );

    const reviewDialog = rootElement.querySelector('[role="dialog"]');
    assert.ok(reviewDialog);
    assert.equal(findLabel(reviewDialog, "Статус"), undefined);
    const acceptButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Принять исполнение",
    );
    const returnButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Вернуть на доработку",
    );
    assert.ok(acceptButton);
    assert.ok(returnButton);

    const decisionComment = findLabel(
      reviewDialog,
      "Комментарий к решению",
    )?.querySelector("textarea");
    assert.ok(decisionComment);
    await React.act(async () => {
      setTextAreaValue(decisionComment, "Результат соответствует поручению.");
    });
    await React.act(async () => acceptButton.click());
    await waitFor(React, () => actionRequest !== undefined);
    assert.deepEqual(actionRequest, {
      action: "complete",
      comment: "Результат соответствует поручению.",
    });

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    globalThis.fetch = previousFetch;
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("board assignment viewer gets a quiet read-only register", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  const permissions = {
    canView: true,
    canCreate: false,
    canExecute: false,
    canReview: false,
  };
  const assignment = {
    id: "assignment-view",
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.5",
    summary: "Ознакомиться с состоянием поручения",
    coExecutors: [],
    dueDate: "Один раз, 28.07.2026",
    recurrence: "once",
    activeFrom: "2026-07-28",
    activeTo: "2026-07-28",
    currentOccurrenceDate: "2026-07-28",
    status: "in_progress",
    createdByDisplayName: "Белов Ю.И.",
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-28T08:00:00.000Z",
  };

  try {
    const { BoardAssignmentsWorkspace } = await vite.ssrLoadModule(
      "/src/BoardAssignments.tsx",
    );
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (url.pathname === "/api/board-assignments") {
        return jsonResponse({ assignments: [assignment], permissions });
      }
      if (url.pathname === "/api/board-assignments/assignment-view") {
        return jsonResponse({
          assignment: {
            ...assignment,
            details: "Доступно только ознакомление.",
            comments: [],
          },
          permissions,
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    await React.act(async () => {
      root.render(
        React.createElement(BoardAssignmentsWorkspace, {
          isAdminPreviewMode: false,
          onShowToast() {},
        }),
      );
    });
    await waitFor(React, () =>
      rootElement.querySelector(".board-assignment-view-notice") !== null
    );

    assert.match(
      rootElement.querySelector(".board-assignment-view-notice")
          ?.textContent ?? "",
      /Только просмотр.*1.*поручение/su,
    );
    assert.notEqual(rootElement.querySelector("table"), null);
    assert.notEqual(
      rootElement.querySelector(".board-assignment-filters select"),
      null,
    );
    assert.equal(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Добавить поручение",
      ),
      false,
    );

    await React.act(async () => {
      rootElement.querySelector(".board-assignment-link").click();
    });
    await waitFor(React, () =>
      rootElement.querySelector('[role="dialog"]') !== null
    );
    assert.equal(
      rootElement.querySelector(".board-assignment-decision"),
      null,
    );

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    globalThis.fetch = previousFetch;
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("board assignment creator edits live tasks and opens immutable completion history", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  const permissions = {
    canView: true,
    canCreate: true,
    canExecute: false,
    canReview: false,
  };
  const summary = {
    id: "assignment-edit",
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.3",
    summary: "Первоначальное содержание",
    coExecutors: ["Экономист"],
    dueDate: "Каждый месяц, с 10.07.2026 по 31.12.2026",
    recurrence: "monthly",
    activeFrom: "2026-07-10",
    activeTo: "2026-12-31",
    currentOccurrenceDate: "2026-08-10",
    status: "under_review",
    createdByDisplayName: "Белов Ю.И.",
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
  };
  const detail = {
    ...summary,
    details: "Первоначальное полное содержание.",
    documents: [{
      id: "document-1",
      fileName: "Протокол 369.pdf",
      sizeBytes: 412_000,
      uploadedAt: "2026-07-10T08:00:00.000Z",
    }],
    comments: [],
  };
  const completedSnapshot = {
    ...detail,
    summary: "Состояние первого выполненного периода",
    currentOccurrenceDate: "2026-07-10",
    status: "completed",
    comments: [{
      id: "completion-comment",
      authorDisplayName: "Лариков А.Т.",
      comment: "Исполнение принято.",
      statusAfter: "completed",
      createdAt: "2026-07-28T12:00:00.000Z",
    }],
  };
  const completion = {
    id: "completion-1",
    assignmentId: summary.id,
    occurrenceDate: "2026-07-10",
    completedByDisplayName: "Лариков А.Т.",
    completedAt: "2026-07-28T12:00:00.000Z",
    assignment: completedSnapshot,
  };
  let updateRequest;

  try {
    const { BoardAssignmentsWorkspace } = await vite.ssrLoadModule(
      "/src/BoardAssignments.tsx",
    );
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      if (url.pathname === "/api/board-assignments" && init?.method === "GET") {
        return jsonResponse({ assignments: [summary], permissions });
      }
      if (
        url.pathname === "/api/board-assignments/assignment-edit" &&
        init?.method === "PATCH"
      ) {
        updateRequest = JSON.parse(String(init.body));
        return jsonResponse({
          assignment: {
            ...detail,
            ...updateRequest,
            dueDate: "Каждую неделю, с 15.07.2026 по 31.12.2026",
          },
          permissions,
        });
      }
      if (url.pathname === "/api/board-assignments/assignment-edit") {
        return jsonResponse({ assignment: detail, permissions });
      }
      if (url.pathname === "/api/board-assignment-completions") {
        const { details: _details, comments: _comments, ...completionSummary } =
          completedSnapshot;
        return jsonResponse({
          completions: [{ ...completion, assignment: completionSummary }],
          permissions,
        });
      }
      if (
        url.pathname ===
          "/api/board-assignment-completions/completion-1"
      ) {
        return jsonResponse({ completion, permissions });
      }

      throw new Error(`Unexpected request: ${url.pathname} ${init?.method}`);
    };

    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    await React.act(async () => {
      root.render(
        React.createElement(BoardAssignmentsWorkspace, {
          isAdminPreviewMode: false,
          onShowToast() {},
        }),
      );
    });
    await waitFor(React, () =>
      rootElement.querySelector(".board-assignment-link") !== null
    );

    await React.act(async () => {
      rootElement.querySelector(".board-assignment-link").click();
    });
    await waitFor(React, () =>
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Редактировать",
      )
    );
    const editButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Редактировать",
    );
    await React.act(async () => editButton.click());
    assert.match(
      rootElement.querySelector('[role="dialog"]')?.textContent ?? "",
      /Редактирование поручения/u,
    );
    assert.match(
      rootElement.querySelector(".board-assignment-document-list")
        ?.textContent ?? "",
      /Протокол 369\.pdf.*412 КБ.*Удалить/su,
    );
    const removeDocumentButton = Array.from(
      rootElement.querySelectorAll(
        ".board-assignment-document-list button",
      ),
    ).find((button) => button.textContent?.trim() === "Удалить");
    assert.ok(removeDocumentButton);
    await React.act(async () => removeDocumentButton.click());
    assert.match(
      rootElement.querySelector(".board-assignment-document-list")
        ?.textContent ?? "",
      /Вернуть/u,
    );
    const restoreDocumentButton = Array.from(
      rootElement.querySelectorAll(
        ".board-assignment-document-list button",
      ),
    ).find((button) => button.textContent?.trim() === "Вернуть");
    assert.ok(restoreDocumentButton);
    await React.act(async () => restoreDocumentButton.click());
    const summaryInput = findLabel(
      rootElement,
      "Краткое содержание поручения",
    )?.querySelector("input");
    assert.equal(summaryInput?.value, "Первоначальное содержание");
    await React.act(async () => {
      setInputValue(summaryInput, "Уточнённое содержание");
      setTextAreaValue(
        findLabel(rootElement, "Комментарий к изменению")
          ?.querySelector("textarea"),
        "Исправлены сроки и содержание.",
      );
    });
    const saveButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Сохранить изменения",
    );
    await React.act(async () => saveButton.click());
    await waitFor(React, () => updateRequest !== undefined);
    assert.equal(updateRequest.summary, "Уточнённое содержание");
    assert.equal(
      updateRequest.comment,
      "Исправлены сроки и содержание.",
    );
    assert.equal(
      updateRequest.expectedUpdatedAt,
      "2026-07-20T08:00:00.000Z",
    );

    const closeButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Закрыть",
    );
    if (closeButton !== undefined) {
      await React.act(async () => closeButton.click());
    }
    const historyButton = Array.from(rootElement.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "История выполненных");
    assert.ok(historyButton);
    await React.act(async () => historyButton.click());
    await waitFor(React, () =>
      rootElement.querySelector(".board-assignment-history-table") !== null
    );
    assert.equal(findLabel(rootElement, "Заседание с") !== undefined, true);
    assert.equal(findLabel(rootElement, "Заседание по") !== undefined, true);
    assert.equal(findLabel(rootElement, "Статус"), undefined);
    assert.match(
      rootElement.querySelector(".board-assignment-history-table")
        ?.textContent ?? "",
      /Состояние первого выполненного периода.*10\.07\.2026.*Лариков А\.Т\./su,
    );
    const historyLink = rootElement.querySelector(
      ".board-assignment-history-table .board-assignment-link",
    );
    await React.act(async () => historyLink.click());
    await waitFor(React, () =>
      rootElement.querySelector('[role="dialog"]')?.textContent
        ?.includes("Исполнение принято.")
    );
    assert.match(
      rootElement.querySelector('[role="dialog"]')?.textContent ?? "",
      /Снимок выполненного поручения.*Завершено/u,
    );
    assert.equal(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Редактировать",
      ),
      false,
    );

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    globalThis.fetch = previousFetch;
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

function findLabel(root, text) {
  return Array.from(root.querySelectorAll("label")).find(
    (label) => label.querySelector("span")?.textContent?.trim() === text,
  );
}

function setInputValue(input, value) {
  Object.getOwnPropertyDescriptor(
    globalThis.HTMLInputElement.prototype,
    "value",
  ).set.call(input, value);
  input.dispatchEvent(new globalThis.Event("input", { bubbles: true }));
}

function setTextAreaValue(textarea, value) {
  Object.getOwnPropertyDescriptor(
    globalThis.HTMLTextAreaElement.prototype,
    "value",
  ).set.call(textarea, value);
  textarea.dispatchEvent(new globalThis.Event("input", { bubbles: true }));
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  assert.fail("Timed out waiting for the workspace to render.");
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function captureDomGlobals() {
  return new Map(
    DOM_GLOBAL_NAMES.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
}

function installDomGlobals(window) {
  for (const name of DOM_GLOBAL_NAMES) {
    const value = name === "IS_REACT_ACT_ENVIRONMENT"
      ? true
      : window[name];
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
}

function restoreDomGlobals(previous) {
  for (const [name, descriptor] of previous) {
    if (descriptor === undefined) {
      delete globalThis[name];
    } else {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
}
