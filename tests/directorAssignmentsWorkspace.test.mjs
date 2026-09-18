import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
test.after(() => vite.close());
const globalNames = ["window", "document", "navigator", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Event", "Node", "IS_REACT_ACT_ENVIRONMENT"];

for (const mode of ["send", "receive", "send-linked", "send-unlinked"]) {
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
    const employees = [{ id: "account:employee-1", userId: "employee-1", fullName: "Сотрудник первый", position: "Инженер", active: true }, { id: "account:employee-2", fullName: "Сотрудник второй", position: "Экономист", active: true }];
    const oldAssignment = { id: "old-assignment", number: "ГД-1", revision: 1, assignedOn: "2026-09-15", kind: "Поручение", summary: "Ранее назначенная задача", department: "", project: "", responsibleId: "person-linked", responsible: { ...employees[0], id: "person-linked" }, coExecutorIds: mode === "send-unlinked" ? ["person-unlinked"] : [], coExecutors: mode === "send-unlinked" ? [{ id: "person-unlinked", fullName: "Прежний сотрудник", userId: null }] : [], recurrence: "once", activeFrom: "2026-09-16", activeTo: "2026-09-16", currentOccurrenceDate: "2026-09-16", urgency: "", importance: "", progress: "", note: "", incomingNumber: "", completedOn: "", status: "in_progress", comments: [], documents: [], source: null, sourceBoardAssignmentId: null, postponedUntil: "" };
    globalThis.fetch = async (url, options = {}) => {
      assert.ok(["/api/director-assignments", "/api/director-assignments/old-assignment"].includes(new URL(String(url), "http://127.0.0.1:5173").pathname));
      if (options.method === "POST" || options.method === "PATCH") submitted = JSON.parse(options.body);
      return new Response(JSON.stringify({ assignments: mode === "send-linked" ? [oldAssignment, { ...oldAssignment, id: "review", number: "ГД-2", status: "under_review" }, { ...oldAssignment, id: "clarify", number: "ГД-3", status: "completed", needsClarification: true }] : mode.startsWith("send-") ? [oldAssignment] : [], employees: mode !== "receive" ? employees : [], permissions: { canView: true, canManage: mode !== "receive", canExecute: mode === "receive", canManagePersonnel: false }, today: "2026-09-15" }), { headers: { "Content-Type": "application/json" } });
    };
    try {
      const { DirectorAssignmentsWorkspace } = await vite.ssrLoadModule("/src/DirectorAssignments.tsx");
      await React.act(async () => root.render(React.createElement(DirectorAssignmentsWorkspace, { onShowToast() {} })));
      assert.match(rootElement.textContent, mode !== "receive" ? /Отправка и контроль/u : /Получение и выполнение/u);
      if (mode === "send-linked") {
        const visibleNumbers = () => [...rootElement.querySelectorAll("tbody tr")].map(row => row.querySelector("td").textContent);
        const checkbox = label => [...rootElement.querySelectorAll(".board-assignment-status-options input")].find(input => input.value === label);
        assert.deepEqual(visibleNumbers(), ["ГД-1", "ГД-2", "ГД-3"]);
        await React.act(async () => checkbox("В работе").click());
        assert.deepEqual(visibleNumbers(), ["ГД-1"]);
        await React.act(async () => checkbox("На проверке").click());
        assert.deepEqual(visibleNumbers(), ["ГД-1", "ГД-2"]);
        assert.match(rootElement.querySelector(".director-register-heading").textContent, /Найдено: 2/u);
        await React.act(async () => checkbox("В работе").click());
        assert.deepEqual(visibleNumbers(), ["ГД-2"]);
        await React.act(async () => checkbox("Требует уточнения").click());
        assert.deepEqual(visibleNumbers(), ["ГД-2", "ГД-3"]);
        await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Сбросить").click());
        assert.deepEqual(visibleNumbers(), ["ГД-1", "ГД-2", "ГД-3"]);
        assert.equal(rootElement.querySelectorAll(".board-assignment-status-options input:checked").length, 0);
      }
      if (mode.startsWith("send-")) {
        await React.act(async () => rootElement.querySelector(".table-text-action").click());
        await React.act(async () => [...rootElement.querySelectorAll("button")].find(button => button.textContent === "Редактировать").click());
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
