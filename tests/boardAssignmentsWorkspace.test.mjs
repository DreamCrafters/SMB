import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const DOM_GLOBAL_NAMES = [
  "document",
  "Element",
  "Event",
  "HTMLElement",
  "HTMLInputElement",
  "MouseEvent",
  "navigator",
  "Node",
  "window",
  "IS_REACT_ACT_ENVIRONMENT",
];

test("board assignment workspace shows the required register and an actionable detail card", async () => {
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
  const summary = {
    id: "assignment-1",
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.3",
    summary: "Подготовить анализ причин невыполнения плана",
    coExecutors: ["Экономист"],
    dueDate: "До 24.07.2026",
    status: "in_progress",
    createdByDisplayName: "Белов Ю.И.",
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T08:00:00.000Z",
  };
  const permissions = {
    canView: true,
    canCreate: false,
    canExecute: true,
    canReview: false,
  };

  try {
    const { BoardAssignmentsWorkspace } = await vite.ssrLoadModule(
      "/src/BoardAssignments.tsx",
    );
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      if (url.pathname === "/api/board-assignments") {
        return jsonResponse({ assignments: [summary], permissions });
      }
      if (url.pathname === "/api/board-assignments/assignment-1") {
        return jsonResponse({
          assignment: {
            ...summary,
            details: "Представить Совету директоров письменный анализ.",
            sourceMaterial: {
              key: "protocol-369-2026-07-10",
              fileName: "Протокол 369 10.07.2026 v2.pdf",
            },
            comments: [
              {
                id: "comment-1",
                authorDisplayName: "Фридман Е.М.",
                comment: "Комментарий один.",
                statusAfter: "in_progress",
                createdAt: "2026-07-20T10:00:00.000Z",
              },
              {
                id: "comment-2",
                authorDisplayName: "Лариков А.Т.",
                comment: "Комментарий два.",
                statusAfter: "revision_requested",
                createdAt: "2026-07-21T10:00:00.000Z",
              },
            ],
          },
          permissions,
        });
      }

      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    await React.act(async () => {
      root.render(
        React.createElement(BoardAssignmentsWorkspace, {
          isAdminPreviewMode: false,
          onShowToast() {},
        }),
      );
    });
    await waitFor(React, () =>
      rootElement.querySelector(".board-assignment-link") !== null
    );

    assert.deepEqual(
      Array.from(rootElement.querySelectorAll("th")).map((node) =>
        node.textContent?.trim()
      ),
      [
        "Дата заседания Совета директоров",
        "Краткое содержание поручения",
        "Соисполнители",
        "Срок исполнения",
        "Статус",
      ],
    );

    await React.act(async () => {
      rootElement.querySelector(".board-assignment-link").click();
    });
    await waitFor(React, () =>
      rootElement.querySelector(".board-assignment-comments pre") !== null
    );

    const comments = rootElement.querySelector(
      ".board-assignment-comments pre",
    )?.textContent ?? "";
    assert.match(
      comments,
      /\d{2}\.\d{2}\.\d{4}.*Фридман Е\.М\.\nКомментарий один\.\n\n\d{2}\.\d{2}\.\d{4}.*Лариков А\.Т\.\nКомментарий два\./u,
    );
    assert.equal(findLabel(rootElement, "Комментарий") !== undefined, true);
    assert.equal(findLabel(rootElement, "Статус") !== undefined, true);

    const cancel = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Отмена",
    );
    assert.ok(cancel);
    await React.act(async () => cancel.click());
    assert.equal(rootElement.querySelector('[role="dialog"]'), null);

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    globalThis.fetch = previousFetch;
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

function findLabel(root, text) {
  return Array.from(root.querySelectorAll("label")).find(
    (label) => label.querySelector("span")?.textContent?.trim() === text,
  );
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  assert.fail("Timed out waiting for the workspace to render.");
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
  for (const name of DOM_GLOBAL_NAMES) {
    const value = name === "IS_REACT_ACT_ENVIRONMENT"
      ? true
      : window[name];
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
