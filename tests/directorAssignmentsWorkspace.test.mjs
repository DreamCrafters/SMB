import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
test.after(() => vite.close());
const globalNames = ["window", "document", "navigator", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Event", "Node", "IS_REACT_ACT_ENVIRONMENT"];

for (const mode of ["send", "send-linked", "send-unlinked", "both"]) {
  test(`director workspace ${mode} uses server permissions and offers the appropriate workflow`, async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1:5173/" });
    const descriptors = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const oldFetch = globalThis.fetch;
    for (const name of globalNames) Object.defineProperty(globalThis, name, { value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name], configurable: true, writable: true });
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const rootElement = document.getElementById("root");
    const root = createRoot(rootElement);
    let submitted;
    const exports = [];
    let failExport = false;
    let delayHistory = false;
    let releaseHistory;
    const downloads = [];
    const scrolled = [];
    dom.window.HTMLElement.prototype.scrollIntoView = function (options) { scrolled.push({ element: this, options }); };
    dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
    const employees = [{ id: "account:employee-1", userId: "employee-1", fullName: "Сотрудник первый", position: "Инженер", active: true }, { id: "account:employee-2", fullName: "Сотрудник второй", position: "Экономист", active: true }];
    const oldAssignment = { id: "old-assignment", number: "ГД-1", revision: 1, assignedOn: "2026-09-15", kind: "Поручение", summary: "Ранее назначенная задача", department: "", project: "", responsibleId: "person-linked", responsible: { ...employees[0], id: "person-linked" }, coExecutorIds: mode === "send-unlinked" ? ["person-unlinked"] : [], coExecutors: mode === "send-unlinked" ? [{ id: "person-unlinked", fullName: "Прежний сотрудник", userId: null }] : [], recurrence: "once", activeFrom: "2026-09-16", activeTo: "2026-09-16", currentOccurrenceDate: "2026-09-16", urgency: "", importance: "", progress: "", note: "", incomingNumber: "", completedOn: "", status: "in_progress", comments: [], documents: [], source: null, sourceBoardAssignmentId: null, postponedUntil: "" };
    globalThis.fetch = async (url, options = {}) => {
      const path = new URL(String(url), "http://127.0.0.1:5173").pathname;
      if (path === "/api/director-assignments/export.pdf") {
        exports.push(JSON.parse(options.body));
        return failExport ? new Response(JSON.stringify({ error: { message: "Обновите список перед выгрузкой." } }), { status: 409 }) : new Response("%PDF-example", { headers: { "Content-Type": "application/pdf" } });
      }
      if (path === "/api/director-assignments/completions") {
        if (delayHistory) await new Promise(resolve => { releaseHistory = resolve; });
        return new Response(JSON.stringify({ completions: [
        { id: "completion-old", assignment: { ...oldAssignment, summary: "Снимок первого периода", revision: 2, status: "completed" } },
        { id: "completion-new", assignment: { ...oldAssignment, summary: "Снимок второго периода", revision: 5, status: "completed" } },
      ] }));
      }
      assert.ok(["/api/director-assignments", "/api/director-assignments/old-assignment"].includes(new URL(String(url), "http://127.0.0.1:5173").pathname));
      if (options.method === "POST" || options.method === "PATCH") submitted = JSON.parse(options.body);
      return new Response(JSON.stringify({ assignments: mode === "both" ? [oldAssignment, { ...oldAssignment, id: "foreign", number: "ГД-2" }, { ...oldAssignment, id: "own-future", number: "ГД-3" }] : mode === "send-linked" ? [oldAssignment, { ...oldAssignment, id: "review", number: "ГД-2", status: "under_review" }, { ...oldAssignment, id: "clarify", number: "ГД-3", status: "in_progress", needsClarification: true }] : (mode.startsWith("send-") || mode === "receive") ? [oldAssignment] : [], ownAssignmentIds: mode === "both" ? ["old-assignment", "own-future"] : [], executableAssignmentIds: [], responsibleAccountLinks: { "old-assignment": "linked", review: "unlinked", clarify: "unavailable" }, employees: mode !== "receive" ? employees : [], permissions: { canView: true, canManage: mode !== "receive", canExecute: mode === "receive" || mode === "both", canManagePersonnel: false }, today: "2026-09-15" }), { headers: { "Content-Type": "application/json" } });
    };
    try {
      const { DirectorAssignmentsWorkspace } = await vite.ssrLoadModule("/src/DirectorAssignments.tsx");
      // «Поручения → Создание» only creates; the register is controlled in «Просмотр».
      const workspaceMode = mode === "send" ? "create" : "control";
      await React.act(async () => root.render(React.createElement(DirectorAssignmentsWorkspace, { mode: workspaceMode, onShowToast() {} })));
      assert.match(rootElement.textContent, workspaceMode === "create" ? /Создание поручений/u : /Контроль исполнения/u);
      assert.doesNotMatch(rootElement.textContent, /Получение и выполнение/u);
      assert.equal([...rootElement.querySelectorAll("button")].some(button => button.textContent === "Создать поручение"), false);
      if (workspaceMode === "create") {
        // Same layout as the board creation tab: the create button above the register with statuses.
        assert.ok(rootElement.querySelector(".board-assignment-create-overview"));
        assert.ok(rootElement.querySelector(".director-register"));
        assert.equal(rootElement.querySelector("form"), null);
        await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Добавить поручение").click());
      }
      if (mode === "both") {
        // Own assignments are executed in «Поручения мне»: the registry sub-tab shows the whole register only.
        const numbers = () => [...rootElement.querySelectorAll("tbody tr")].map(row => row.querySelector("td").textContent);
        assert.equal(rootElement.querySelector(".director-assignment-view-switch"), null);
        assert.deepEqual(numbers(), ["ГД-1", "ГД-2", "ГД-3"]);
        assert.match(rootElement.querySelector(".director-register-heading").textContent, /Отправленные поручения/u);
        assert.equal(rootElement.querySelector("form"), null);
        await React.act(async () => rootElement.querySelector(".table-text-action").click());
        assert.ok(rootElement.querySelector(".director-assignment-detail"));
        assert.equal([...rootElement.querySelectorAll("button")].some(button => button.textContent === "Отправить на проверку"), false);
        return;
      }
      if (mode === "send-linked") {
        const visibleNumbers = () => [...rootElement.querySelectorAll("tbody tr")].map(row => row.querySelector("td").textContent);
        const checkbox = label => [...rootElement.querySelectorAll(".board-assignment-status-options input")].find(input => input.value === label);
        assert.deepEqual(visibleNumbers(), ["ГД-1", "ГД-2", "ГД-3"]);
        assert.deepEqual([...rootElement.querySelectorAll("tbody .director-account-link")].map(item => item.textContent), ["Аккаунт привязан", "Не привязан к аккаунту", "Аккаунт недоступен"]);
        await React.act(async () => checkbox("В работе").click());
        assert.deepEqual(visibleNumbers(), ["ГД-1", "ГД-3"]);
        await React.act(async () => checkbox("На проверке").click());
        assert.deepEqual(visibleNumbers(), ["ГД-1", "ГД-2", "ГД-3"]);
        assert.match(rootElement.querySelector(".director-register-heading").textContent, /Найдено: 3/u);
        await React.act(async () => checkbox("В работе").click());
        assert.deepEqual(visibleNumbers(), ["ГД-2"]);
        await React.act(async () => checkbox("Требует уточнения").click());
        assert.deepEqual(visibleNumbers(), ["ГД-2", "ГД-3"]);
        const exportRegister = () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Скачать журнал в PDF");
        await React.act(async () => exportRegister().click());
        assert.deepEqual(exports.at(-1), { mode: "register", source: "current", entries: [{ id: "review", revision: 1 }, { id: "clarify", revision: 1 }] });
        assert.equal(downloads.at(-1), "Журнал поручений.pdf");
        failExport = true;
        await React.act(async () => exportRegister().click());
        assert.match(rootElement.querySelector('[role="alert"]').textContent, /Обновите список/u);
        assert.equal(exportRegister().disabled, false);
        failExport = false;
        await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Сбросить").click());
        assert.deepEqual(visibleNumbers(), ["ГД-1", "ГД-2", "ГД-3"]);
        assert.equal(rootElement.querySelectorAll(".board-assignment-status-options input:checked").length, 0);
        await React.act(async () => rootElement.querySelector(".table-text-action").click());
        await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Скачать поручение в PDF").click());
        assert.deepEqual(exports.at(-1), { mode: "assignment", source: "current", entries: [{ id: "old-assignment", revision: 1 }] });
        delayHistory = true;
        await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "История исполнений").click());
        await React.act(async () => rootElement.querySelector(".table-text-action").click());
        assert.ok(rootElement.querySelector(".director-assignment-detail"));
        await React.act(async () => releaseHistory());
        assert.equal(rootElement.querySelector(".director-assignment-detail"), null);
        delayHistory = false;
        await React.act(async () => exportRegister().click());
        assert.deepEqual(exports.at(-1).entries, [{ id: "completion-old", revision: 2 }, { id: "completion-new", revision: 5 }]);
        await React.act(async () => rootElement.querySelectorAll(".table-text-action")[1].click());
        const detail = rootElement.querySelector(".director-assignment-detail");
        assert.equal(scrolled.at(-1).element, rootElement.querySelector(".director-assignments"));
        assert.equal(scrolled.at(-1).options.block, "start");
        assert.equal(document.activeElement, detail);
        assert.match(detail.textContent, /Снимок второго периода/u);
        const scrollCount = scrolled.length;
        await React.act(async () => rootElement.querySelectorAll(".table-text-action")[1].click());
        assert.equal(scrolled.length, scrollCount + 1, "reopening the same snapshot scrolls again");
        await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Скачать поручение в PDF").click());
        assert.deepEqual(exports.at(-1), { mode: "assignment", source: "history", entries: [{ id: "completion-new", revision: 5 }] });
        await React.act(async () => checkbox("Требует уточнения").click());
        assert.equal(exportRegister().disabled, true);
        await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Сбросить").click());
        await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Текущие поручения").click());
      }
      if (mode.startsWith("send-")) {
        await React.act(async () => rootElement.querySelector(".table-text-action").click());
        const beforeEditScrolls = scrolled.length;
        await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Редактировать").click());
        assert.equal(scrolled.length, beforeEditScrolls + 1);
        assert.equal(scrolled.at(-1).element, rootElement.querySelector(".director-assignments"));
        assert.equal(scrolled.at(-1).options.block, "start");
        assert.equal(document.activeElement, rootElement.querySelector("form"));
        const picker = [...rootElement.querySelectorAll("label")].find(label => label.textContent.startsWith("Ответственный")).querySelector("select");
        assert.equal(picker.value, "account:employee-1");
        if (mode === "send-unlinked") {
          assert.match(rootElement.textContent, /Прежний сотрудник: нет доступного аккаунта/u);
          await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Убрать прежнего соисполнителя").click());
          assert.doesNotMatch(rootElement.textContent, /нет доступного аккаунта/u);
          const editComment = rootElement.querySelector(".director-edit-comment textarea");
          await React.act(async () => {
            Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(editComment, "Обновлены исполнители");
            editComment.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
          });
          await React.act(async () => rootElement.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
          assert.deepEqual(submitted.assignment.coExecutorIds, []);
          assert.equal(submitted.assignment.responsibleId, "account:employee-1");
          return;
        }
        assert.equal(rootElement.querySelectorAll('.co-executor-picker select option:not([value=""])').length, 1);
        return;
      }
      const form = rootElement.querySelector("form");
      assert.ok(form);
      const summary = form.querySelector("textarea");
      const responsible = [...form.querySelectorAll("label")].find(label => label.textContent.startsWith("Ответственный")).querySelector("select");
      assert.equal(responsible.options.length, 3);
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(summary, "Подготовить отчёт");
        summary.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        responsible.value = "account:employee-1";
        responsible.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
      const coExecutor = () => form.querySelector(".co-executor-picker select");
      assert.deepEqual([...coExecutor().options].map(option => option.value), ["", "account:employee-2"], "the responsible is not offered as a co-executor");
      const addCoExecutor = async id => React.act(async () => {
        coExecutor().value = id;
        coExecutor().dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
      await addCoExecutor("account:employee-2");
      assert.match(form.querySelector(".co-executor-picker ul").textContent, /Убрать/u);
      assert.deepEqual([...coExecutor().options].map(option => option.value), [""], "a chosen co-executor leaves the list");
      await React.act(async () => form.querySelector(".co-executor-picker li button").click());
      assert.equal(form.querySelector(".co-executor-picker ul"), null);
      await addCoExecutor("account:employee-2");
      await React.act(async () => form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
      assert.equal(submitted.assignment.responsibleId, "account:employee-1");
      assert.equal(submitted.assignment.summary, "Подготовить отчёт");
      assert.deepEqual(submitted.assignment.coExecutorIds, ["account:employee-2"]);
      assert.equal(submitted.assignment.activeFrom, "2026-09-15");
      assert.equal(submitted.assignment.activeTo, "2026-09-15");
    } finally {
      await React.act(async () => root.unmount());
      globalThis.fetch = oldFetch;
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
      dom.window.close();
    }
  });
}

// Execution lives in «Поручения мне» (tests/assignmentsInbox.test.mjs); the registry sub-tab only decides.
for (const canManage of [true]) {
  test(`review cycle ${canManage ? "controller accepts a submitted result" : "executor submits the result for review"} with a comment and revision`, async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1:5173/" });
    const descriptors = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const oldFetch = globalThis.fetch;
    for (const name of globalNames) Object.defineProperty(globalThis, name, { value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name], configurable: true, writable: true });
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const rootElement = document.getElementById("root");
    const root = createRoot(rootElement);
    const toasts = [];
    let submitted;
    let releaseAction;
    let failAction = true;
    const assignment = { department: "", project: "", urgency: "", importance: "", progress: "", completedOn: "", note: "", incomingNumber: "", postponedUntil: "", id: "test-review", number: "ГД-1", revision: 3, summary: "Задача для проверки", assignedOn: "2026-09-14", responsible: { fullName: "Исполнитель" }, coExecutors: [], currentOccurrenceDate: "2026-09-14", status: canManage ? "under_review" : "in_progress", comments: [], documents: [] };
    const other = { ...assignment, id: "in-work", number: "ГД-2", summary: "Поручение у исполнителя", status: "in_progress" };
    globalThis.fetch = async (url, options = {}) => {
      const path = new URL(String(url), "http://127.0.0.1:5173").pathname;
      if (path === "/api/director-assignments/test-review/action") {
        assert.equal(options.method, "POST");
        submitted = JSON.parse(options.body);
        if (failAction) return new Response(JSON.stringify({ error: { message: "Поручение уже изменено. Обновите список." } }), { status: 409 });
        await new Promise(resolve => { releaseAction = resolve; });
        assignment.status = canManage ? "completed" : "under_review";
        return new Response(JSON.stringify(assignment));
      }
      assert.equal(path, "/api/director-assignments");
      return new Response(JSON.stringify({ assignments: canManage ? [assignment, other] : [assignment], executableAssignmentIds: canManage || assignment.status !== "in_progress" ? [] : [assignment.id], employees: [], permissions: { canView: true, canManage, canExecute: !canManage }, today: "2026-09-15" }));
    };
    const button = label => [...rootElement.querySelectorAll("button")].find(item => item.textContent === label);
    try {
      const { DirectorAssignmentsWorkspace } = await vite.ssrLoadModule("/src/DirectorAssignments.tsx");
      await React.act(async () => root.render(React.createElement(DirectorAssignmentsWorkspace, { onShowToast: (...args) => toasts.push(args) })));
      if (canManage) {
        const queue = rootElement.querySelector(".board-assignment-review-queue");
        assert.ok(queue);
        assert.match(queue.textContent, /Ожидают решения/u);
        assert.doesNotMatch(queue.textContent, /Поручение у исполнителя/u);
        const inWork = [...rootElement.querySelectorAll(".table-text-action")].find(item => item.textContent === "Поручение у исполнителя");
        await React.act(async () => inWork.click());
        // Задача 142: an unsubmitted director assignment offers closing, not the review decision.
        assert.ok(rootElement.querySelector(".board-assignment-decision.is-close"));
        assert.equal(button("Принять исполнение"), undefined);
        assert.equal(button("Вернуть на доработку"), undefined);
        await React.act(async () => button("Проверить исполнение").click());
        assert.equal(rootElement.querySelector(".board-assignment-decision.is-close"), null);
        assert.ok(button("Вернуть на доработку"));
      } else {
        assert.equal(rootElement.querySelector(".board-assignment-review-queue"), null);
        await React.act(async () => rootElement.querySelector(".table-text-action").click());
        assert.ok(button("Сохранить промежуточный результат"));
      }
      assert.equal(button("Завершить"), undefined);
      const label = canManage ? "Принять исполнение" : "Отправить на проверку";
      assert.equal(button(canManage ? "Отправить на проверку" : "Принять исполнение"), undefined);
      assert.equal(button(label).className, "primary-button");
      assert.equal(button(label).disabled, true);
      const comment = rootElement.querySelector(".director-assignment-detail textarea");
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(comment, "Работа выполнена");
        comment.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
      await React.act(async () => button(label).click());
      assert.deepEqual(submitted, { action: canManage ? "complete" : "submit_for_review", comment: "Работа выполнена", revision: 3 });
      assert.match(rootElement.querySelector('[role="alert"]').textContent, /уже изменено/u);
      // A rejected decision is reported next to its buttons, not above the long card.
      assert.ok(rootElement.querySelector('.board-assignment-decision [role="alert"]'));
      assert.equal(comment.value, "Работа выполнена");
      assert.equal(button(label).disabled, false);
      assert.equal(toasts.length, 0);
      failAction = false;
      await React.act(async () => button(label).click());
      assert.equal(button(label).disabled, true);
      await React.act(async () => releaseAction());
      assert.equal(rootElement.querySelector(".director-assignment-detail"), null);
      assert.equal(toasts.at(-1)[2], "success");
      assert.match(rootElement.querySelector("tbody").textContent, canManage ? /Завершено/u : /На проверке/u);
      await React.act(async () => rootElement.querySelector(".table-text-action").click());
      assert.equal(button(label), undefined);
      if (canManage) assert.equal(rootElement.querySelector(".board-assignment-review-queue"), null);
    } finally {
      await React.act(async () => root.unmount());
      globalThis.fetch = oldFetch;
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
      dom.window.close();
    }
  });
}

