import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const projectRoot = new URL("../", import.meta.url);
const DOM_GLOBAL_NAMES = [
  "document",
  "Element",
  "Event",
  "HTMLElement",
  "HTMLInputElement",
  "KeyboardEvent",
  "MouseEvent",
  "navigator",
  "Node",
  "window",
  "IS_REACT_ACT_ENVIRONMENT",
];

test("notification workspaces expose the position matrix and exact MAX onboarding", async () => {
  const workspace = await readFile(
    new URL("src/NotificationSettings.tsx", projectRoot),
    "utf8",
  );
  const styles = await readFile(new URL("src/styles.css", projectRoot), "utf8");

  assert.match(workspace, />Разрешено должности</u);
  assert.match(workspace, />Рассылка</u);
  assert.match(workspace, />Вкл\.<\/th>/u);
  assert.match(workspace, />емейл</u);
  assert.match(workspace, />Макс</u);
  assert.match(workspace, /<th scope="col">Должность<\/th>/u);
  assert.match(workspace, /<th scope="col">Аккаунтов<\/th>/u);
  assert.equal(workspace.includes('<th scope="col">Имя</th>'), false);
  assert.match(workspace, /!setting\.adminEnabled/u);
  assert.match(workspace, /settings\.email === undefined/u);
  assert.match(workspace, /settings\.maxUserId === undefined/u);
  assert.equal(workspace.includes("canManageProtectedAccounts"), false);
  assert.equal(workspace.includes("hasAdminRights"), false);
  assert.equal(workspace.includes("account.isProtected"), false);
  assert.match(
    workspace,
    /async function savePermission[\s\S]*?setStatus\(""\);[\s\S]*?setSavingKey\(`\$\{selected\.position\}:\$\{type\}`\)/u,
  );
  assert.match(
    workspace,
    /async function saveContacts[\s\S]*?setStatus\(""\);[\s\S]*?setSavingKey/u,
  );
  assert.match(workspace, /https:\/\/max\.ru\/id7116027251_bot/u);
  assert.match(workspace, /Напишите боту <code>\/start<\/code>/u);
  assert.match(workspace, /9239239@gmail\.com/u);
  assert.match(
    styles,
    /\.notification-admin-layout\s*\{[^}]*grid-template-columns:\s*minmax\(360px, 480px\)/su,
  );
  assert.match(
    styles,
    /\.notification-admin-user-table\s*\{[^}]*min-width:\s*420px/su,
  );
});

test("administrator selects a notification position by the whole row and enables the setting", async () => {
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
  let savedChannels;
  const position = {
    position: "general_director",
    positionDisplayName: "Генеральный директор",
    permissions: [{
      type: "board_assignments",
      label: "Поручения Совета директоров",
      adminEnabled: false,
    }],
    accounts: [{
      userId: "director-user",
      displayName: "Фридман Е.М.",
      login: "director",
      email: "director@example.com",
      maxUserId: "101",
    }],
  };

  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      const method = init.method ?? "GET";
      if (url.pathname === "/api/admin/notification-settings" && method === "GET") {
        return jsonResponse({ positions: [position] });
      }
      if (
        url.pathname ===
          "/api/admin/notification-settings/positions/general_director/board_assignments" &&
        method === "PATCH"
      ) {
        savedChannels = JSON.parse(String(init.body));
        return jsonResponse({
          positions: [{
            ...position,
            permissions: [{
              ...position.permissions[0],
              ...savedChannels,
            }],
          }],
        });
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };

    const { AdminNotificationSettingsWorkspace } = await vite.ssrLoadModule(
      "/src/NotificationSettings.tsx",
    );
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    await React.act(async () => {
      root.render(React.createElement(AdminNotificationSettingsWorkspace, {
        onShowToast() {},
      }));
    });
    await waitFor(
      React,
      () => rootElement.querySelector(".notification-admin-user-table tbody tr") !== null,
    );

    const positionRow = rootElement.querySelector(
      ".notification-admin-user-table tbody tr",
    );
    assert.ok(positionRow);
    assert.equal(
      positionRow.textContent?.includes("Генеральный директор"),
      true,
    );
    await React.act(async () => positionRow.click());
    await waitFor(
      React,
      () => rootElement.querySelector(".notification-admin-detail") !== null,
    );

    const channelHeaders = Array.from(
      rootElement.querySelectorAll(
        ".notification-admin-detail .notification-settings-table thead th",
      ),
      (header) => header.textContent?.trim(),
    );
    assert.deepEqual(channelHeaders, ["Рассылка", "Вкл."]);
    const permissionToggle = rootElement.querySelector(
      'input[aria-label="Включить: Поручения Совета директоров"]',
    );
    assert.ok(permissionToggle);
    assert.equal(permissionToggle.checked, false);

    await React.act(async () => permissionToggle.click());
    await waitFor(React, () => savedChannels !== undefined);
    assert.deepEqual(savedChannels, {
      adminEnabled: true,
    });
    await waitFor(React, () => permissionToggle.checked === true);
    const contactInput = rootElement.querySelector(
      ".notification-admin-contacts input[type=\"email\"]",
    );
    assert.ok(contactInput);
    assert.equal(contactInput.value, "director@example.com");

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

test("user sees only notification types enabled by an administrator", async () => {
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
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (
        url.pathname === "/api/notification-settings" &&
        (init.method ?? "GET") === "GET"
      ) {
        return jsonResponse({
          settings: {
            userId: "director-user",
            displayName: "Фридман Е.М.",
            position: "general_director",
            positionDisplayName: "Генеральный директор",
            isProtected: false,
            email: "director@example.com",
            maxUserId: "101",
            settings: [
              {
                type: "board_assignments",
                label: "Поручения Совета директоров",
                adminEnabled: true,
                emailEnabled: false,
                maxEnabled: false,
              },
              {
                type: "incidents",
                label: "Инциденты",
                adminEnabled: false,
                emailEnabled: false,
                maxEnabled: false,
              },
            ],
          },
        });
      }
      throw new Error(`Unexpected request: ${init.method ?? "GET"} ${url.pathname}`);
    };

    const { NotificationSettingsWorkspace } = await vite.ssrLoadModule(
      "/src/NotificationSettings.tsx",
    );
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    await React.act(async () => {
      root.render(React.createElement(NotificationSettingsWorkspace, {
        isAdminPreviewMode: false,
        onShowToast() {},
      }));
    });
    await waitFor(
      React,
      () => rootElement.querySelector(".notification-settings-table") !== null,
    );

    assert.match(rootElement.textContent, /Поручения Совета директоров/u);
    assert.doesNotMatch(rootElement.textContent, /Инциденты/u);

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
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

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  assert.fail("Timed out waiting for notification settings workspace.");
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
  const values = {
    document: window.document,
    Element: window.Element,
    Event: window.Event,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    KeyboardEvent: window.KeyboardEvent,
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
