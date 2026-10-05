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

test("every account adds and corrects its notification email from the side rail", async () => {
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
  let storedEmail;
  const patches = [];
  const toasts = [];
  let openCount = 0;

  try {
    const { NotificationEmailButton } = await vite.ssrLoadModule(
      "/src/NotificationEmailDialog.tsx",
    );
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (url.pathname !== "/api/notification-email") {
        throw new Error(`Unexpected request: ${url.pathname}`);
      }
      if ((init.method ?? "GET") === "PATCH") {
        const body = JSON.parse(String(init.body));
        patches.push(body);
        storedEmail = body.email;
        return jsonResponse({ email: body.email });
      }
      return jsonResponse(storedEmail === undefined ? {} : { email: storedEmail });
    };

    const container = dom.window.document.querySelector("#root");
    const root = createRoot(container);
    await React.act(async () => {
      root.render(React.createElement(NotificationEmailButton, {
        onOpen: () => {
          openCount += 1;
        },
        onShowToast: (title, message, tone) => {
          toasts.push({ title, message, tone });
        },
      }));
    });
    const body = dom.window.document.body;
    const openButton = findButtonByText(
      container,
      "Добавить/изменить е-мейл для рассылки",
    );

    // No email yet: an empty field and a hint to add one.
    await React.act(async () => openButton.click());
    await waitFor(React, () => body.querySelector("input[type=email]") !== null);
    assert.equal(openCount, 1);
    let input = body.querySelector("input[type=email]");
    assert.equal(input.value, "");
    assert.match(body.textContent, /Укажите е-мейл/u);

    await React.act(async () => {
      setNativeInputValue(input, "не адрес");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await React.act(async () => {
      body.querySelector(".notification-email-dialog form").dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    assert.match(body.textContent, /Введите корректный е-мейл/u);
    assert.deepEqual(patches, []);

    await React.act(async () => {
      setNativeInputValue(input, " shift@example.com ");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await React.act(async () => {
      findButtonByText(body, "Отправить").click();
    });
    await waitFor(React, () =>
      body.querySelector(".notification-email-dialog") === null
    );
    assert.deepEqual(patches, [{ email: "shift@example.com" }]);
    assert.deepEqual(toasts, [{
      title: "Е-мейл сохранён",
      message: "Рассылки будут приходить на shift@example.com.",
      tone: "success",
    }]);

    // Saved email: the field shows the current address to correct.
    await React.act(async () => openButton.click());
    await waitFor(React, () => body.querySelector("input[type=email]") !== null);
    input = body.querySelector("input[type=email]");
    assert.equal(input.value, "shift@example.com");
    assert.match(body.textContent, /приходят на этот адрес/u);

    // A click inside the dialog keeps it open; the backdrop closes it.
    await React.act(async () => {
      body.querySelector(".notification-email-dialog").dispatchEvent(
        new dom.window.MouseEvent("mousedown", { bubbles: true }),
      );
    });
    assert.ok(body.querySelector(".notification-email-dialog"));
    await React.act(async () => {
      body.querySelector(".admin-db-modal-backdrop").dispatchEvent(
        new dom.window.MouseEvent("mousedown", { bubbles: true }),
      );
    });
    assert.equal(body.querySelector(".notification-email-dialog"), null);
    assert.equal(patches.length, 1);

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    dom.window.close();
    await vite.close();
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
  assert.fail("Timed out waiting for notification email dialog state.");
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