test("collegium workspace uses its own API, title and protocol fields without a board link", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1:5173/" });
  const descriptors = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const oldFetch = globalThis.fetch;
  for (const name of globalNames) Object.defineProperty(globalThis, name, { value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name], configurable: true, writable: true });
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const rootElement = document.getElementById("root");
  const root = createRoot(rootElement);
  const paths = [];
  let submitted;
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(String(url), "http://127.0.0.1:5173").pathname;
    paths.push(path);
    if (options.method === "POST") submitted = JSON.parse(options.body);
    return new Response(JSON.stringify({ assignments: [], employees: [{ id: "account:employee-1", userId: "employee-1", fullName: "Сотрудник", position: "Инженер", active: true, canReceive: true }, { id: "account:chair", userId: "chair", fullName: "Председатель", position: "Председатель Коллегии", active: true, canReceive: false }], permissions: { canView: true, canManage: true, canExecute: false }, today: "2026-09-15" }));
  };
  try {
    const { DirectorAssignmentsWorkspace } = await vite.ssrLoadModule("/src/DirectorAssignments.tsx");
    await React.act(async () => root.render(React.createElement(DirectorAssignmentsWorkspace, { registryId: "collegium", mode: "create", onShowToast() {} })));
    assert.match(rootElement.querySelector("h2").textContent, /Поручения Коллегии/u);
    await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Добавить поручение").click());
    const form = rootElement.querySelector("form");
    assert.doesNotMatch(form.textContent, /Исходное поручение Совета директоров/u);
    const field = label => [...form.querySelectorAll("label")].find(item => item.textContent.startsWith(label)).querySelector("input, select, textarea");
    assert.deepEqual([...field("Ответственный").options].map(option => option.value), ["", "account:employee-1"]);
    assert.equal(form.querySelectorAll('.co-executor-picker select option:not([value=""])').length, 2, "any active account can still be a co-executor");
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(field("Суть поручения"), "Подготовить справку");
      field("Суть поручения").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(field("Протокол №"), "12");
      field("Протокол №").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      field("Ответственный").value = "account:employee-1";
      field("Ответственный").dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await React.act(async () => form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(submitted.assignment.protocolNumber, "12");
    assert.equal(submitted.assignment.meetingDate, "");
    assert.equal(submitted.assignment.sourceBoardAssignmentId, null);
    assert.ok(paths.length > 0 && paths.every(path => path.startsWith("/api/collegium-assignments")));
  } finally {
    await React.act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    dom.window.close();
  }
});

