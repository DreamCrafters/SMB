import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("warehouse 1C tab shows the loaded stock report and switches date and account", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const styleElement = dom.window.document.createElement("style");
  styleElement.textContent = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  dom.window.document.head.append(styleElement);
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
  const requests = [];

  try {
    const { Warehouse1cWorkspace } = await vite.ssrLoadModule(
      "/src/Warehouse1c.tsx",
    );
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      if (url.pathname !== "/api/warehouse-1c/stock-balances") {
        throw new Error(`Unexpected request: ${url.pathname}`);
      }

      const accountCode = url.searchParams.get("accountCode");
      const reportDate = url.searchParams.get("reportDate");

      requests.push({ accountCode, reportDate });

      return jsonResponse({
        accounts: [
          { code: "10.01", label: "Счёт 10.01 (Материалы)" },
          { code: "43", label: "Счёт 43 (Готовая продукция)" },
        ],
        accountCode: accountCode ?? "43",
        availableDates: ["2026-08-23", "2026-08-22"],
        report: {
          accountCode: accountCode ?? "43",
          accountLabel: accountCode === "10.01"
            ? "Счёт 10.01 (Материалы)"
            : "Счёт 43 (Готовая продукция)",
          reportDate: reportDate ?? "2026-08-23",
          fileName: "Остатки.xlsx",
          importedAt: "2026-08-23 06:30:00.000",
          balances: [
            {
              nomenclature: "ША-8",
              warehouse: "Центральный Склад",
              openingBalance: "12500.5",
              closingBalance: "10",
              openingQuantity: "1.5",
              closingQuantity: "0.001",
            },
            {
              nomenclature: "ШБ-5",
              warehouse: "Основной склад",
              openingBalance: "",
              closingBalance: "3",
              openingQuantity: "",
              closingQuantity: "0.5",
            },
          ],
        },
      });
    };

    const container = dom.window.document.querySelector("#root");
    const root = createRoot(container);
    await React.act(async () => {
      root.render(React.createElement(Warehouse1cWorkspace));
    });
    await waitFor(React, () => container.querySelector("tbody tr") !== null);

    // Раздел открывается «Остатками»; журнал приёма — второй вид того же раздела.
    assert.deepEqual(
      Array.from(container.querySelectorAll(".laboratory-section-tabs button"))
        .map((button) => button.textContent),
      ["Остатки", "Журнал загрузок"],
    );
    assert.deepEqual(
      Array.from(container.querySelectorAll("thead th"))
        .map((cell) => cell.textContent),
      [
        "Склад",
        "Номенклатура",
        "Ост. нач., ₽",
        "Ост. нач., кол.",
        "Ост. кон., ₽",
        "Ост. кон., кол.",
      ],
    );
    // Пустой остаток не превращается в ноль.
    assert.deepEqual(readTableRows(container), [
      [
        "Центральный Склад", "ША-8",
        "12 500,5", "1,5", "10", "0,001",
      ],
      ["Основной склад", "ШБ-5", "—", "—", "3", "0,5"],
    ]);
    assert.deepEqual(requests, [{ accountCode: null, reportDate: null }]);

    const search = container.querySelector('input[type="search"]');
    assert.ok(search, "Expected nomenclature search");
    async function searchFor(value) {
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")
          .set.call(search, value);
        search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    }
    await searchFor("  ша-  ");
    assert.equal(readTableRows(container).length, 1);
    assert.match(readTableRows(container)[0].join(" "), /ША-8/u);
    assert.match(container.textContent, /строк: 1 из 2/u);
    await searchFor("Центральный");
    assert.equal(readTableRows(container).length, 0);
    assert.match(container.textContent, /По заданной номенклатуре ничего не найдено/u);
    await searchFor("   ");
    assert.equal(readTableRows(container).length, 2);
    await searchFor("шб");
    assert.equal(requests.length, 1);

    const dateSelect = findSelectByLabel(container, "Дата");
    assert.deepEqual(
      Array.from(dateSelect.options).map((option) => option.textContent),
      ["23.08.2026", "22.08.2026"],
    );
    assert.equal(dateSelect.value, "2026-08-23");

    await React.act(async () => {
      selectOption(dom.window, dateSelect, "2026-08-22");
    });
    await waitFor(React, () => requests.length > 1);
    assert.deepEqual(requests[1], {
      accountCode: null,
      reportDate: "2026-08-22",
    });

    const accountSelect = findSelectByLabel(container, "Счёт");
    assert.deepEqual(
      Array.from(accountSelect.options).map((option) => option.textContent),
      ["Счёт 10.01 (Материалы)", "Счёт 43 (Готовая продукция)"],
    );

    // Смена счёта сбрасывает дату: у другого счёта свой набор выгрузок.
    await React.act(async () => {
      selectOption(dom.window, accountSelect, "10.01");
    });
    await waitFor(React, () => requests.length > 2);
    assert.deepEqual(requests[2], { accountCode: "10.01", reportDate: null });
    assert.equal(search.value, "шб");
    assert.equal(readTableRows(container).length, 1);
    assert.match(readTableRows(container)[0].join(" "), /ШБ-5/u);
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("warehouse 1C hides only four explicit zero balances and combines persistent filters", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://127.0.0.1:5173/",
  });
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom", logLevel: "silent", server: { middlewareMode: true },
  });
  const container = dom.window.document.querySelector("#root");
  const root = createRoot(container);
  let requests = 0;
  const balances = [
    ["Нули", "0", "0.00", "0.000", "-0.000"],
    ["Начало рубли", "0.001", "0", "0", "0"],
    ["Конец рубли", "0", "-0.001", "0", "0"],
    ["Начало количество", "0", "0", "0.001", "0"],
    ["Конец количество", "0", "0", "0", "-0.001"],
    ["Без количества", "0", "0", "", ""],
    ["Без суммы", "", "0", "0", "0"],
  ].map(([nomenclature, openingBalance, closingBalance, openingQuantity, closingQuantity]) => ({
    nomenclature, openingBalance, closingBalance, openingQuantity, closingQuantity,
  }));
  try {
    const { Warehouse1cWorkspace } = await vite.ssrLoadModule("/src/Warehouse1c.tsx");
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      assert.equal(url.pathname, "/api/warehouse-1c/stock-balances");
      requests += 1;
      const payload = buildStockPayload({
        availableDates: ["2026-09-10", "2026-09-09"],
        reportDate: url.searchParams.get("reportDate") ?? "2026-09-10",
        nomenclature: "",
      });
      payload.accounts.push({ code: "10.01", label: "Счёт 10.01" });
      payload.accountCode = url.searchParams.get("accountCode") ?? "43";
      payload.report.balances = balances;
      return jsonResponse(payload);
    };
    await React.act(async () => root.render(React.createElement(Warehouse1cWorkspace)));
    await waitFor(React, () => readTableRows(container).length === 7);
    const checkbox = container.querySelector('input[type="checkbox"]');
    assert.ok(checkbox, "Expected hide zero balances checkbox");
    assert.match(checkbox.closest("label").textContent, /Скрыть нулевые остатки/u);
    assert.equal(checkbox.checked, false);
    await React.act(async () => checkbox.click());
    assert.deepEqual(readTableRows(container).map((row) => row[0]), [
      "Начало рубли", "Конец рубли", "Начало количество", "Конец количество",
      "Без количества", "Без суммы",
    ]);
    assert.match(container.textContent, /строк: 6 из 7/u);
    const search = container.querySelector('input[type="search"]');
    async function searchFor(value) {
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")
          .set.call(search, value);
        search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    }
    await searchFor("  НУЛИ  ");
    assert.equal(readTableRows(container).length, 0);
    assert.match(container.textContent, /По заданным фильтрам ничего не найдено/u);
    assert.match(container.textContent, /строк: 0 из 7/u);
    await React.act(async () => checkbox.click());
    assert.equal(readTableRows(container).length, 1);
    assert.equal(readTableRows(container)[0][0], "Нули");
    await React.act(async () => checkbox.click());
    await searchFor("начало");
    assert.equal(requests, 1);
    await React.act(async () => selectOption(dom.window, findSelectByLabel(container, "Дата"), "2026-09-09"));
    await React.act(async () => selectOption(dom.window, findSelectByLabel(container, "Счёт"), "10.01"));
    await React.act(async () => container.querySelector("button.warehouse-1c-refresh").click());
    assert.equal(requests, 4);
    assert.equal(checkbox.checked, true);
    assert.equal(search.value, "начало");
    assert.deepEqual(readTableRows(container).map((row) => row[0]), ["Начало рубли", "Начало количество"]);
    await searchFor("");
    await React.act(async () => checkbox.click());
    assert.equal(readTableRows(container).length, 7);
  } finally {
    await React.act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    await vite.close();
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("warehouse 1C tab reloads reports on demand and keeps the table meanwhile", async () => {
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
  const requests = [];
  let releaseSecondResponse;

  try {
    const { Warehouse1cWorkspace } = await vite.ssrLoadModule(
      "/src/Warehouse1c.tsx",
    );
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      requests.push({
        accountCode: url.searchParams.get("accountCode"),
        reportDate: url.searchParams.get("reportDate"),
      });

      if (requests.length === 1) {
        return jsonResponse(buildStockPayload({
          availableDates: ["2026-09-06"],
          reportDate: "2026-09-06",
          nomenclature: "ША-8",
        }));
      }

      // Ответ придерживается, чтобы проверить состояние во время обновления.
      return new Promise((resolve) => {
        releaseSecondResponse = () =>
          resolve(jsonResponse(buildStockPayload({
            availableDates: ["2026-09-07", "2026-09-06"],
            reportDate: "2026-09-07",
            nomenclature: "ША-9",
          })));
      });
    };

    const container = dom.window.document.querySelector("#root");
    const root = createRoot(container);
    await React.act(async () => {
      root.render(React.createElement(Warehouse1cWorkspace));
    });
    await waitFor(React, () => container.querySelector("tbody tr") !== null);

    const refreshButton = container.querySelector(".warehouse-1c-refresh");
    assert.ok(refreshButton, "Expected the refresh button");
    assert.equal(refreshButton.textContent, "Обновить отчёты");

    await React.act(async () => {
      refreshButton.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(React, () => requests.length > 1);

    // Кнопка перечитывает то же, что показано сейчас: фильтры не сбрасываются.
    assert.deepEqual(requests[1], { accountCode: null, reportDate: null });
    // Пока сервер отвечает, прежние остатки остаются на экране.
    assert.deepEqual(readTableRows(container), [
      ["ША-8", "1", "0,1", "2", "0,2"],
    ]);
    assert.equal(refreshButton.disabled, true);
    assert.match(refreshButton.textContent, /Обновляем/u);

    await React.act(async () => {
      releaseSecondResponse();
    });
    await waitFor(
      React,
      () => container.querySelector("tbody td")?.textContent === "ША-9",
    );

    assert.equal(findSelectByLabel(container, "Дата").value, "2026-09-07");
    assert.equal(refreshButton.disabled, false);
    assert.equal(refreshButton.textContent, "Обновить отчёты");
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("warehouse 1C journal lists upload attempts and downloads the stored file", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  const previousCreateObjectUrl = URL.createObjectURL;
  const previousRevokeObjectUrl = URL.revokeObjectURL;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  const requests = [];
  const clicked = [];
  const previousClick = dom.window.HTMLElement.prototype.click;

  try {
    const { Warehouse1cWorkspace } = await vite.ssrLoadModule(
      "/src/Warehouse1c.tsx",
    );
    // Скачивание проверяется по параметрам ссылки: переход jsdom не выполняет.
    dom.window.HTMLElement.prototype.click = function captureClick() {
      clicked.push({ href: this.href, download: this.download });
    };
    URL.createObjectURL = () => "blob:report";
    URL.revokeObjectURL = () => {};
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      requests.push(url.pathname);

      if (url.pathname === "/api/warehouse-1c/stock-balances") {
        return jsonResponse(buildStockPayload({
          availableDates: ["2026-09-06"],
          reportDate: "2026-09-06",
          nomenclature: "ША-8",
        }));
      }

      if (url.pathname === "/api/warehouse-1c/uploads") {
        return jsonResponse({
          uploads: [
            {
              id: "upload-2",
              receivedAt: "2026-09-08T09:20:00.000Z",
              outcome: "rejected",
              statusCode: 422,
              fileName: "report_20260908.xlsx",
              fileSize: 2048,
              hasFile: true,
              source: "1С:Предприятие",
              errorMessage: "В шапке отчёта нет даты.",
            },
            {
              id: "upload-1",
              receivedAt: "2026-09-07T09:20:00.000Z",
              outcome: "accepted",
              statusCode: 200,
              fileName: "report_20260907.xlsx",
              fileSize: 2048,
              hasFile: true,
              reportDate: "2026-09-06",
              accounts: "43, 10.01",
              rowCount: 104,
            },
            {
              id: "upload-3",
              receivedAt: "2026-09-09T07:35:00.000Z",
              outcome: "accepted",
              statusCode: 200,
              fileName: "report_20260909.xlsx",
              fileSize: 54051,
              hasFile: true,
              errorMessage: "Не нашли шапку таблицы с колонками.",
            },
          ],
        });
      }

      if (url.pathname === "/api/warehouse-1c/uploads/upload-3/parse") {
        return jsonResponse({ reportDate: "2026-09-09", rows: 479 });
      }

      if (url.pathname === "/api/warehouse-1c/uploads/upload-3/sheet") {
        return jsonResponse({
          fileName: "report_20260909.xlsx",
          sheets: [
            {
              name: "Лист_1",
              isTruncated: false,
              merges: [
                { row: 0, column: 0, rowSpan: 1, columnSpan: 3 },
              ],
              rows: [
                ["Сводный отчёт по материалам и готовой продукции"],
                ["Счет / Склад / Номенклатура", "Показатели", "Дебет"],
                ["43", "БУ", "130 559 980,47"],
              ],
            },
          ],
        });
      }

      if (url.pathname === "/api/warehouse-1c/uploads/upload-2/file") {
        return new Response("xlsx-bytes", {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition":
              'attachment; filename="report_20260908.xlsx"',
          },
        });
      }

      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const container = dom.window.document.querySelector("#root");
    const root = createRoot(container);
    await React.act(async () => {
      root.render(React.createElement(Warehouse1cWorkspace));
    });
    await waitFor(React, () => container.querySelector("tbody tr") !== null);

    const journalTab = Array.from(
      container.querySelectorAll(".laboratory-section-tabs button"),
    ).find((button) => button.textContent === "Журнал загрузок");

    assert.ok(journalTab, "Expected the journal tab");

    await React.act(async () => {
      journalTab.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(
      React,
      () => requests.includes("/api/warehouse-1c/uploads") &&
        container.querySelector(".warehouse-1c-uploads-table") !== null,
    );

    const rows = readTableRows(container);

    assert.equal(rows.length, 3);
    // Отказ виден с кодом ответа и причиной: без журнала следа не оставалось.
    assert.match(rows[0].join(" "), /Отклонена/u);
    assert.match(rows[0].join(" "), /код 422/u);
    assert.match(rows[0].join(" "), /В шапке отчёта нет даты\./u);
    // У принятой выгрузки итог — что именно записано.
    assert.match(rows[1].join(" "), /Принята/u);
    assert.match(rows[1].join(" "), /остатки за 06\.09\.2026/u);
    assert.match(rows[1].join(" "), /счета 43, 10\.01/u);
    assert.match(rows[1].join(" "), /строк: 104/u);
    // Незнакомая структура принимается, но остатков из неё нет.
    assert.match(rows[2].join(" "), /Принята, не разобрана/u);
    assert.match(rows[2].join(" "), /Не нашли шапку таблицы с колонками\./u);

    const downloadButton = Array.from(
      container.querySelectorAll(".warehouse-1c-upload-download"),
    ).find((button) => button.textContent === "Скачать");

    assert.ok(downloadButton, "Expected a download button");

    await React.act(async () => {
      downloadButton.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(React, () => clicked.length > 0);

    // Оригинал сохраняется файлом, а не открывается вкладкой браузера.
    assert.equal(clicked[0].download, "report_20260908.xlsx");
    assert.equal(
      requests.filter(
        (path) => path === "/api/warehouse-1c/uploads/upload-2/file",
      ).length,
      1,
    );

    // Неразобранную выгрузку можно разобрать позже: файл уже лежит у нас.
    const parseButton = Array.from(
      container.querySelectorAll(".warehouse-1c-upload-download"),
    ).find((button) => button.textContent === "Разобрать");

    assert.ok(parseButton, "Expected a parse button");

    await React.act(async () => {
      parseButton.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(
      React,
      () => requests.includes("/api/warehouse-1c/uploads/upload-3/parse"),
    );
    await waitFor(React, () => /Разобрано/u.test(container.textContent));

    assert.match(container.textContent, /остатки за 09\.09\.2026/u);
    assert.match(container.textContent, /строк: 479/u);
    // Разобрать предлагается только принятой и ещё не разобранной выгрузке:
    // ни разобранной, ни отклонённой такая кнопка не положена.
    assert.equal(
      Array.from(container.querySelectorAll(".warehouse-1c-upload-download"))
        .filter((button) => button.textContent === "Разобрать").length,
      1,
    );

    // Нераспознанный файл открывается как есть, строками исходного листа.
    const showButton = Array.from(
      container.querySelectorAll(".warehouse-1c-upload-download"),
    ).filter((button) => button.textContent === "Показать").at(-1);

    assert.ok(showButton, "Expected a show button");

    await React.act(async () => {
      showButton.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(
      React,
      () => container.querySelector(".warehouse-1c-sheet-table") !== null,
    );

    const sheetRows = Array.from(
      container.querySelectorAll(".warehouse-1c-sheet-table tbody tr"),
    ).map((row) =>
      Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent));

    // Шапка новой структуры видна дословно, без сведения к номенклатуре.
    assert.equal(sheetRows.length, 3);
    assert.deepEqual(sheetRows[1], [
      "Счет / Склад / Номенклатура",
      "Показатели",
      "Дебет",
    ]);
    // Объединённая ячейка рисуется одной на всю ширину, как в Excel.
    assert.deepEqual(sheetRows[0], [
      "Сводный отчёт по материалам и готовой продукции",
    ]);
    assert.equal(
      container.querySelector(".warehouse-1c-sheet-table td")?.getAttribute(
        "colspan",
      ),
      "3",
    );
    // Номер строки помогает сверяться с файлом, открытым в Excel.
    assert.deepEqual(
      Array.from(
        container.querySelectorAll('.warehouse-1c-sheet-table th[scope="row"]'),
      ).map((cell) => cell.textContent),
      ["1", "2", "3"],
    );
  } finally {
    dom.window.HTMLElement.prototype.click = previousClick;
    URL.createObjectURL = previousCreateObjectUrl;
    URL.revokeObjectURL = previousRevokeObjectUrl;
    globalThis.fetch = previousFetch;
    await vite.close();
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("warehouse 1C tab says when it reads the production database", async () => {
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
    const { Warehouse1cWorkspace } = await vite.ssrLoadModule(
      "/src/Warehouse1c.tsx",
    );
    globalThis.fetch = async () =>
      jsonResponse({
        accounts: [{ code: "43", label: "Счёт 43 (Готовая продукция)" }],
        accountCode: "43",
        availableDates: ["2026-08-23"],
        isReadOnlySource: true,
        report: {
          accountCode: "43",
          accountLabel: "Счёт 43 (Готовая продукция)",
          reportDate: "2026-08-23",
          fileName: "Остатки.xlsx",
          importedAt: "2026-08-23 06:30:00.000",
          balances: [
            {
              nomenclature: "ША-8",
              openingBalance: "1",
              closingBalance: "2",
              openingQuantity: "0.1",
              closingQuantity: "0.2",
            },
          ],
        },
      });

    const container = dom.window.document.querySelector("#root");
    const root = createRoot(container);
    await React.act(async () => {
      root.render(React.createElement(Warehouse1cWorkspace));
    });
    await waitFor(React, () => container.querySelector("tbody tr") !== null);

    // Иначе непонятно, почему на тестовом сайте видны боевые остатки.
    assert.match(
      container.textContent,
      /Данные основной базы/u,
    );
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("warehouse 1C tab explains an empty store instead of an empty table", async () => {
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
    const { Warehouse1cWorkspace } = await vite.ssrLoadModule(
      "/src/Warehouse1c.tsx",
    );
    globalThis.fetch = async () =>
      jsonResponse({
        accounts: [{ code: "43", label: "Счёт 43 (Готовая продукция)" }],
        accountCode: "43",
        availableDates: [],
      });

    const container = dom.window.document.querySelector("#root");
    const root = createRoot(container);
    await React.act(async () => {
      root.render(React.createElement(Warehouse1cWorkspace));
    });
    await waitFor(
      React,
      () => container.querySelector(".laboratory-empty-note") !== null,
    );

    assert.equal(
      container.querySelector(".laboratory-empty-note").textContent,
      "Остатки из 1С за выбранную дату ещё не загружены.",
    );
    assert.equal(findSelectByLabel(container, "Дата").disabled, true);
    assert.equal(container.querySelector("table"), null);
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

function buildStockPayload({ availableDates, reportDate, nomenclature }) {
  return {
    accounts: [{ code: "43", label: "Счёт 43 (Готовая продукция)" }],
    accountCode: "43",
    availableDates,
    report: {
      accountCode: "43",
      accountLabel: "Счёт 43 (Готовая продукция)",
      reportDate,
      fileName: `report_${reportDate.replaceAll("-", "")}.xlsx`,
      importedAt: `${reportDate} 06:30:00.000`,
      balances: [
        {
          nomenclature,
          openingBalance: "1",
          closingBalance: "2",
          openingQuantity: "0.1",
          closingQuantity: "0.2",
        },
      ],
    },
  };
}

function readTableRows(root) {
  return Array.from(root.querySelectorAll("tbody tr")).map((row) =>
    Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent));
}

function findSelectByLabel(root, labelText) {
  const label = Array.from(root.querySelectorAll("label")).find(
    (item) => item.querySelector(":scope > span")?.textContent === labelText,
  );
  const select = label?.querySelector("select");
  assert.ok(select, `Expected select labelled ${labelText}`);
  return select;
}

function selectOption(window, select, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )?.set;

  setter.call(select, value);
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
}

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
  assert.fail("Timed out waiting for the warehouse 1C state.");
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
