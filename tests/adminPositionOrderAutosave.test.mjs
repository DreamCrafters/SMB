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

test("position order batches moves, survives refreshes, retries, and can be cancelled", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  dom.window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  const previousRemoteApiUrl = process.env.VITE_SMB_REMOTE_API_URL;
  process.env.VITE_SMB_REMOTE_API_URL = "http://127.0.0.1:5173";
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  let positions = [
    buildPosition("first", "Первая"),
    buildPosition("second", "Вторая"),
    buildPosition("third", "Третья"),
  ];
  let account = buildAccount();
  let accountRefreshCount = 0;
  const attemptedOrders = [];
  const savedOrders = [];
  let failedSaveCount = 0;
  let invalidSaveResponseCount = 0;

  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      const method = init.method ?? "GET";

      if (url.pathname === "/api/access/profile") {
        return jsonResponse({ profile: buildAdminProfile() });
      }
      if (url.pathname === "/api/admin/accounts" && method === "GET") {
        accountRefreshCount += 1;
        return jsonResponse({
          accounts: [account],
          canManageProtectedAccounts: true,
        });
      }
      if (url.pathname === "/api/admin/accounts" && method === "PATCH") {
        account = { ...account, userStatus: "suspended" };
        return jsonResponse({
          userId: account.userId,
          userStatus: account.userStatus,
        });
      }
      if (url.pathname === "/api/admin/positions" && method === "GET") {
        return jsonResponse({
          positions,
          canAssignAdminNavigation: true,
          canManageProtectedPositions: true,
        });
      }
      if (url.pathname === "/api/admin/positions/order" && method === "PUT") {
        const { positionIds } = JSON.parse(String(init.body));
        attemptedOrders.push(positionIds);
        if (failedSaveCount > 0) {
          failedSaveCount -= 1;
          return jsonResponse(
            { error: { message: "Временная ошибка сохранения." } },
            503,
          );
        }
        if (invalidSaveResponseCount > 0) {
          invalidSaveResponseCount -= 1;
          return jsonResponse({ unexpected: true });
        }
        savedOrders.push(positionIds);
        positions = positionIds.map((positionId) =>
          positions.find((position) => position.id === positionId)
        );
        return jsonResponse({
          positions,
          canAssignAdminNavigation: true,
          canManageProtectedPositions: true,
        });
      }
      if (url.pathname === "/api/audit/events" && method === "POST") {
        return jsonResponse({ ok: true });
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };

    const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(React.createElement(App));
    });
    await waitFor(
      React,
      () => rootElement.querySelectorAll(".admin-positions-table tbody tr").length === 3,
    );

    assert.equal(findButton(rootElement, "Сохранить порядок"), undefined);

    const clock = installWindowClock(dom.window);
    try {
      await React.act(async () => {
        findButton(rootElement, "Опустить должность «Первая» ниже")?.click();
      });
      assert.equal(findButton(rootElement, "Новая должность")?.disabled, true);
      assert.equal(
        findPositionAction(rootElement, "Третья", "Удалить")?.disabled,
        true,
      );
      await React.act(async () => {
        findButton(rootElement, "Отключить вход для dispatcher-1")?.click();
      });
      await waitFor(React, () => accountRefreshCount === 2);
      await React.act(async () => clock.advanceBy(4_000));
      assert.deepEqual(savedOrders, []);

      await React.act(async () => {
        findButton(rootElement, "Опустить должность «Первая» ниже")?.click();
      });
      await React.act(async () => clock.advanceBy(1_000));
      assert.deepEqual(savedOrders, []);

      await React.act(async () => clock.advanceBy(3_999));
      assert.deepEqual(savedOrders, []);

      await React.act(async () => clock.advanceBy(1));
      await waitFor(React, () => savedOrders.length === 1);
      assert.deepEqual(savedOrders, [["second", "third", "first"]]);

      await waitFor(
        React,
        () => !findButton(rootElement, "Поднять должность «Первая» выше")?.disabled,
      );
      await React.act(async () => {
        findButton(rootElement, "Поднять должность «Первая» выше")?.click();
      });
      await React.act(async () => {
        findButton(rootElement, "Отменить")?.click();
      });
      await React.act(async () => clock.advanceBy(5_000));
      assert.equal(savedOrders.length, 1);

      failedSaveCount = 1;
      await React.act(async () => {
        findButton(rootElement, "Поднять должность «Первая» выше")?.click();
      });
      await React.act(async () => clock.advanceBy(5_000));
      await waitFor(React, () => attemptedOrders.length === 2);
      assert.equal(savedOrders.length, 1);

      await React.act(async () => clock.advanceBy(4_999));
      assert.equal(attemptedOrders.length, 2);
      await React.act(async () => clock.advanceBy(1));
      await waitFor(React, () => attemptedOrders.length === 3);
      assert.deepEqual(attemptedOrders.slice(1), [
        ["second", "first", "third"],
        ["second", "first", "third"],
      ]);
      assert.deepEqual(savedOrders.at(-1), ["second", "first", "third"]);

      invalidSaveResponseCount = 1;
      await React.act(async () => {
        findButton(rootElement, "Опустить должность «Первая» ниже")?.click();
      });
      await React.act(async () => clock.advanceBy(5_000));
      await waitFor(React, () => attemptedOrders.length === 4);
      await React.act(async () => clock.advanceBy(5_000));
      assert.equal(attemptedOrders.length, 4);
    } finally {
      await React.act(async () => root.unmount());
      clock.restore();
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousRemoteApiUrl === undefined) {
      delete process.env.VITE_SMB_REMOTE_API_URL;
    } else {
      process.env.VITE_SMB_REMOTE_API_URL = previousRemoteApiUrl;
    }
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

