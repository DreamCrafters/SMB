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

const reference = {
  direction: [{ code: "production", label: "Производство" }],
  effect_type: [{ code: "cost_saving", label: "Экономия затрат" }],
};
const people = [
  { id: "account:owner", displayName: "Петров П.П.", position: "Член Коллегии", hasInitiativesTab: true },
  { id: "account:outsider", displayName: "Сидоров С.С.", position: "Мастер", hasInitiativesTab: false },
];

function buildInitiative(card) {
  return {
    id: "initiative-1",
    number: "И-2026-0001",
    status: "draft",
    revision: 1,
    card: {
      title: "", initiatorId: "account:author", directionCode: "", directionLabel: "",
      effectTypeCodes: [], effectTypeLabels: [], problem: "", baselineValue: "",
      baselinePeriod: "", baselineSource: "", solution: "", changeScope: "",
      expectedEffectAmount: "", expectedEffectPeriod: "", expectedEffectKind: "",
      effectMethod: "", oneTimeCostAmount: "", oneTimeCostVat: "", oneTimeCostSource: "",
      recurringCostAmount: "", recurringCostPeriod: "", internalResources: "",
      ownerId: "", executorId: "", executionControllerId: "", effectControllerId: "",
      plannedStart: "", plannedResult: "", kpiCriterion: "", kpiSource: "", risks: [],
      requestedDecision: "", ...card,
    },
    workflow: {},
    createdByUserId: "author",
    createdAt: "2026-10-05T09:00:00.000Z",
    updatedAt: "2026-10-05T09:00:00.000Z",
  };
}

// One Vite SSR server per file: managed Jino kills files that keep several.
let sharedVite;
async function loadWorkspaceModule() {
  sharedVite ??= await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  return sharedVite.ssrLoadModule("/src/CollegiumInitiatives.tsx");
}

test.after(async () => {
  await sharedVite?.close();
});

async function renderWorkspace(permissions, onRequest) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { CollegiumInitiativesWorkspace } = await loadWorkspaceModule();
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), "http://127.0.0.1:5173/");
    return jsonResponse(...await onRequest(url, init, permissions));
  };
  const container = dom.window.document.querySelector("#root");
  const root = createRoot(container);
  await React.act(async () => {
    root.render(React.createElement(CollegiumInitiativesWorkspace, {
      profile: { userId: "author", displayName: "Автор", activeAccess: { navigationItems: [], capabilities: [] } },
      onShowToast: () => {},
    }));
  });
  return {
    dom, React, container,
    async cleanup() {
      await React.act(async () => root.unmount());
      globalThis.fetch = previousFetch;
      dom.window.close();
      restoreDomGlobals(previousGlobals);
    },
  };
}

