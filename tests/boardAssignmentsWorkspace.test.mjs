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

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

test.after(async () => {
  await vite.close();
});

test("board assignment executor sees active rows and submits without choosing a status", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
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
    isOverdue: true,
    status: "in_progress",
    createdByDisplayName: "Белов Ю.И.",
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T08:00:00.000Z",
  };
  const activeSummary = {
    ...summary,
    id: "assignment-2",
    summary: "Подготовить план корректирующих мероприятий",
    isOverdue: false,
  };
  const revisionSummary = {
    ...summary,
    id: "assignment-3",
    summary: "Уточнить причины отклонения",
    isOverdue: false,
    status: "revision_requested",
  };
  const permissions = {
    canView: true,
    canCreate: false,
    canExecute: true,
    canReview: false,
  };
  let actionRequest;
  let listSearchParams;
  let pendingSearch;
  const pdfRequests = [];
  let failPdf = false;
  dom.window.HTMLAnchorElement.prototype.click = function () {};

  try {
    const { BoardAssignmentsWorkspace } = await vite.ssrLoadModule(
      "/src/BoardAssignments.tsx",
    );
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      if (url.pathname === "/api/board-assignments/export.pdf") {
        pdfRequests.push(JSON.parse(init.body));
        return failPdf ? new Response(JSON.stringify({ error: { message: "Обновите список перед выгрузкой." } }), { status: 409 }) : new Response("%PDF-example", { headers: { "Content-Type": "application/pdf" } });
      }
      if (url.pathname === "/api/board-assignments") {
        listSearchParams = url.searchParams;
        if (url.searchParams.get("query") === "ана") {
          return new Promise((resolve) => {
            pendingSearch = { resolve, signal: init.signal };
          });
        }
        return jsonResponse({
          assignments: [summary, activeSummary, revisionSummary],
          permissions,
          boardMeetingReminder:
            "Необходимо подготовиться к Совету директоров на 15 число",
        });
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
    assert.equal(
      rootElement.querySelector(".board-assignment-meeting-reminder")
        ?.textContent,
      "НапоминаниеНеобходимо подготовиться к Совету директоров на 15 число",
    );

    assert.match(
      rootElement.querySelector(".board-assignment-executor-overview")
          ?.textContent ?? "",
      /Активные поручения/u,
    );
    assert.notEqual(
      rootElement.querySelector(".board-assignment-table tbody tr"),
      null,
    );
    assert.equal(
      rootElement.querySelector(".board-assignment-table tbody tr.is-overdue")
        ?.querySelector(".board-assignment-status")?.textContent,
      "Просрочено",
    );
    assert.equal(rootElement.querySelectorAll(".board-assignment-table tbody tr").length, 3);
    const statusFilter = rootElement.querySelector(".board-assignment-status-filter");
    const statusInputs = Array.from(
      statusFilter.querySelectorAll('input[type="checkbox"]'),
    );
    assert.deepEqual(
      statusInputs.map((input) => [input.value, input.parentElement.textContent.trim()]),
      [
        ["overdue", "Просрочено"],
        ["in_progress", "В работе"],
        ["revision_requested", "На доработке"],
      ],
    );
    await React.act(async () => {
      for (const value of ["overdue", "revision_requested"]) {
        const input = statusInputs.find((item) => item.value === value);
        input.click();
      }
    });
    assert.equal(Array.from(rootElement.querySelectorAll("button")).some(
      (button) => button.textContent?.trim() === "Показать",
    ), false);
    assert.equal(listSearchParams.has("status"), false);
    assert.equal(rootElement.querySelectorAll(".board-assignment-table tbody tr").length, 2);
    assert.equal(rootElement.querySelectorAll(".board-assignment-table tbody tr.is-overdue").length, 1);
    const printRegister = () => Array.from(rootElement.querySelectorAll("button")).find(button => button.textContent === "Скачать журнал в PDF");
    await React.act(async () => printRegister().click());
    assert.deepEqual(pdfRequests.at(-1), { mode: "register", source: "current", entries: [summary, revisionSummary].map(row => ({ id: row.id, expectedUpdatedAt: row.updatedAt })) });
    const extraSummary = findLabel(rootElement.querySelector(".director-more-filters"), "Суть поручения").querySelector("input");
    await React.act(async () => setInputValue(extraSummary, "Уточнить"));
    await React.act(async () => printRegister().click());
    assert.deepEqual(pdfRequests.at(-1).entries.map(row => row.id), ["assignment-3"]);
    await React.act(async () => setInputValue(extraSummary, "Нет совпадений"));
    assert.equal(printRegister().disabled, true);
    await React.act(async () => setInputValue(extraSummary, ""));
    failPdf = true;
    await React.act(async () => printRegister().click());
    assert.match(rootElement.querySelector('[role="alert"]').textContent, /Обновите список/u);
    assert.equal(printRegister().disabled, false);
    failPdf = false;
    assert.match(
      rootElement.querySelector(".board-assignment-executor-overview")
        .textContent,
      /2сейчас/u,
    );
    assert.match(
      rootElement.querySelector(".board-assignment-status-filter summary")
        .textContent,
      /Просрочено, На доработке/u,
    );
    await React.act(async () => {
      setInputValue(rootElement.querySelector(".board-assignment-search input"), "ана");
    });
    assert.equal(listSearchParams.get("query"), "ана");
    await React.act(async () => {
      setInputValue(rootElement.querySelector(".board-assignment-search input"), "анализ");
    });
    assert.equal(listSearchParams.get("query"), "анализ");
    assert.equal(pendingSearch.signal.aborted, true);
    await React.act(async () => {
      pendingSearch.resolve(jsonResponse({ assignments: [], permissions }));
    });
    assert.equal(rootElement.querySelectorAll(".board-assignment-table tbody tr").length, 2);
    await React.act(async () => {
      Array.from(rootElement.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Сбросить",
      ).click();
    });
    assert.equal(statusInputs.every((input) => !input.checked), true);
    assert.equal(listSearchParams.has("status"), false);
    assert.equal(listSearchParams.has("query"), false);
    assert.equal(rootElement.querySelectorAll(".board-assignment-table tbody tr").length, 3);

    await React.act(async () => {
      Array.from(rootElement.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Открыть и отчитаться",
      ).click();
    });
    await waitFor(React, () =>
      rootElement.querySelector(".board-assignment-comments pre") !== null
    );

    await React.act(async () => Array.from(rootElement.querySelectorAll("button")).find(button => button.textContent === "Скачать поручение в PDF").click());
    assert.deepEqual(pdfRequests.at(-1), { mode: "assignment", source: "current", entries: [{ id: summary.id, expectedUpdatedAt: summary.updatedAt }] });

    const comments = rootElement.querySelector(
      ".board-assignment-comments pre",
    )?.textContent ?? "";
    assert.match(
      comments,
      /\d{2}\.\d{2}\.\d{4}.*Фридман Е\.М\.\nКомментарий один\.\n\n\d{2}\.\d{2}\.\d{4}.*Лариков А\.Т\.\nКомментарий два\./u,
    );
    assert.equal(findLabel(rootElement, "Комментарий") !== undefined, true);
    assert.equal(findLabel(rootElement.querySelector('[role="dialog"]'), "Статус"), undefined);
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
      rootElement.querySelector('[role="dialog"]'),
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
    isOverdue: false,
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
    isOverdue: true,
    status: "in_progress",
    createdByDisplayName: "Белов Ю.И.",
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-28T08:00:00.000Z",
  };

  try {
    const { BoardAssignmentsWorkspace } = await vite.ssrLoadModule(
      "/src/BoardAssignments.tsx",
    );
    const requestedFilters = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (url.pathname === "/api/board-assignments") {
        requestedFilters.push(url.searchParams);
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
    await React.act(async () => {
      setInputValue(findLabel(rootElement, "Заседание с").querySelector("input"), "2026-07-01");
    });
    assert.equal(requestedFilters.at(-1).get("meetingDateFrom"), "2026-07-01");
    await React.act(async () => {
      setInputValue(findLabel(rootElement, "Заседание по").querySelector("input"), "2026-07-31");
    });
    assert.equal(requestedFilters.at(-1).get("meetingDateFrom"), "2026-07-01");
    assert.equal(requestedFilters.at(-1).get("meetingDateTo"), "2026-07-31");
    assert.notEqual(
      rootElement.querySelector(".board-assignment-status-filter"),
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
    isOverdue: false,
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
  const pdfRequests = [];
  dom.window.HTMLAnchorElement.prototype.click = function () {};

  try {
    const { BoardAssignmentsWorkspace } = await vite.ssrLoadModule(
      "/src/BoardAssignments.tsx",
    );
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      if (url.pathname === "/api/board-assignments/export.pdf") { pdfRequests.push(JSON.parse(init.body)); return new Response("%PDF-example", { headers: { "Content-Type": "application/pdf" } }); }
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
    await React.act(async () => rootElement.querySelector(".director-columns-toggle input").click());
    assert.match(
      rootElement.querySelector(".board-assignment-history-table")
        ?.textContent ?? "",
      /Состояние первого выполненного периода.*10\.07\.2026.*Лариков А\.Т\./su,
    );
    const printRegister = () => Array.from(rootElement.querySelectorAll("button")).find(button => button.textContent === "Скачать журнал в PDF");
    const acceptedBy = findLabel(rootElement.querySelector(".director-more-filters"), "Принял").querySelector("input");
    await React.act(async () => setInputValue(acceptedBy, "не найден"));
    assert.equal(printRegister().disabled, true);
    await React.act(async () => Array.from(rootElement.querySelectorAll("button")).find(button => button.textContent === "Сбросить").click());
    await React.act(async () => printRegister().click());
    assert.deepEqual(pdfRequests.at(-1), { mode: "register", source: "history", entries: [{ id: completion.id, expectedUpdatedAt: completedSnapshot.updatedAt }] });
    const historyLink = rootElement.querySelector(
      ".board-assignment-history-table .board-assignment-link",
    );
    await React.act(async () => historyLink.click());
    await waitFor(React, () =>
      rootElement.querySelector('[role="dialog"]')?.textContent
        ?.includes("Исполнение принято.")
    );
    await React.act(async () => Array.from(rootElement.querySelectorAll("button")).find(button => button.textContent === "Скачать поручение в PDF").click());
    assert.deepEqual(pdfRequests.at(-1), { mode: "assignment", source: "history", entries: [{ id: completion.id, expectedUpdatedAt: completedSnapshot.updatedAt }] });
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
