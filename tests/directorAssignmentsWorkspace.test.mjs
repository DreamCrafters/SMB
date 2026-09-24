import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
test.after(() => vite.close());
const globalNames = ["window", "document", "navigator", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Event", "Node", "IS_REACT_ACT_ENVIRONMENT"];

for (const mode of ["send", "receive", "send-linked", "send-unlinked", "both"]) {
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
      await React.act(async () => root.render(React.createElement(DirectorAssignmentsWorkspace, { onShowToast() {} })));
      assert.match(rootElement.textContent, mode !== "receive" && mode !== "both" ? /Отправка и контроль/u : /Получение и выполнение/u);
      if (mode === "both") {
        const numbers = () => [...rootElement.querySelectorAll("tbody tr")].map(row => row.querySelector("td").textContent);
        const switchView = async label => React.act(async () => [...rootElement.querySelectorAll(".director-assignment-view-switch button")].find(button => button.textContent === label).click());
        assert.deepEqual(numbers(), ["ГД-1", "ГД-3"]);
        assert.equal(rootElement.querySelector("form"), null);
        assert.match(rootElement.querySelector(".director-register-heading").textContent, /Мои поручения/u);
        await switchView("Отправка и контроль");
        assert.deepEqual(numbers(), ["ГД-1", "ГД-2", "ГД-3"]);
        await React.act(async () => rootElement.querySelector(".table-text-action").click());
        assert.ok(rootElement.querySelector(".director-assignment-detail"));
        await switchView("Мои поручения");
        assert.equal(rootElement.querySelector(".director-assignment-detail"), null);
        assert.deepEqual(numbers(), ["ГД-1", "ГД-3"]);
        assert.equal(rootElement.querySelector('[aria-pressed="true"]').textContent, "Мои поручения");
        await switchView("Отправка и контроль");
        delayHistory = true;
        await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "История исполнений").click());
        await switchView("Мои поручения");
        await React.act(async () => releaseHistory());
        assert.deepEqual(numbers(), ["ГД-1", "ГД-3"]);
        assert.match(rootElement.querySelector(".director-register-heading").textContent, /Мои поручения/u);
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
        assert.equal(rootElement.querySelectorAll('.director-coexecutors input[type="checkbox"]').length, 1);
        return;
      }
      const form = rootElement.querySelector("form");
      if (mode === "receive") {
        assert.equal(form, null);
        assert.doesNotMatch(rootElement.textContent, /Создать поручение/u);
        assert.match(rootElement.textContent, /Мои поручения/u);
        assert.match(rootElement.querySelector("tbody").textContent, /Ранее назначенная задача/u);
        await React.act(async () => rootElement.querySelector(".table-text-action").click());
        assert.ok(rootElement.querySelector(".director-assignment-detail"));
        assert.equal(rootElement.querySelector(".board-assignment-decision"), null);
        assert.ok([...rootElement.querySelectorAll("button")].some(button => button.textContent === "Скачать поручение в PDF"));
        return;
      }
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
      const coExecutor = form.querySelector('input[type="checkbox"]');
      await React.act(async () => coExecutor.click());
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

for (const canManage of [false, true]) {
  test(`direct completion ${canManage ? "manager" : "executor"} sends a comment and revision and refreshes the journal`, async () => {
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
    const assignment = { department: "", project: "", urgency: "", importance: "", progress: "", completedOn: "", note: "", incomingNumber: "", postponedUntil: "", id: "test-completion", number: "ГД-1", revision: 3, summary: "Задача для завершения", assignedOn: "2026-09-14", responsible: { fullName: "Исполнитель" }, coExecutors: [], currentOccurrenceDate: "2026-09-14", status: "in_progress", comments: [], documents: [] };
    globalThis.fetch = async (url, options = {}) => {
      const path = new URL(String(url), "http://127.0.0.1:5173").pathname;
      if (path === "/api/director-assignments/test-completion/action") {
        assert.equal(options.method, "POST");
        submitted = JSON.parse(options.body);
        if (failAction) return new Response(JSON.stringify({ error: { message: "Поручение уже изменено. Обновите список." } }), { status: 409 });
        await new Promise(resolve => { releaseAction = resolve; });
        assignment.status = "completed";
        return new Response(JSON.stringify(assignment));
      }
      assert.equal(path, "/api/director-assignments");
      return new Response(JSON.stringify({ assignments: canManage || assignment.status !== "completed" ? [assignment] : [], employees: [], permissions: { canView: true, canManage, canExecute: !canManage }, today: "2026-09-15" }));
    };
    try {
      const { DirectorAssignmentsWorkspace } = await vite.ssrLoadModule("/src/DirectorAssignments.tsx");
      await React.act(async () => root.render(React.createElement(DirectorAssignmentsWorkspace, { onShowToast: (...args) => toasts.push(args) })));
      await React.act(async () => rootElement.querySelector(".table-text-action").click());
      const complete = () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Завершить");
      assert.ok(complete());
      assert.equal(complete().disabled, true);
      const comment = rootElement.querySelector(".director-assignment-detail textarea");
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(comment, "Работа выполнена");
        comment.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
      await React.act(async () => complete().click());
      assert.deepEqual(submitted, { action: "complete", comment: "Работа выполнена", revision: 3 });
      assert.match(rootElement.querySelector('[role="alert"]').textContent, /уже изменено/u);
      assert.equal(comment.value, "Работа выполнена");
      assert.equal(complete().disabled, false);
      assert.equal(toasts.length, 0);
      failAction = false;
      await React.act(async () => complete().click());
      assert.equal(complete().disabled, true);
      await React.act(async () => releaseAction());
      assert.equal(rootElement.querySelector(".director-assignment-detail"), null);
      assert.equal(toasts.at(-1)[2], "success");
      if (canManage) {
        assert.match(rootElement.querySelector("tbody").textContent, /Завершено/u);
        await React.act(async () => rootElement.querySelector(".table-text-action").click());
        assert.equal(complete(), undefined);
      } else {
        assert.equal(rootElement.querySelector(".table-text-action"), null);
      }
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