test("«Создание» lists the director register read-only: decisions and edits stay in «Просмотр»", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1:5173/" });
  const descriptors = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const oldFetch = globalThis.fetch;
  for (const name of globalNames) Object.defineProperty(globalThis, name, { value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name], configurable: true, writable: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const rootElement = document.getElementById("root");
  const root = createRoot(rootElement);
  const assignment = { id: "review", number: "ГД-7", revision: 1, assignedOn: "2026-09-10", kind: "Поручение", summary: "Отчёт на проверке", department: "", project: "", responsibleId: "account:employee-1", responsible: { fullName: "Сотрудник" }, coExecutorIds: [], coExecutors: [], recurrence: "once", activeFrom: "2026-09-10", activeTo: "2026-09-10", currentOccurrenceDate: "2026-09-10", urgency: "", importance: "", progress: "", note: "", incomingNumber: "", completedOn: "", status: "under_review", comments: [], documents: [], source: null, sourceBoardAssignmentId: null, postponedUntil: "" };
  globalThis.fetch = async () => new Response(JSON.stringify({ assignments: [assignment], employees: [], permissions: { canView: true, canManage: true, canExecute: false }, today: "2026-09-15" }));
  try {
    const { DirectorAssignmentsWorkspace } = await vite.ssrLoadModule("/src/DirectorAssignments.tsx");
    await React.act(async () => root.render(React.createElement(DirectorAssignmentsWorkspace, { mode: "create", onShowToast() {} })));
    assert.equal(rootElement.querySelector(".board-assignment-review-queue"), null);
    assert.match(rootElement.querySelector("tbody").textContent, /На проверке/u);
    await React.act(async () => rootElement.querySelector(".table-text-action").click());
    const buttons = [...rootElement.querySelectorAll("button")].map(button => button.textContent);
    assert.ok(rootElement.querySelector(".director-assignment-detail"));
    for (const action of ["Принять исполнение", "Вернуть на доработку", "Редактировать"]) assert.equal(buttons.includes(action), false, action);
    assert.equal(rootElement.querySelector('.director-assignment-documents input[type="file"]'), null);
  } finally {
    await React.act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    dom.window.close();
  }
});

