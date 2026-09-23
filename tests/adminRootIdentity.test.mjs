import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { defaultNavigationOrder } from "../.test-build/src/content.js";

test("account protection controls use the server root flag after renaming and ignore the admin login", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1:5173/" });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const names = ["window", "document", "navigator", "Element", "HTMLElement", "HTMLInputElement", "Event", "FormData", "Node", "IS_REACT_ACT_ENVIRONMENT"];
  const descriptors = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.VITE_SMB_REMOTE_API_URL;
  process.env.VITE_SMB_REMOTE_API_URL = "http://127.0.0.1:5173";
  for (const name of names) Object.defineProperty(globalThis, name, { value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name], configurable: true, writable: true });
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const rootElement = document.getElementById("root");
  const root = createRoot(rootElement);
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  const access = { accountId: "viewer-access", accountType: "admin", position: "administrator", positionDisplayName: "Администратор", displayName: "Администратор", scope: { kind: "platform" }, capabilities: ["platform.manage_users", "platform.manage_access"], navigationItems: ["admin.accounts"], issuedAt: "2026-09-23T00:00:00Z" };
  const account = { accessId: "root-access", userId: "root-user", login: "renamed-root", userDisplayName: "Корневой", userStatus: "active", isRootAdmin: true, isProtected: true, isProtectedByAdminRights: false, accessDisplayName: "Корневой", accountType: "business_owner", position: "worker", positionDisplayName: "Работник", scope: { kind: "organization" }, capabilities: [], navigationItems: [], createdAt: "2026-09-23T00:00:00Z" };
  const json = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async input => {
    const path = new URL(String(input), "http://127.0.0.1:5173").pathname;
    if (path === "/api/access/profile") return json({ profile: { userId: "viewer", accountType: "admin", displayName: "Администратор", activeAccess: access, receivedAt: access.issuedAt } });
    if (path === "/api/navigation-order") return json({ navigationOrder: defaultNavigationOrder });
    if (path === "/api/admin/accounts") return json({ accounts: [account, { ...account, accessId: "ordinary-access", userId: "ordinary-user", login: "admin", isRootAdmin: false, isProtected: false }], canManageProtectedAccounts: true });
    if (path === "/api/admin/positions") return json({ positions: [], canAssignAdminNavigation: true, canManageProtectedPositions: true });
    if (path === "/api/audit/events") return json({ ok: true });
    throw new Error(`Unexpected request: ${path}`);
  };
  try {
    const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
    await React.act(async () => root.render(React.createElement(App)));
    const rootProtection = rootElement.querySelector('input[aria-label="Защитить аккаунт renamed-root"]');
    const ordinaryProtection = rootElement.querySelector('input[aria-label="Защитить аккаунт admin"]');
    assert.ok(rootProtection);
    assert.equal(rootProtection.checked, true);
    assert.equal(rootProtection.disabled, true);
    assert.ok(ordinaryProtection);
    assert.equal(ordinaryProtection.checked, false);
    assert.equal(ordinaryProtection.disabled, false);
  } finally {
    await React.act(async () => root.unmount());
    await vite.close();
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.VITE_SMB_REMOTE_API_URL;
    else process.env.VITE_SMB_REMOTE_API_URL = previousUrl;
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    dom.window.close();
  }
});
