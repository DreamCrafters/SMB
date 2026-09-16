import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
test.after(() => vite.close());
const globalNames = ["window", "document", "navigator", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Event", "Node", "IS_REACT_ACT_ENVIRONMENT"];

test("board delegation copies full content, supports multiple employees and displays readiness and revisions", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1:5173/" });
  const descriptors = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const oldFetch = globalThis.fetch;
  for (const name of globalNames) Object.defineProperty(globalThis, name, { value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name], configurable: true, writable: true });
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const rootElement = document.getElementById("root");
  const root = createRoot(rootElement);
  const source = { id: "source", summary: "Краткое содержание", details: "Полное содержание поручения СД\nВторая строка", currentOccurrenceDate: "2026-10-01", protocolNumber: "12", decisionNumber: "3" };
  const employees = [{ id: "account:a", fullName: "Первый сотрудник", position: "Инженер", userId: "a" }, { id: "account:b", fullName: "Второй сотрудник", position: "Экономист", userId: "b" }];
  const assignments = [];
  const requests = [];
  const busy = [];
  const json = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(String(url), "http://127.0.0.1:5173").pathname;
    if (path === "/api/board-assignments/source/delegations") return json({ assignments, employees, canAssign: true, today: "2026-09-16" });
    if (path === "/api/director-assignments" && options.method === "POST") {
      const body = JSON.parse(options.body); requests.push(body);
      const id = String(requests.length);
      const responsible = employees.find(employee => employee.id === body.assignment.responsibleId);
      assignments.push({ ...body.assignment, id, number: `ГД-${id}`, responsible, coExecutors: [], currentOccurrenceDate: body.assignment.activeFrom, status: "in_progress", createdAt: "2026-09-16T10:00:00Z", comments: [{ id: `created-${id}`, author: "Гендиректор", text: "Назначено", status: "in_progress", createdAt: "2026-09-16T10:00:00Z", responsibleDisplayName: responsible.fullName }] });
      return json({ assignment: assignments.at(-1) });
    }
    throw new Error(`Unexpected request ${path}`);
  };
  const button = text => [...rootElement.querySelectorAll("button")].find(element => element.textContent === text);
  try {
    const { BoardAssignmentDelegations } = await vite.ssrLoadModule("/src/BoardAssignmentDelegations.tsx");
    await React.act(async () => root.render(React.createElement(BoardAssignmentDelegations, { assignment: source, onShowToast() {}, onBusyChange(value) { busy.push(value); } })));
    for (const [index, employee] of employees.entries()) {
      await React.act(async () => button("Назначить поручение").click());
      const form = rootElement.querySelector("form");
      const summary = form.querySelector("textarea");
      assert.equal(summary.value, source.details);
      assert.doesNotMatch(form.textContent, /Исходное поручение Совета директоров/u);
      const responsible = [...form.querySelectorAll("label")].find(label => label.textContent.startsWith("Ответственный")).querySelector("select");
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(summary, `Уточнённое поручение ${index + 1}`);
        summary.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        responsible.value = employee.id;
        responsible.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
      await React.act(async () => form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
      assert.equal(requests[index].assignment.sourceBoardAssignmentId, "source");
      assert.equal(requests[index].assignment.responsibleId, employee.id);
      assert.equal(requests[index].assignment.summary, `Уточнённое поручение ${index + 1}`);
    }
    assert.deepEqual(busy, [true, false, true, false]);
    assert.equal(rootElement.querySelectorAll("tbody tr").length, 2);
    assignments[0].status = "revision_requested";
    assignments[0].comments.push(
      { id: "ready", author: "Первый сотрудник", text: "Работа готова", status: "under_review", createdAt: "2026-09-16T11:00:00Z", responsibleDisplayName: employees[0].fullName },
      { id: "revision", author: "Гендиректор", text: "Требуется дополнение", status: "revision_requested", createdAt: "2026-09-16T12:00:00Z", responsibleDisplayName: employees[0].fullName },
    );
    await React.act(async () => button("Обновить историю").click());
    const eventsButton = button("События: 3");
    assert.ok(eventsButton);
    assert.equal(eventsButton.getAttribute("aria-expanded"), "false");
    await React.act(async () => eventsButton.click());
    const eventsRow = eventsButton.closest("tr").nextElementSibling;
    assert.equal(eventsRow.querySelector("td").colSpan, 6);
    assert.match(eventsRow.textContent, /Требуется дополнение/u);
    assert.equal(eventsButton.getAttribute("aria-expanded"), "true");
    assert.match(rootElement.textContent, /Готово, на проверке/u);
    assert.match(rootElement.textContent, /На доработке/u);
    assert.match(rootElement.textContent, /Требуется дополнение/u);
    await React.act(async () => eventsButton.click());
    assert.equal(eventsButton.getAttribute("aria-expanded"), "false");
    assert.equal(source.details, "Полное содержание поручения СД\nВторая строка");
    await React.act(async () => root.render(React.createElement(BoardAssignmentDelegations, { assignment: source, onShowToast() {}, onBusyChange() {}, readOnly: true })));
    assert.equal(button("Назначить поручение"), undefined);
    assert.match(rootElement.textContent, /текущее состояние/u);
    assert.equal(rootElement.querySelectorAll("tbody tr").length, 2);
    await React.act(async () => root.render(React.createElement(BoardAssignmentDelegations, { assignment: source, onShowToast() {}, onBusyChange() {} })));
    await React.act(async () => button("Назначить поручение").click());
    await React.act(async () => root.render(React.createElement(BoardAssignmentDelegations, { assignment: source, onShowToast() {}, onBusyChange() {}, isParentSaving: true })));
    assert.equal(rootElement.querySelector('form button[type="submit"]').disabled, true);
    await React.act(async () => rootElement.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(requests.length, 2);

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