test("a controller responsible for a submitted assignment sees no decision on it: another controller accepts it", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1:5173/" });
  const descriptors = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const oldFetch = globalThis.fetch;
  for (const name of globalNames) Object.defineProperty(globalThis, name, { value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name], configurable: true, writable: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const rootElement = document.getElementById("root");
  const root = createRoot(rootElement);
  const base = { revision: 4, assignedOn: "2026-10-05", kind: "Поручение", department: "", project: "", coExecutorIds: [], coExecutors: [], recurrence: "once", activeFrom: "2026-10-05", activeTo: "2026-10-05", currentOccurrenceDate: "2026-10-05", urgency: "", importance: "", progress: "", note: "", incomingNumber: "", completedOn: "", status: "under_review", comments: [], documents: [], source: null, sourceBoardAssignmentId: null, postponedUntil: "" };
  const own = { ...base, id: "own", number: "К-11", summary: "Своё поручение на проверке", responsibleId: "account:me", responsible: { fullName: "Руководитель" } };
  const foreign = { ...base, id: "foreign", number: "К-7", summary: "Чужое поручение на проверке", responsibleId: "account:other", responsible: { fullName: "Исполнитель" } };
  const actions = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(String(url), "http://127.0.0.1:5173").pathname;
    if (path.endsWith("/action")) {
      actions.push(path);
      return new Response(JSON.stringify({ error: { message: "Поручение уже изменено. Обновите список." } }), { status: 409 });
    }
    assert.equal(path, "/api/collegium-assignments");
    return new Response(JSON.stringify({ assignments: [own, foreign], ownAssignmentIds: ["own"], executableAssignmentIds: ["own"], employees: [], permissions: { canView: true, canManage: true, canExecute: true }, today: "2026-10-15" }));
  };
  const button = label => [...rootElement.querySelectorAll("button")].find(item => item.textContent === label);
  try {
    const { DirectorAssignmentsWorkspace } = await vite.ssrLoadModule("/src/DirectorAssignments.tsx");
    await React.act(async () => root.render(React.createElement(DirectorAssignmentsWorkspace, { registryId: "collegium", onShowToast() {} })));
    const queue = rootElement.querySelector(".board-assignment-review-queue");
    assert.match(queue.textContent, /Чужое поручение/u);
    assert.doesNotMatch(queue.textContent, /Своё поручение/u);
    await React.act(async () => [...rootElement.querySelectorAll(".table-text-action")].find(item => item.textContent === own.summary).click());
    const detail = rootElement.querySelector(".director-assignment-detail");
    assert.equal(rootElement.querySelector(".board-assignment-decision"), null);
    assert.equal(button("Принять исполнение"), undefined);
    assert.match(detail.textContent, /Это ваше поручение\. Принять исполнение или вернуть его на доработку может другой руководитель\./u);
    assert.doesNotMatch(detail.textContent, /Поручение у исполнителя/u);
    await React.act(async () => button("Проверить исполнение").click());
    assert.ok(button("Принять исполнение"));
    assert.deepEqual(actions, []);
  } finally {
    await React.act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    dom.window.close();
  }
});

