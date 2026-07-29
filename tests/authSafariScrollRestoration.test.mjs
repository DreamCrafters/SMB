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

test("auth screen returns its own scroll container to the top after pageshow", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    {
      pretendToBeVisual: true,
      url: "http://127.0.0.1:5173/",
    },
  );
  dom.window.matchMedia = () => ({
    matches: true,
    media: "(max-width: 1080px)",
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
  const devAccessOptionsResponse = createDeferred();
  installDomGlobals(dom.window);
  process.env.VITE_SMB_REMOTE_API_URL = "http://127.0.0.1:5173";

  globalThis.fetch = async (input) => {
    const url = new URL(String(input), dom.window.location.href);

    if (url.pathname === "/api/access/profile") {
      return jsonResponse({ profile: null });
    }

    if (url.pathname === "/api/dev/access-session") {
      await devAccessOptionsResponse.promise;
      return jsonResponse({
        options: [
          {
            accountType: "admin",
            capabilities: [],
            navigationItems: [],
            position: "admin",
            positionDisplayName: "Администратор",
          },
        ],
      });
    }

    throw new Error(`Unexpected request: ${url.href}`);
  };

  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  const rootElement = dom.window.document.getElementById("root");
  const root = createRoot(rootElement);

  try {
    const { default: App } = await vite.ssrLoadModule("/src/App.tsx");

    await React.act(async () => {
      root.render(React.createElement(App));
    });
    await waitFor(
      React,
      () => rootElement.querySelector(".auth-shell") !== null,
    );

    const authShell = rootElement.querySelector(".auth-shell");
    assert.ok(authShell);
    authShell.scrollTop = 72;

    await React.act(async () => {
      dom.window.dispatchEvent(new dom.window.Event("pageshow"));
      authShell.scrollTop = 48;
      await new Promise((resolve) => dom.window.setTimeout(resolve, 25));
    });

    assert.equal(
      authShell.scrollTop,
      0,
      "Safari-restored auth scroll position must not clip the page header",
    );

    await React.act(async () => {
      dom.window.dispatchEvent(new dom.window.Event("pageshow"));
      await new Promise((resolve) => dom.window.setTimeout(resolve, 25));
      authShell.scrollTop = 56;
      authShell.dispatchEvent(new dom.window.Event("scroll"));
      await new Promise((resolve) => dom.window.setTimeout(resolve, 25));
    });

    assert.equal(
      authShell.scrollTop,
      0,
      "a late Safari scroll restoration must not clip the page header",
    );

    authShell.dispatchEvent(new dom.window.Event("wheel"));
    authShell.scrollTop = 40;
    authShell.dispatchEvent(new dom.window.Event("scroll"));
    assert.equal(
      authShell.scrollTop,
      40,
      "real user input must release the restoration guard",
    );

    authShell.scrollTop = 64;
    devAccessOptionsResponse.resolve();
    await waitFor(
      React,
      () => rootElement.querySelector(".auth-option") !== null,
    );

    assert.equal(
      authShell.scrollTop,
      0,
      "loading the access cards must keep the refreshed auth screen at the top",
    );
  } finally {
    await React.act(async () => root.unmount());
    await vite.close();
    globalThis.fetch = previousFetch;
    if (previousRemoteApiUrl === undefined) {
      delete process.env.VITE_SMB_REMOTE_API_URL;
    } else {
      process.env.VITE_SMB_REMOTE_API_URL = previousRemoteApiUrl;
    }
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("auth DOM setup supports a getter-only Node navigator", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    enumerable: true,
    get: () => ({ userAgent: "Node.js" }),
  });
  const previousGlobals = captureDomGlobals();

  try {
    installDomGlobals(dom.window);
    assert.equal(globalThis.navigator, dom.window.navigator);

    restoreDomGlobals(previousGlobals);
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(globalThis, "navigator"),
      previousGlobals.navigator,
    );
  } finally {
    dom.window.close();
    restoreGlobal("navigator", originalNavigator);
  }
});

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function createDeferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
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
    restoreGlobal(name, descriptor);
  }
}

function restoreGlobal(name, descriptor) {
  if (descriptor === undefined) {
    delete globalThis[name];
  } else {
    Object.defineProperty(globalThis, name, descriptor);
  }
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) {
      return;
    }

    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  assert.fail("Timed out waiting for the auth shell");
}
