import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const DOM_GLOBAL_NAMES = [
  "document",
  "Element",
  "Event",
  "FormData",
  "HTMLElement",
  "HTMLInputElement",
  "MouseEvent",
  "navigator",
  "Node",
  "window",
  "IS_REACT_ACT_ENVIRONMENT",
];

const people = [
  { id: "account:author", displayName: "Автор А.А.", position: "Член Коллегии", hasInitiativesTab: true },
  { id: "account:chair", displayName: "Председатель П.П.", position: "Председатель", hasInitiativesTab: true },
];

function buildMeeting(overrides = {}) {
  return {
    id: "meeting-1",
    number: "КЗ-2026-01",
    status: "planned",
    revision: 4,
    meetingDate: "2026-10-12",
    meetingTime: "10:00",
    format: "mixed",
    location: "Зал 2",
    participantIds: ["account:author", "account:chair"],
    absentIds: [],
    quorumNote: "Кворум есть",
    items: [{
      id: "item-1",
      order: 1,
      initiativeId: "initiative-1",
      initiativeNumber: "И-2026-0001",
      snapshot: { revision: 3, card: { title: "Снизить потери", kpiCriterion: "Потери ≤ 1,5 %", initiatorId: "account:author" } },
      speakerId: "account:author",
      participantIds: [],
      durationMinutes: 20,
      discussionStartedAt: "2026-10-12T07:10:00.000Z",
      decision: { decision: "pilot", comment: "Пилот на линии 2", responsibleIds: [], dueDate: "", kpi: "", dissent: "" },
    }],
    protocol: { text: "ПРОТОКОЛ заседания Коллегии № КЗ-2026-01" },
    createdByDisplayName: "Секретарь",
    createdAt: "2026-10-05T09:00:00.000Z",
    updatedAt: "2026-10-05T09:00:00.000Z",
    ...overrides,
  };
}

let sharedVite;
async function loadModule() {
  sharedVite ??= await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  return sharedVite.ssrLoadModule("/src/CollegiumMeetings.tsx");
}

test.after(async () => {
  await sharedVite?.close();
});

test("chair approves the protocol of a planned meeting from its card", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  let meeting = buildMeeting();
  const posts = [];
  let initiativesChanged = 0;

  try {
    const { CollegiumMeetingsView } = await loadModule();
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (url.pathname === "/api/collegium-meetings" && (init.method ?? "GET") === "GET") {
        return jsonResponse({
          meetings: [{ id: meeting.id, number: meeting.number, status: meeting.status, meetingDate: meeting.meetingDate, meetingTime: meeting.meetingTime, format: meeting.format, updatedAt: meeting.updatedAt, itemCount: 1 }],
          permissions: { canView: true, canParticipate: true, canManage: true, canApprove: true },
        });
      }
      if (url.pathname === "/api/collegium-meetings/meeting-1" && (init.method ?? "GET") === "GET") {
        return jsonResponse({ meeting, attachments: [], people, readyInitiatives: [], canManage: true, canApprove: true });
      }
      if (url.pathname === "/api/collegium-meetings/meeting-1/protocol/approve") {
        posts.push(JSON.parse(String(init.body)));
        meeting = buildMeeting({
          status: "approved",
          revision: 5,
          protocol: { ...meeting.protocol, number: "КЗ-2026-01", approvedAt: "2026-10-12T09:00:00.000Z", approvedByDisplayName: "Председатель П.П." },
        });
        return jsonResponse({ meeting });
      }
      throw new Error(`Unexpected request: ${init.method ?? "GET"} ${url.pathname}`);
    };
    const container = dom.window.document.querySelector("#root");
    const root = createRoot(container);
    await React.act(async () => {
      root.render(React.createElement(CollegiumMeetingsView, {
        permissions: { canView: true, canParticipate: true, canManage: true, canApprove: true },
        onShowToast: () => {},
        onInitiativesChanged: () => { initiativesChanged += 1; },
      }));
    });
    await waitFor(React, () => container.querySelector(".collegium-meetings-table") !== null);
    await React.act(async () => findButtonByText(container, "КЗ-2026-01").click());
    await waitFor(React, () => container.textContent.includes("Проект протокола"));
    assert.match(container.textContent, /Проект решения: Провести пилот\. Пилот на линии 2/u);
    assert.match(container.textContent, /докладчик: Автор А\.А\./u);

    await React.act(async () => findButtonByText(container, "Утвердить протокол").click());
    await waitFor(React, () => container.textContent.includes("утверждён"));
    assert.deepEqual(posts, [{ revision: 4 }]);
    assert.equal(initiativesChanged, 1);
    assert.match(container.textContent, /Протокол № КЗ-2026-01 утверждён/u);
    assert.match(container.textContent, /Решение: Провести пилот/u);
    // An approved meeting offers no agenda or protocol editing.
    assert.equal(container.querySelector(".collegium-protocol-editor"), null);
    assert.equal(
      Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "Снять с повестки"),
      false,
    );
    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function findButtonByText(root, text) {
  const button = Array.from(root.querySelectorAll("button")).find(
    (item) => item.textContent === text,
  );
  assert.ok(button, `Expected button labelled ${text}`);
  return button;
}

function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value",
  )?.set;

  setter.call(input, value);
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  assert.fail("Timed out waiting for collegium initiatives state.");
}

function captureDomGlobals() {
  return Object.fromEntries(
    DOM_GLOBAL_NAMES.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
}

function installDomGlobals(window) {
  const domGlobals = {
    document: window.document,
    Element: window.Element,
    Event: window.Event,
    FormData: window.FormData,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    MouseEvent: window.MouseEvent,
    navigator: window.navigator,
    Node: window.Node,
    window,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(domGlobals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
  }
}

function restoreDomGlobals(previousGlobals) {
  for (const [name, descriptor] of Object.entries(previousGlobals)) {
    if (descriptor === undefined) delete globalThis[name];
    else Object.defineProperty(globalThis, name, descriptor);
  }
}
