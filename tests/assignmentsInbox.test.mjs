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

const boardSummary = {
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

function directorAssignment(overrides) {
  return {
    id: "gd-1", number: "ГД-1", revision: 3, kind: "Поручение", summary: "Подготовить отчёт", assignedOn: "2026-09-01",
    department: "", project: "", urgency: "", importance: "", progress: "", completedOn: "", note: "", incomingNumber: "", postponedUntil: "",
    responsibleId: "account:me", responsible: { id: "account:me", fullName: "Исполнитель" }, coExecutorIds: [], coExecutors: [],
    recurrence: "once", activeFrom: "2026-09-20", activeTo: "2026-09-20", currentOccurrenceDate: "2026-09-20",
    status: "in_progress", needsClarification: false, comments: [], documents: [], source: null, sourceBoardAssignmentId: null,
    ...overrides,
  };
}

function profileWith(capabilities) {
  return {
    userId: "me", displayName: "Исполнитель", accountType: "worker", receivedAt: "2026-09-15T00:00:00Z",
    activeAccess: { accountId: "me", accountType: "worker", position: "worker", positionDisplayName: "Сотрудник", displayName: "Исполнитель",
      scope: { kind: "organization" }, issuedAt: "2026-09-15T00:00:00Z", navigationItems: ["business.assignments"], capabilities },
  };
}

test("«Поручения» board source: the executor filters active rows, prints and submits from the board card", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://127.0.0.1:5173/" });
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const activeSummary = { ...boardSummary, id: "assignment-2", summary: "Подготовить план корректирующих мероприятий", isOverdue: false };
  const revisionSummary = { ...boardSummary, id: "assignment-3", summary: "Уточнить причины отклонения", isOverdue: false, status: "revision_requested" };
  const permissions = { canView: true, canCreate: false, canExecute: true, canReview: false };
  let actionRequest;
  let listRequests = 0;
  const pdfRequests = [];
  let failPdf = false;
  dom.window.HTMLAnchorElement.prototype.click = function () {};

  try {
    const { AssignmentsInboxWorkspace } = await vite.ssrLoadModule("/src/AssignmentsInbox.tsx");
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (url.pathname === "/api/board-assignments/export.pdf") {
        pdfRequests.push(JSON.parse(init.body));
        return failPdf ? new Response(JSON.stringify({ error: { message: "Обновите список перед выгрузкой." } }), { status: 409 }) : new Response("%PDF-example", { headers: { "Content-Type": "application/pdf" } });
      }
      if (url.pathname === "/api/board-assignments") {
        listRequests += 1;
        return jsonResponse({
          assignments: [boardSummary, activeSummary, revisionSummary],
          permissions,
          boardMeetingReminder: "Необходимо подготовиться к Совету директоров на 15 число",
        });
      }
      if (url.pathname === "/api/board-assignments/assignment-1/action" && init?.method === "POST") {
        actionRequest = JSON.parse(String(init.body));
        return jsonResponse({ assignment: { ...boardSummary, status: "under_review", details: "Представить анализ.", comments: [] }, permissions });
      }
      if (url.pathname === "/api/board-assignments/assignment-1") {
        return jsonResponse({
          assignment: {
            ...boardSummary,
            details: "Представить Совету директоров письменный анализ.",
            comments: [{ id: "comment-1", authorDisplayName: "Фридман Е.М.", comment: "Комментарий один.", statusAfter: "in_progress", createdAt: "2026-07-20T10:00:00.000Z" }],
          },
          permissions,
        });
      }
      if (url.pathname === "/api/board-assignments/assignment-1/delegations") {
        return jsonResponse({ assignments: [], canAssign: false, employees: [], today: "2026-09-15" });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    await React.act(async () => {
      root.render(React.createElement(AssignmentsInboxWorkspace, {
        profile: profileWith(["business.view_board_assignments", "business.execute_board_assignments"]),
        onShowToast() {},
      }));
    });
    await waitFor(React, () => rootElement.querySelector("tbody tr") !== null);
    // Only the board registry is requested; no director or collegium access is implied.
    assert.equal(listRequests, 1);
    assert.equal(rootElement.querySelector(".board-assignment-meeting-reminder")?.textContent, "НапоминаниеНеобходимо подготовиться к Совету директоров на 15 число");
    // A single source needs no registry filter.
    assert.equal(findFilter(rootElement, "Реестр"), undefined);
    const rows = () => Array.from(rootElement.querySelectorAll("tbody tr"));
    assert.equal(rows().length, 3);
    assert.equal(rows().filter(row => row.classList.contains("director-assignment-overdue")).length, 1);
    assert.match(rows()[0].textContent, /Совет директоров.*Протокол №369, п\. 2\.3.*10\.07\.2026.*01\.08\.2026.*Просрочено/u);

    await React.act(async () => {
      checkOption(findFilter(rootElement, "Статус"), "Просрочено");
      checkOption(findFilter(rootElement, "Статус"), "На доработке");
    });
    assert.deepEqual(rows().map(row => row.querySelector(".table-text-action").textContent), [boardSummary.summary, revisionSummary.summary]);
    const printRegister = () => Array.from(rootElement.querySelectorAll("button")).find(button => button.textContent === "Скачать журнал в PDF");
    await React.act(async () => printRegister().click());
    assert.deepEqual(pdfRequests.at(-1), { mode: "register", source: "current", entries: [boardSummary, revisionSummary].map(row => ({ id: row.id, expectedUpdatedAt: row.updatedAt })) });
    failPdf = true;
    await React.act(async () => printRegister().click());
    assert.match(rootElement.querySelector('[role="alert"]').textContent, /Обновите список/u);
    failPdf = false;
    await React.act(async () => setInputValue(rootElement.querySelector('input[type="search"]'), "уточнить"));
    assert.equal(rows().length, 1);
    await React.act(async () => buttonByText(rootElement, "Сбросить").click());
    assert.equal(rows().length, 3);

    await React.act(async () => rows()[0].querySelector(".table-text-action").click());
    await waitFor(React, () => rootElement.querySelector(".board-assignment-comments pre") !== null);
    await React.act(async () => buttonByText(rootElement, "Скачать поручение в PDF").click());
    assert.deepEqual(pdfRequests.at(-1), { mode: "assignment", source: "current", entries: [{ id: boardSummary.id, expectedUpdatedAt: boardSummary.updatedAt }] });
    // «Поручения» only executes: no editing, accepting or returning from here.
    assert.equal(buttonByText(rootElement, "Редактировать"), undefined);
    assert.equal(buttonByText(rootElement, "Принять исполнение"), undefined);
    const backdrop = rootElement.querySelector(".admin-db-modal-backdrop");
    await React.act(async () => rootElement.querySelector('[role="dialog"]').dispatchEvent(new globalThis.MouseEvent("mousedown", { bubbles: true })));
    assert.notEqual(rootElement.querySelector('[role="dialog"]'), null);
    await React.act(async () => backdrop.dispatchEvent(new globalThis.MouseEvent("mousedown", { bubbles: true })));
    assert.equal(rootElement.querySelector('[role="dialog"]'), null);

    await React.act(async () => rows()[0].querySelector(".table-text-action").click());
    await waitFor(React, () => rootElement.querySelector(".board-assignment-comments pre") !== null);
    const comment = findLabel(rootElement, "Комментарий")?.querySelector("textarea");
    assert.ok(comment);
    await React.act(async () => setTextAreaValue(comment, "Работа выполнена, материалы приложены."));
    await React.act(async () => buttonByText(rootElement, "Отправить на проверку").click());
    await waitFor(React, () => rootElement.querySelector('[role="dialog"]') === null);
    assert.deepEqual(actionRequest, { action: "submit_for_review", comment: "Работа выполнена, материалы приложены." });
    await waitFor(React, () => listRequests === 2);

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("«Поручения» merges own assignments of every source, filters them together and submits a director result", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://127.0.0.1:5173/" });
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const toasts = [];
  const own = directorAssignment({});
  const foreign = directorAssignment({ id: "gd-2", number: "ГД-2", summary: "Чужое поручение" });
  const future = directorAssignment({ id: "gd-3", number: "ГД-3", summary: "Будущее поручение", currentOccurrenceDate: "2026-10-05", activeFrom: "2026-10-05", activeTo: "2026-10-05" });
  const collegium = directorAssignment({ id: "k-1", number: "К-1", summary: "Справка для Коллегии", currentOccurrenceDate: "2026-09-10", status: "revision_requested", needsClarification: true });
  const pdfRequests = [];
  let submitted;
  let failAction = true;
  let directorRequests = 0;
  dom.window.HTMLAnchorElement.prototype.click = function () {};

  try {
    const { AssignmentsInboxWorkspace } = await vite.ssrLoadModule("/src/AssignmentsInbox.tsx");
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (url.pathname === "/api/director-assignments") {
        directorRequests += 1;
        // A controller receives the whole register; «Поручения» keeps only own rows.
        return jsonResponse({ assignments: [own, foreign, future], ownAssignmentIds: ["gd-1", "gd-3"], executableAssignmentIds: failAction || !submitted ? ["gd-1"] : [], employees: [],
          permissions: { canView: true, canManage: true, canExecute: true, canManagePersonnel: false }, today: "2026-09-15" });
      }
      if (url.pathname === "/api/collegium-assignments") {
        return jsonResponse({ assignments: [collegium], executableAssignmentIds: [], employees: [], permissions: { canView: true, canManage: false, canExecute: true, canManagePersonnel: false }, today: "2026-09-15" });
      }
      if (url.pathname === "/api/board-assignments") return jsonResponse({ error: { message: "Сервис недоступен." } }, 503);
      if (url.pathname === "/api/director-assignments/export.pdf" || url.pathname === "/api/collegium-assignments/export.pdf") {
        pdfRequests.push({ path: url.pathname, body: JSON.parse(init.body) });
        return new Response("%PDF-example", { headers: { "Content-Type": "application/pdf" } });
      }
      if (url.pathname === "/api/director-assignments/gd-1/action") {
        submitted = JSON.parse(init.body);
        if (failAction) return jsonResponse({ error: { message: "Поручение уже изменено. Обновите список." } }, 409);
        own.status = "under_review";
        return jsonResponse(own);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    await React.act(async () => {
      root.render(React.createElement(AssignmentsInboxWorkspace, {
        profile: profileWith([
          "business.view_director_assignments", "business.manage_director_assignments", "business.execute_director_assignments",
          "business.view_collegium_assignments", "business.execute_collegium_assignments",
          "business.view_board_assignments", "business.execute_board_assignments",
        ]),
        onShowToast: (...args) => toasts.push(args),
      }));
    });
    await waitFor(React, () => rootElement.querySelectorAll("tbody tr").length === 3);
    const numbers = () => Array.from(rootElement.querySelectorAll("tbody tr"), row => row.querySelectorAll("td")[1].textContent);
    // Earliest deadline first; the foreign row of the controller's register is hidden.
    assert.deepEqual(numbers(), ["К-1", "ГД-1", "ГД-3"]);
    assert.match(rootElement.querySelector('[role="alert"]').textContent, /Совет директоров: Сервис недоступен/u);
    // Overdue replaces the working status, as in the board register.
    assert.match(rootElement.querySelector("tbody tr").textContent, /Коллегия.*Просрочено · Требует уточнения/u);
    assert.equal(rootElement.querySelector("tbody tr").classList.contains("director-assignment-overdue"), true);

    const printRegister = () => buttonByText(rootElement, "Скачать журнал в PDF");
    // One journal per registry: mixed rows cannot be printed together.
    assert.equal(printRegister().disabled, true);
    await React.act(async () => checkOption(findFilter(rootElement, "Реестр"), "Генеральный директор"));
    assert.deepEqual(numbers(), ["ГД-1", "ГД-3"]);
    assert.equal(printRegister().disabled, false);
    await React.act(async () => printRegister().click());
    assert.deepEqual(pdfRequests.at(-1), { path: "/api/director-assignments/export.pdf", body: { mode: "register", source: "current", entries: [{ id: "gd-1", revision: 3 }, { id: "gd-3", revision: 3 }] } });
    await React.act(async () => setInputValue(findDateInput(rootElement, "Срок по"), "2026-09-30"));
    assert.deepEqual(numbers(), ["ГД-1"]);
    await React.act(async () => buttonByText(rootElement, "Сбросить").click());
    await React.act(async () => checkOption(findFilter(rootElement, "Статус"), "Требует уточнения"));
    assert.deepEqual(numbers(), ["К-1"]);
    await React.act(async () => buttonByText(rootElement, "Сбросить").click());

    // A future assignment is visible but not executable yet.
    await React.act(async () => Array.from(rootElement.querySelectorAll(".table-text-action")).find(button => button.textContent === "Будущее поручение").click());
    assert.match(rootElement.querySelector(".director-assignment-detail").textContent, /Исполнение откроется с даты постановки/u);
    assert.equal(buttonByText(rootElement, "Отправить на проверку"), undefined);

    await React.act(async () => Array.from(rootElement.querySelectorAll(".table-text-action")).find(button => button.textContent === "Подготовить отчёт").click());
    const detail = rootElement.querySelector(".director-assignment-detail");
    assert.match(detail.textContent, /Поручения генерального директора/u);
    assert.equal(buttonByText(rootElement, "Принять исполнение"), undefined);
    assert.equal(buttonByText(rootElement, "Редактировать"), undefined);
    const submit = buttonByText(rootElement, "Отправить на проверку");
    assert.equal(submit.disabled, true);
    await React.act(async () => setTextAreaValue(detail.querySelector("textarea"), "Отчёт готов"));
    await React.act(async () => submit.click());
    assert.deepEqual(submitted, { action: "submit_for_review", comment: "Отчёт готов", revision: 3 });
    assert.match(detail.textContent, /уже изменено/u);
    assert.equal(toasts.length, 0);
    failAction = false;
    const requestsBefore = directorRequests;
    await React.act(async () => buttonByText(rootElement, "Отправить на проверку").click());
    await waitFor(React, () => rootElement.querySelector(".director-assignment-detail") === null);
    assert.equal(toasts.at(-1)[2], "success");
    await waitFor(React, () => directorRequests > requestsBefore);
    await waitFor(React, () => /На проверке/u.test(rootElement.querySelector("tbody").textContent));

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

function findFilter(root, label) {
  return Array.from(root.querySelectorAll(".board-assignment-status-filter"))
    .find(filter => filter.querySelector(".board-assignment-status-filter-label")?.textContent === label);
}

function checkOption(filter, label) {
  Array.from(filter.querySelectorAll("label")).find(item => item.textContent.trim() === label).querySelector("input").click();
}

function findDateInput(root, label) {
  return Array.from(root.querySelectorAll("label")).find(item => item.textContent.startsWith(label))?.querySelector('input[type="date"]');
}

function buttonByText(root, text) {
  return Array.from(root.querySelectorAll("button")).find(button => button.textContent?.trim() === text);
}

function findLabel(root, text) {
  return Array.from(root.querySelectorAll("label")).find(
    (label) => label.querySelector("span")?.textContent?.trim() === text,
  );
}

function setInputValue(input, value) {
  Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, "value").set.call(input, value);
  input.dispatchEvent(new globalThis.Event("input", { bubbles: true }));
}

function setTextAreaValue(textarea, value) {
  Object.getOwnPropertyDescriptor(globalThis.HTMLTextAreaElement.prototype, "value").set.call(textarea, value);
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
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function captureDomGlobals() {
  return new Map(DOM_GLOBAL_NAMES.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
}

function installDomGlobals(window) {
  for (const name of DOM_GLOBAL_NAMES) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : window[name] });
  }
}

function restoreDomGlobals(previous) {
  for (const [name, descriptor] of previous) {
    if (descriptor === undefined) delete globalThis[name];
    else Object.defineProperty(globalThis, name, descriptor);
  }
}

test("«Поручения → Просмотр» opens own assignments and every register the profile controls", async () => {
  const { readAssignmentsSections } = await vite.ssrLoadModule("/src/AssignmentsInbox.tsx");
  const sections = (...capabilities) => readAssignmentsSections({ activeAccess: { capabilities } });
  assert.deepEqual(sections(), []);
  assert.deepEqual(sections("business.view_director_assignments", "business.execute_director_assignments"), ["mine"]);
  assert.deepEqual(sections("business.view_director_assignments", "business.manage_director_assignments"), ["director"]);
  assert.deepEqual(sections("business.view_collegium_assignments", "business.manage_collegium_assignments", "business.execute_collegium_assignments"), ["mine", "collegium"]);
  // Board execution alone narrows the register to what «Поручения мне» lists.
  assert.deepEqual(sections("business.view_board_assignments", "business.execute_board_assignments"), ["mine"]);
  assert.deepEqual(sections("business.view_board_assignments"), ["board"]);
  assert.deepEqual(sections("business.view_board_assignments", "business.execute_board_assignments", "business.review_board_assignments"), ["mine", "board"]);
});

test("«Поручения → Создание» lists only the registries the profile may send to", async () => {
  const { readAssignmentCreateSections } = await vite.ssrLoadModule("/src/AssignmentsInbox.tsx");
  const sections = (...capabilities) => readAssignmentCreateSections({ activeAccess: { capabilities } });
  assert.deepEqual(sections(), []);
  // Receiving and viewing alone never open creation.
  assert.deepEqual(sections("business.view_director_assignments", "business.execute_director_assignments", "business.view_board_assignments", "business.execute_board_assignments"), []);
  assert.deepEqual(sections("business.view_board_assignments"), []);
  assert.deepEqual(sections("business.view_board_assignments", "business.create_board_assignments"), ["board"]);
  assert.deepEqual(sections("business.view_board_assignments", "business.create_board_assignments", "business.review_board_assignments",
    "business.view_collegium_assignments", "business.manage_collegium_assignments",
    "business.view_director_assignments", "business.manage_director_assignments"), ["director", "collegium", "board"]);
});

test("«Поручения» shows «Создание» next to «Просмотр» only to senders and returns to «Просмотр» from the Overview", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://127.0.0.1:5173/" });
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://127.0.0.1:5173/");
    requests.push(url.pathname);
    if (url.pathname === "/api/director-assignments") {
      return jsonResponse({ assignments: [directorAssignment({ responsibleId: "account:other", responsible: { id: "account:other", fullName: "Сотрудник" } })], ownAssignmentIds: [], executableAssignmentIds: [], employees: [],
        permissions: { canView: true, canManage: true, canExecute: false, canManagePersonnel: false }, today: "2026-09-15" });
    }
    if (url.pathname === "/api/collegium-assignments") {
      return jsonResponse({ assignments: [], executableAssignmentIds: [], employees: [], permissions: { canView: true, canManage: false, canExecute: true, canManagePersonnel: false }, today: "2026-09-15" });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const rootElement = dom.window.document.getElementById("root");
  const root = createRoot(rootElement);
  const tabs = (label) => Array.from(rootElement.querySelectorAll(`[role="tablist"][aria-label="${label}"] [role="tab"]`), tab => `${tab.getAttribute("aria-selected") === "true" ? "*" : ""}${tab.textContent}`);

  try {
    const { AssignmentsSection } = await vite.ssrLoadModule("/src/AssignmentsInbox.tsx");
    const sender = profileWith(["business.view_director_assignments", "business.manage_director_assignments",
      "business.view_collegium_assignments", "business.execute_collegium_assignments"]);
    const render = (props) => React.act(async () => root.render(React.createElement(AssignmentsSection, { profile: sender, onShowToast() {}, ...props })));
    await render({});
    assert.deepEqual(tabs("Поручения"), ["*Просмотр", "Создание"]);
    assert.deepEqual(tabs("Просмотр поручений"), ["*Поручения мне", "Поручения генерального директора"]);
    await waitFor(React, () => /Поручения мне/u.test(rootElement.querySelector(".director-assignment-heading")?.textContent ?? ""));

    await React.act(async () => buttonByText(rootElement, "Создание").click());
    await waitFor(React, () => rootElement.querySelector(".board-assignment-create-overview") !== null);
    assert.deepEqual(tabs("Поручения"), ["Просмотр", "*Создание"]);
    // One registry to send to: no sub-tab row, the creation register opens directly.
    assert.deepEqual(tabs("Создание поручений"), []);
    assert.match(rootElement.querySelector(".director-assignment-heading").textContent, /Создание поручений.*Поручения генерального директора/su);
    assert.ok(buttonByText(rootElement, "Добавить поручение"));
    assert.equal(requests.at(-1), "/api/director-assignments");

    // An Overview tile asks for a register: the section switches back to «Просмотр».
    await render({ requestedSection: "director" });
    assert.deepEqual(tabs("Поручения"), ["*Просмотр", "Создание"]);
    assert.deepEqual(tabs("Просмотр поручений"), ["Поручения мне", "*Поручения генерального директора"]);
    await waitFor(React, () => /Контроль исполнения/u.test(rootElement.querySelector(".director-assignment-heading")?.textContent ?? ""));

    // A pure executor views everything but never sees «Создание».
    await React.act(async () => root.render(React.createElement(AssignmentsSection, {
      profile: profileWith(["business.view_collegium_assignments", "business.execute_collegium_assignments"]), onShowToast() {},
    })));
    assert.deepEqual(tabs("Поручения"), []);
    assert.equal(Array.from(rootElement.querySelectorAll("button")).some(button => button.textContent === "Создание"), false);
    await waitFor(React, () => /Поручения мне/u.test(rootElement.querySelector(".director-assignment-heading")?.textContent ?? ""));
    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});