function installWindowClock(window) {
  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  const scheduled = new Map();
  let currentTime = 0;
  let nextId = 1;

  window.setTimeout = (callback, delay = 0, ...args) => {
    const id = nextId;
    nextId += 1;
    scheduled.set(id, {
      callback: () => callback(...args),
      dueAt: currentTime + Number(delay),
    });
    return id;
  };
  window.clearTimeout = (id) => {
    scheduled.delete(id);
  };

  return {
    advanceBy(duration) {
      const targetTime = currentTime + duration;
      while (true) {
        const nextTask = Array.from(scheduled.entries())
          .filter(([, task]) => task.dueAt <= targetTime)
          .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
        if (nextTask === undefined) {
          break;
        }
        const [id, task] = nextTask;
        scheduled.delete(id);
        currentTime = task.dueAt;
        task.callback();
      }
      currentTime = targetTime;
    },
    restore() {
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;
    },
  };
}

function findButton(rootElement, label) {
  return Array.from(rootElement.querySelectorAll("button")).find(
    (button) =>
      button.textContent?.trim() === label ||
      button.getAttribute("aria-label") === label,
  );
}

function findPositionAction(rootElement, positionName, actionLabel) {
  const row = Array.from(
    rootElement.querySelectorAll(".admin-positions-table tbody tr"),
  ).find((candidate) => candidate.textContent?.includes(positionName));

  return row === undefined ? undefined : findButton(row, actionLabel);
}

function buildPosition(id, displayName) {
  return {
    id,
    displayName,
    accountType: "business_owner",
    navigationItems: ["business.overview"],
    capabilities: ["business.view_all_statistics"],
    boardAssignmentAccess: "none",
    isProtected: false,
    isAdminProtected: false,
    usageCount: 0,
    createdAt: "2026-08-03T08:00:00.000Z",
  };
}

function buildAccount() {
  return {
    accessId: "dispatcher-access",
    userId: "dispatcher-user",
    login: "dispatcher-1",
    userDisplayName: "Диспетчер Один",
    userStatus: "active",
    isProtected: false,
    accessDisplayName: "Диспетчер Один access",
    accountType: "dispatcher",
    position: "first",
    positionDisplayName: "Первая",
    scope: { kind: "organization" },
    capabilities: ["business.view_all_statistics"],
    navigationItems: ["business.overview"],
    createdAt: "2026-08-03T08:00:00.000Z",
  };
}

function buildAdminProfile() {
  return {
    userId: "admin-user",
    displayName: "Администратор",
    accountType: "admin",
    activeAccess: {
      accountId: "admin-access",
      accountType: "admin",
      position: "administrator",
      positionDisplayName: "Администратор",
      displayName: "Администратор",
      scope: { kind: "platform" },
      capabilities: ["platform.manage_users", "platform.manage_access"],
      navigationItems: ["admin.accounts"],
      issuedAt: "2026-08-03T08:00:00.000Z",
    },
    receivedAt: "2026-08-03T08:00:00.000Z",
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) {
      return;
    }
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  assert.fail("Timed out waiting for rendered state");
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
  const values = {
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

  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  }
}

function restoreDomGlobals(previousGlobals) {
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor === undefined) {
      delete globalThis[name];
    } else {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
}