test("participant creates a draft and opens its card from the registry", async () => {
  let stored;
  const posts = [];
  const actions = [];
  const view = await renderWorkspace(
    { canView: true, canParticipate: true, canManage: false, canApprove: false },
    async (url, init, permissions) => {
      if (url.pathname === "/api/collegium-initiatives/initiative-1/actions") {
        const body = JSON.parse(String(init.body));
        actions.push(body);
        stored = { ...stored, status: "preliminary_review", revision: stored.revision + 1 };
        return [{ initiative: stored }];
      }
      if (url.pathname === "/api/collegium-initiatives" && init.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        stored = buildInitiative({ ...body.card, expectedEffectAmount: "1200.50" });
        return [{ initiative: stored }, 201];
      }
      if (url.pathname === "/api/collegium-initiatives") {
        return [{ initiatives: stored === undefined ? [] : [stored], people, reference, permissions }];
      }
      if (url.pathname === "/api/collegium-initiatives/initiative-1") {
        return [{
          initiative: stored,
          revisions: [{ revision: 1, createdAt: stored.createdAt, authorDisplayName: "Автор", status: "draft", changedFields: [], reason: "Создание инициативы", comment: "", card: stored.card }],
          comments: [],
          attachments: [{ id: "link-1", kind: "link", label: "Данные ОТК", url: "https://drive.google.com/x", createdByDisplayName: "Автор", createdAt: stored.createdAt }],
          canAttach: stored.status === "draft",
          canEdit: stored.status === "draft",
          canComment: true,
          canResolveComments: true,
          actions: stored.status === "draft" ? ["submit_for_review", "withdraw"] : [],
          missingAdmissionFields: ["Описание проблемы / возможности", "Ключевые риски"],
        }];
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    },
  );
  const { dom, React, container } = view;
  try {
    await waitFor(React, () => container.textContent.includes("Инициатив пока нет."));
    await React.act(async () => findButtonByText(container, "Новая инициатива").click());
    const form = container.querySelector(".collegium-form");
    assert.ok(form);
    // Only accounts with the initiatives tab can be assigned.
    const ownerSelect = Array.from(form.querySelectorAll("label")).find(
      (label) => label.querySelector(":scope > span")?.textContent === "Владелец результата",
    ).querySelector("select");
    assert.deepEqual(
      Array.from(ownerSelect.options).map((option) => option.value),
      ["", "account:owner"],
    );
    // A participant cannot pick another initiator.
    assert.equal(form.textContent.includes("Инициатор"), false);

    await React.act(async () => {
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.match(form.textContent, /Укажите наименование идеи/u);
    assert.deepEqual(posts, []);

    const title = Array.from(form.querySelectorAll("label")).find(
      (label) => label.querySelector(":scope > span")?.textContent === "Наименование идеи",
    ).querySelector("input");
    const amount = Array.from(form.querySelectorAll("label")).find(
      (label) => label.querySelector(":scope > span")?.textContent === "Ожидаемый эффект, ₽",
    ).querySelector("input");
    await React.act(async () => {
      setNativeInputValue(title, "Снизить потери при выпуске");
      title.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      setNativeInputValue(amount, "1 200,5");
      amount.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      setNativeInputValue(ownerSelect, "account:owner");
      ownerSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await React.act(async () => {
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(React, () => container.querySelector(".collegium-revisions-table") !== null);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].card.title, "Снизить потери при выпуске");
    assert.equal(posts[0].card.expectedEffectAmount, "1 200,5");
    assert.equal(posts[0].card.ownerId, "account:owner");
    assert.equal(posts[0].revision, undefined);
    assert.match(container.textContent, /И-2026-0001/u);
    assert.match(container.textContent, /Черновик/u);
    assert.match(container.textContent, /Петров П\.П\./u);
    assert.match(container.textContent, /1\s200,50\s₽/u);

    const link = Array.from(container.querySelectorAll(".collegium-attachments a"))[0];
    assert.equal(link.textContent, "Данные ОТК");
    assert.equal(link.getAttribute("rel"), "noreferrer noopener");
    // The server-computed admission gaps are listed on the card.
    assert.match(container.textContent, /Для вынесения на Коллегию не хватает:/u);
    assert.match(container.textContent, /Ключевые риски/u);
    await React.act(async () => findButtonByText(container, "Отправить на оценку").click());
    await React.act(async () => findButtonByText(container, "Подтвердить").click());
    await waitFor(React, () => container.textContent.includes("На предварительной оценке"));
    assert.deepEqual(actions, [{ action: "submit_for_review", revision: 1 }]);
    assert.equal(
      Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "Изменить"),
      false,
    );

    await React.act(async () => findButtonByText(container, "К реестру").click());
    await waitFor(React, () => container.querySelector(".collegium-initiatives-table") !== null);
    assert.ok(findButtonByText(container, "И-2026-0001"));
  } finally {
    await view.cleanup();
  }
});

test("viewer sees the registry without the create action", async () => {
  const view = await renderWorkspace(
    { canView: true, canParticipate: false, canManage: false, canApprove: false },
    async (url, _init, permissions) => {
      if (url.pathname === "/api/collegium-initiatives") {
        return [{ initiatives: [buildInitiative({ title: "Чужая идея" })], people, reference, permissions }];
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    },
  );
  const { React, container } = view;
  try {
    await waitFor(React, () => container.querySelector(".collegium-initiatives-table") !== null);
    assert.equal(
      Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "Новая инициатива"),
      false,
    );
    assert.match(container.textContent, /Чужая идея/u);
  } finally {
    await view.cleanup();
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