test("a director controller closes an unsubmitted assignment with the actual date and a comment", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1:5173/" });
  const descriptors = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const oldFetch = globalThis.fetch;
  for (const name of globalNames) Object.defineProperty(globalThis, name, { value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name], configurable: true, writable: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const rootElement = document.getElementById("root");
  const root = createRoot(rootElement);
  const base = { revision: 2, kind: "Поручение", department: "", project: "", responsible: { fullName: "Исполнитель" }, coExecutorIds: [], coExecutors: [], recurrence: "monthly", activeFrom: "2026-10-01", activeTo: "2026-12-31", currentOccurrenceDate: "2026-10-01", urgency: "", importance: "", progress: "", note: "", incomingNumber: "", completedOn: "", status: "in_progress", comments: [], documents: [], source: null, sourceBoardAssignmentId: null, postponedUntil: "" };
  const open = { ...base, id: "open", number: "ГД-5", summary: "Поручение без отчёта", assignedOn: "2026-10-01", responsibleId: "account:worker" };
  const future = { ...base, id: "future", number: "ГД-6", summary: "Будущее поручение", assignedOn: "2026-10-20", responsibleId: "account:worker" };
  const own = { ...base, id: "own", number: "ГД-7", summary: "Своё поручение", assignedOn: "2026-10-01", responsibleId: "account:me" };
  const submitted = [];
  let failAction = true;
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(String(url), "http://127.0.0.1:5173").pathname;
    if (path === "/api/director-assignments/open/action") {
      submitted.push(JSON.parse(options.body));
      if (failAction) return new Response(JSON.stringify({ error: { message: "Поручение уже изменено. Обновите список." } }), { status: 409 });
      open.status = "completed";
      return new Response(JSON.stringify(open));
    }
    assert.equal(path, "/api/director-assignments");
    return new Response(JSON.stringify({ assignments: [open, future, own], ownAssignmentIds: ["own"], executableAssignmentIds: [], employees: [], permissions: { canView: true, canManage: true, canExecute: false }, today: "2026-10-15" }));
  };
  const button = label => [...rootElement.querySelectorAll("button")].find(item => item.textContent === label);
  const openRow = summary => React.act(async () => [...rootElement.querySelectorAll(".table-text-action")].find(item => item.textContent === summary).click());
  const type = async (element, value) => React.act(async () => {
    const prototype = element instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  try {
    const { DirectorAssignmentsWorkspace } = await vite.ssrLoadModule("/src/DirectorAssignments.tsx");
    await React.act(async () => root.render(React.createElement(DirectorAssignmentsWorkspace, { onShowToast() {} })));
    // The register has no submitted result, so nothing waits for a review decision.
    assert.equal(rootElement.querySelector(".board-assignment-review-queue"), null);

    await openRow(future.summary);
    assert.equal(rootElement.querySelector(".board-assignment-decision"), null);
    assert.match(rootElement.querySelector(".director-assignment-detail").textContent, /Закрыть его можно с даты постановки/u);
    await openRow(own.summary);
    assert.equal(rootElement.querySelector(".board-assignment-decision"), null);
    assert.equal(button("Закрыть как выполненное"), undefined);

    await openRow(open.summary);
    const section = rootElement.querySelector(".board-assignment-decision.is-close");
    assert.match(section.textContent, /Закроется текущий срок, и откроется следующий/u);
    const date = section.querySelector('input[type="date"]');
    assert.equal(date.value, "2026-10-15");
    assert.equal(date.min, "2026-10-01");
    assert.equal(date.max, "2026-10-15");
    assert.equal(button("Закрыть как выполненное").disabled, true);
    await type(section.querySelector("textarea"), "Выполнено, отчёт получен");
    assert.equal(button("Закрыть как выполненное").disabled, false);
    await type(date, "2026-10-16");
    assert.equal(button("Закрыть как выполненное").disabled, true, "a future date cannot be chosen");
    await type(date, "2026-09-30");
    assert.equal(button("Закрыть как выполненное").disabled, true, "the date cannot precede the assignment");
    await type(date, "2026-10-10");
    await React.act(async () => button("Закрыть как выполненное").click());
    assert.deepEqual(submitted, [{ action: "close", comment: "Выполнено, отчёт получен", revision: 2, completedOn: "2026-10-10" }]);
    // A rejection stays next to the button with the entered values kept.
    assert.match(section.querySelector('[role="alert"]').textContent, /уже изменено/u);
    assert.equal(date.value, "2026-10-10");
    failAction = false;
    await React.act(async () => button("Закрыть как выполненное").click());
    assert.equal(rootElement.querySelector(".director-assignment-detail"), null);
    assert.match(rootElement.querySelector("tbody").textContent, /Завершено/u);
  } finally {
    await React.act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    dom.window.close();
  }
});

test("collegium assignments keep the review cycle without closing an unsubmitted assignment", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1:5173/" });
  const descriptors = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const oldFetch = globalThis.fetch;
  for (const name of globalNames) Object.defineProperty(globalThis, name, { value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name], configurable: true, writable: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const rootElement = document.getElementById("root");
  const root = createRoot(rootElement);
  const assignment = { id: "work", number: "К-3", revision: 1, assignedOn: "2026-10-01", kind: "Поручение", summary: "Поручение Коллегии в работе", department: "", project: "", responsibleId: "account:worker", responsible: { fullName: "Исполнитель" }, coExecutorIds: [], coExecutors: [], recurrence: "once", activeFrom: "2026-10-10", activeTo: "2026-10-10", currentOccurrenceDate: "2026-10-10", urgency: "", importance: "", progress: "", note: "", incomingNumber: "", completedOn: "", status: "in_progress", comments: [], documents: [], source: null, sourceBoardAssignmentId: null, postponedUntil: "" };
  globalThis.fetch = async () => new Response(JSON.stringify({ assignments: [assignment], employees: [], permissions: { canView: true, canManage: true, canExecute: false }, today: "2026-10-15" }));
  try {
    const { DirectorAssignmentsWorkspace } = await vite.ssrLoadModule("/src/DirectorAssignments.tsx");
    await React.act(async () => root.render(React.createElement(DirectorAssignmentsWorkspace, { registryId: "collegium", onShowToast() {} })));
    await React.act(async () => rootElement.querySelector(".table-text-action").click());
    assert.equal(rootElement.querySelector(".board-assignment-decision"), null);
    assert.match(rootElement.querySelector(".director-assignment-detail").textContent, /после того, как исполнитель отправит результат на проверку/u);
  } finally {
    await React.act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    dom.window.close();
  }
});
