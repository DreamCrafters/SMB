import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const DOM_GLOBAL_NAMES = [
  "document",
  "Element",
  "Event",
  "HTMLElement",
  "navigator",
  "Node",
  "window",
  "IS_REACT_ACT_ENVIRONMENT",
];

test("remaining notifications animate when the bottom-fixed toast stack shrinks", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  installDomGlobals(dom.window);

  let layoutPhase = "initial";
  const animationCalls = [];
  const originalGetBoundingClientRect =
    dom.window.HTMLElement.prototype.getBoundingClientRect;

  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  Object.defineProperty(
    dom.window.HTMLElement.prototype,
    "getBoundingClientRect",
    {
      configurable: true,
      value() {
        if (this.classList.contains("app-toast")) {
          const isRemainingToast =
            this.querySelector("strong")?.textContent === "Остаётся";
          const top = isRemainingToast && layoutPhase === "initial" ? 100 : 200;

          return {
            x: 0,
            y: top,
            top,
            right: 360,
            bottom: top + 80,
            left: 0,
            width: 360,
            height: 80,
            toJSON() {},
          };
        }

        return originalGetBoundingClientRect.call(this);
      },
    },
  );
  Object.defineProperty(dom.window.HTMLElement.prototype, "animate", {
    configurable: true,
    value(keyframes, options) {
      const animation = {
        cancel() {},
        onfinish: null,
      };
      animationCalls.push({ element: this, keyframes, options, animation });
      return animation;
    },
  });

  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { ToastViewport } = await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    const remainingToast = {
      id: 1,
      title: "Остаётся",
      message: "Первое уведомление",
      tone: "warning",
      state: "visible",
    };
    const dismissedToast = {
      id: 2,
      title: "Закрывается",
      message: "Второе уведомление",
      tone: "suggestion",
      state: "visible",
    };

    await React.act(async () => {
      root.render(
        React.createElement(ToastViewport, {
          toasts: [remainingToast, dismissedToast],
          onDismiss() {},
        }),
      );
    });
    assert.equal(animationCalls.length, 0);

    layoutPhase = "after-removal";
    await React.act(async () => {
      root.render(
        React.createElement(ToastViewport, {
          toasts: [remainingToast],
          onDismiss() {},
        }),
      );
    });

    assert.equal(animationCalls.length, 1);
    assert.equal(
      animationCalls[0].element.querySelector("strong")?.textContent,
      "Остаётся",
    );
    assert.deepEqual(animationCalls[0].keyframes, [
      { translate: "0 -100px" },
      { translate: "0 0" },
    ]);
    assert.deepEqual(animationCalls[0].options, {
      duration: 220,
      easing: "ease-out",
    });

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

function captureDomGlobals() {
  return new Map(
    DOM_GLOBAL_NAMES.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
}

function installDomGlobals(window) {
  for (const name of DOM_GLOBAL_NAMES) {
    const value = name === "IS_REACT_ACT_ENVIRONMENT" ? true : window[name];
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
}

function restoreDomGlobals(previous) {
  for (const [name, descriptor] of previous) {
    if (descriptor === undefined) {
      delete globalThis[name];
    } else {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
}
