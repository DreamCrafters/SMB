import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
test.after(() => vite.close());

async function setup(t) {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1/" });
  const names = ["window", "document", "navigator", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"];
  const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach((name) => Object.defineProperty(globalThis, name, {
    configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name],
  }));
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { WorkspaceBoundary } = await vite.ssrLoadModule("/src/WorkspaceBoundary.tsx");
  const container = dom.window.document.getElementById("root");
  const root = createRoot(container, { onCaughtError() {} });
  t.after(async () => {
    await React.act(async () => root.unmount());
    names.forEach((name, index) => {
      if (descriptors[index]) Object.defineProperty(globalThis, name, descriptors[index]);
      else delete globalThis[name];
    });
    dom.window.close();
  });
  const render = (child, key = "first") => React.act(async () => {
    root.render(React.createElement(React.Fragment, null,
      React.createElement("nav", null, "Разделы"),
      React.createElement(WorkspaceBoundary, { key }, child),
    ));
  });
  return { React, container, render };
}

test("a workspace starts loading only when opened and keeps navigation while pending", async (t) => {
  const { React, container, render } = await setup(t);
  let resolve;
  let requests = 0;
  const pending = new Promise((done) => { resolve = done; });
  const Workspace = React.lazy(() => { requests += 1; return pending; });
  await render(React.createElement("p", null, "Другой раздел"));
  assert.equal(requests, 0);
  await render(React.createElement(Workspace));
  assert.equal(requests, 1);
  assert.equal(container.querySelector("nav").textContent, "Разделы");
  assert.match(container.querySelector('[role="status"]').textContent, /Загружаем раздел/);
  await React.act(async () => resolve({ default: () => React.createElement("h1", null, "Склад") }));
  assert.equal(container.querySelector("h1").textContent, "Склад");
  assert.equal(container.querySelector('[role="status"]'), null);
  await render(React.createElement("p", null, "Другой раздел"), "other");
  await render(React.createElement(Workspace));
  assert.equal(requests, 1);
});

test("a failed workspace offers reload and does not prevent opening another section", async (t) => {
  const { React, container, render } = await setup(t);
  const Workspace = React.lazy(() => Promise.reject(new Error("chunk unavailable")));
  await render(React.createElement(Workspace));
  assert.match(container.querySelector('[role="alert"]').textContent, /Не удалось открыть раздел/);
  assert.equal(container.querySelector("button").textContent, "Обновить страницу");
  assert.equal(container.querySelector("nav").textContent, "Разделы");
  await render(React.createElement("h1", null, "Другой раздел"), "other");
  assert.equal(container.querySelector('[role="alert"]'), null);
  assert.equal(container.querySelector("h1").textContent, "Другой раздел");
});
