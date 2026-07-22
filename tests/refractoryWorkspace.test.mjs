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

test("refractory workspace opens one of three independent table buttons", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  const previousAppEnv = process.env.VITE_SMB_APP_ENV;
  process.env.VITE_SMB_APP_ENV = "production";
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { RefractoryShopWorkspace } = await vite.ssrLoadModule(
      "/src/RefractoryReports.tsx",
    );
    const { readRefractoryShiftContext } = await vite.ssrLoadModule(
      "/src/services/refractoryShift.ts",
    );
    const initialShift = readRefractoryShiftContext();
    const returnedReport = buildReturnedReport({
      reportDate: initialShift.reportDate,
      shiftNumber: initialShift.shiftNumber,
      payload: {
        formedRows: [
          {
            equipment: "Пресс СМ-1085 №1",
            productBrand: "Старая марка",
            totalDowntimeHours: 0,
          },
        ],
        unformedRows: [],
      },
    });
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (url.pathname.endsWith("/production-brands")) {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          return new Response(JSON.stringify({ label: body.label }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            labels: ["ША-22", "Смесь МК", "Гранулы 0-5"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      const isReturnedShift =
        url.searchParams.get("date") === returnedReport.reportDate &&
        url.searchParams.get("shift") === String(returnedReport.shiftNumber);
      return new Response(
        JSON.stringify({ reports: isReturnedShift ? [returnedReport] : [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(
        React.createElement(RefractoryShopWorkspace, {
          profile: buildOperatorProfile(),
          isAdminPreviewMode: false,
          onShowToast() {},
        }),
      );
    });
    await waitFor(
      React,
      () =>
        rootElement.querySelector(".refractory-report-return-count") !== null,
    );

    const menuButtons = Array.from(
      rootElement.querySelectorAll(".refractory-report-menu button"),
    );
    assert.deepEqual(
      menuButtons.map(
        (button) =>
          button.querySelector(".refractory-report-label")?.textContent,
      ),
      ["ЦОШ", "Сводка по работе оборудования", "Печное отделение"],
    );
    assert.equal(
      menuButtons[0].querySelector(".refractory-report-return-count"),
      null,
    );
    assert.equal(
      menuButtons[1].querySelector(".refractory-report-return-count")
        ?.textContent,
      "1",
    );
    assert.match(
      menuButtons[1].getAttribute("aria-label") ?? "",
      /Возвращено на доработку: 1/u,
    );
    assert.equal(
      menuButtons[2].querySelector(".refractory-report-return-count"),
      null,
    );

    assert.equal(
      rootElement.querySelector("input[readonly]")?.value,
      "Иванов Иван Иванович",
    );
    assert.equal(
      rootElement.querySelector(".refractory-paper-title")?.textContent,
      "Сводка по ЦОШ (ежесменная)",
    );
    const coshHeadings = Array.from(
      rootElement.querySelectorAll(".refractory-section h3"),
      (heading) => heading.textContent,
    );
    assert.deepEqual(coshHeadings, [
      "Выпуск шамота",
      "Замеры банок",
      "Заполнение ж/д бункеров",
      "Подача шамота в огнеупорный цех, тн",
      "Затарка в мешки",
      "Время операций",
    ]);
    const coshLabels = Array.from(
      rootElement.querySelectorAll(".refractory-field > span"),
      (label) => label.textContent,
    );
    [
      "Работает вр. печь №",
      "Загрузка, ковш/час",
      "Загрузка, всего ковшей",
      "Вывоз недопала с ж/д бункера, тн",
      "Время розжига печи",
      "Время начала загрузки",
      "Время перехода на ж/д бункер",
      "№ бункера",
      "Время перехода на банку",
      "№ банки",
      "Время прекращения работы печи",
    ].forEach((label) => assert.ok(coshLabels.includes(label), label));

    await React.act(async () => menuButtons[1].click());
    const equipmentTable = rootElement.querySelector(
      ".refractory-input-table-equipment",
    );
    assert.ok(equipmentTable);
    assert.deepEqual(
      Array.from(equipmentTable.querySelectorAll("thead th"), (cell) =>
        cell.textContent.trim().replace(/\s+/gu, " "),
      ),
      [
        "Оборудование",
        "Марка изделия",
        "Норма выработки",
        "Факт, шт.",
        "Факт, т",
        "Отработано, ч",
        "Простой всего",
        "Ремонт по мех. части",
        "Ремонт по эл. части",
        "Замена вагона",
        "Замена марки",
        "Замена формы",
        "Резерв",
        "Отсутствие рабочего/сменщика",
        "Отсутствие сырья",
        "Примечание",
      ],
    );
    assert.equal(
      equipmentTable.querySelectorAll(
        "thead .refractory-cell-production",
      ).length,
      4,
    );
    assert.equal(
      equipmentTable.querySelectorAll("thead .refractory-cell-downtime")
        .length,
      9,
    );
    assert.match(
      equipmentTable.querySelector("tfoot")?.textContent ?? "",
      /ИТОГО выпуск формованных огнеупоров/u,
    );
    assert.match(
      rootElement.querySelector(".refractory-input-table-compact tfoot")
        ?.textContent ?? "",
      /ИТОГО выпуск неформованных огнеупоров/u,
    );
    const numericValues = [
      ["Пресс СМ-1085 №1: Факт, шт.", "12"],
      ["Пресс СМ-1085 №1: Факт, т", "5.5"],
      ["Пресс СМ-1085 №1: Отработано, ч", "7"],
      ["Пресс СМ-1085 №1: Ремонт по мех. части", "2"],
      ["Пресс СМ-1085 №1: Ремонт по эл. части", "3"],
      ["Факт, контейнеры, строка 1", "4"],
      ["Факт, т, строка 1", "2.5"],
    ];
    await React.act(async () => {
      numericValues.forEach(([label, value]) => {
        const input = rootElement.querySelector(`input[aria-label="${label}"]`);
        assert.ok(input);
        setNativeInputValue(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    });
    assert.equal(
      rootElement.querySelector(
        'output[aria-label="Простой всего, Пресс СМ-1085 №1"]',
      )?.textContent,
      "5",
    );
    assert.equal(
      rootElement.querySelector(
        'output[aria-label="Итого формованных огнеупоров, шт."]',
      )?.textContent,
      "12",
    );
    assert.equal(
      rootElement.querySelector(
        'output[aria-label="Итого формованных огнеупоров, т"]',
      )?.textContent,
      "5,5",
    );
    assert.equal(
      rootElement.querySelector(
        'output[aria-label="Итого неформованных огнеупоров, контейнеры"]',
      )?.textContent,
      "4",
    );
    assert.equal(
      rootElement.querySelector(
        'output[aria-label="Итого неформованных огнеупоров, т"]',
      )?.textContent,
      "2,5",
    );
    const formedBrand = rootElement.querySelector(
      'input[aria-label="Пресс СМ-1085 №1: Марка изделия"]',
    );
    const unformedBrand = rootElement.querySelector(
      'input[aria-label="Марка неформованных огнеупоров 1"]',
    );
    assert.equal(formedBrand.value, "Старая марка");
    assert.deepEqual(readBrandOptions(formedBrand, rootElement), [
      "ША-22",
      "Смесь МК",
      "Гранулы 0-5",
    ]);
    assert.deepEqual(readBrandOptions(unformedBrand, rootElement), [
      "ША-22",
      "Смесь МК",
      "Гранулы 0-5",
    ]);
    assert.equal(formedBrand.getAttribute("placeholder"), "Поиск марки");
    const addBrandButtons = rootElement.querySelectorAll(
      'button[aria-label="Добавить новую марку"]',
    );
    assert.equal(addBrandButtons.length, 1);
    const addBrandButton = addBrandButtons[0];
    assert.ok(addBrandButton);
    assert.equal(
      formedBrand
        .closest(".production-brand-picker")
        ?.querySelector('button[aria-label="Добавить новую марку"]'),
      null,
    );
    assert.ok(
      addBrandButton.compareDocumentPosition(
        rootElement.querySelector(".refractory-table-wrap"),
      ) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await React.act(async () => addBrandButton.click());
    const newBrandInput = rootElement.querySelector(
      'input[aria-label="Новая марка"]',
    );
    assert.ok(newBrandInput);
    await React.act(async () => {
      setNativeInputValue(newBrandInput, "Новая марка");
      newBrandInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    const saveBrandButton = Array.from(
      rootElement.querySelectorAll(".production-brand-create button"),
    ).find((button) => button.textContent === "Сохранить");
    assert.ok(saveBrandButton);
    await React.act(async () => saveBrandButton.click());
    await waitFor(React, () =>
      readBrandOptions(formedBrand, rootElement).includes("Новая марка"),
    );
    assert.equal(formedBrand.value, "Старая марка");
    assert.equal(rootElement.querySelectorAll("form").length, 1);

    await React.act(async () => menuButtons[2].click());
    const firingTable = rootElement.querySelector(
      ".refractory-input-table-firing",
    );
    assert.ok(firingTable);
    assert.ok(
      firingTable
        .closest(".refractory-table-wrap")
        ?.classList.contains("refractory-table-wrap-full-height"),
    );
    assert.deepEqual(
      Array.from(firingTable.querySelectorAll("thead th"), (cell) =>
        cell.textContent.trim().replace(/\s+/gu, " "),
      ),
      [
        "Марка изделия",
        "Кол-во, шт.",
        "Кол-во, поддонов",
        "Годная, т по среднему весу",
        "Годная, т по взвешиванию",
        "Брак всего, шт.",
        "Недожог",
        "Трещины",
        "Выплавка",
        "Сколы",
        "Примечание",
      ],
    );
    assert.match(firingTable.querySelector("tfoot")?.textContent ?? "", /ИТОГО/u);
    assert.ok(
      rootElement.querySelector('input[aria-label="Время прогонки, час(а)"]'),
    );
    assert.ok(
      rootElement.querySelector(
        'input[aria-label="Присутствуют на смене, сортировщиков"]',
      ),
    );
    await React.act(async () => {
      [
        ["Кол-во, шт., строка 1", "100"],
        ["Кол-во, поддонов, строка 1", "4"],
        ["Годная, т по среднему весу, строка 1", "20.5"],
        ["Годная, т по взвешиванию, строка 1", "21"],
        ["Недожог, строка 1", "1"],
        ["Трещины, строка 1", "2"],
        ["Выплавка, строка 1", "3"],
        ["Сколы, строка 1", "4"],
      ].forEach(([label, value]) => {
        const input = rootElement.querySelector(`input[aria-label="${label}"]`);
        assert.ok(input);
        setNativeInputValue(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    });
    assert.equal(
      rootElement.querySelector(
        'output[aria-label="Брак всего, строка 1"]',
      )?.textContent,
      "10",
    );
    assert.equal(
      rootElement.querySelector(
        'output[aria-label="Итого: Кол-во, шт."]',
      )?.textContent,
      "100",
    );
    assert.equal(
      rootElement.querySelector(
        'output[aria-label="Итого: Годная, т по среднему весу"]',
      )?.textContent,
      "20,5",
    );
    assert.equal(
      rootElement.querySelector(
        'output[aria-label="Итого: Брак всего, шт."]',
      )?.textContent,
      "10",
    );
    assert.deepEqual(
      readBrandOptions(
        rootElement.querySelector(
          'input[aria-label="Марка изделия, строка 1"]',
        ),
        rootElement,
      ),
      ["Гранулы 0-5", "Новая марка", "Смесь МК", "ША-22"],
    );

    const reportDateInput = rootElement.querySelector('input[type="date"]');
    assert.ok(reportDateInput);
    const otherDate =
      initialShift.reportDate === "2026-07-20"
        ? "2026-07-21"
        : "2026-07-20";
    await React.act(async () => {
      setNativeInputValue(reportDateInput, otherDate);
      reportDateInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitFor(
      React,
      () =>
        rootElement.querySelector(".refractory-report-return-count") === null,
    );
    assert.equal(
      menuButtons[1].querySelector(".refractory-report-return-count"),
      null,
    );

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    if (previousAppEnv === undefined) {
      delete process.env.VITE_SMB_APP_ENV;
    } else {
      process.env.VITE_SMB_APP_ENV = previousAppEnv;
    }
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

test("refractory navigation shows the number of reports returned for correction", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { SideRail } = await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(
        React.createElement(SideRail, {
          profile: buildOperatorProfile(),
          signedInDisplayName: "Иванов Иван Иванович",
          isAdminPreviewMode: false,
          isMobile: false,
          isOpen: true,
          onToggle() {},
          onRequestClose() {},
          onClearSession() {},
          isSessionLoading: false,
          ownerTab: "refractory_shop",
          onOwnerTabChange() {},
          adminTab: "account_preview",
          onAdminTabChange() {},
          pendingRefractoryCount: 0,
          returnedRefractoryCount: 2,
          returnedRefractoryShifts: [
            { reportDate: "2026-07-20", shiftNumber: 2 },
          ],
        }),
      );
    });

    const refractoryButton = Array.from(
      rootElement.querySelectorAll(".primary-nav button"),
    ).find((button) => button.textContent.includes("Огнеупорный цех"));
    assert.ok(refractoryButton);
    assert.equal(
      refractoryButton.querySelector(".nav-notification-count")?.textContent,
      "2",
    );
    assert.match(
      refractoryButton.textContent,
      /Исправить за 20\.07\.2026 · смена 2/,
    );

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

test("dispatcher opens pending refractory reports from a separate choice button", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { DataEntryWorkspace } = await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(
        React.createElement(DataEntryWorkspace, {
          ariaLabel: "Внесение данных диспетчером",
          status: "",
          isSubmitting: false,
          onSubmit() {},
          dispatcherForms: {
            status: "ready",
            source: "remote",
            forms: [],
          },
          currentUserDisplayName: "Диспетчер",
          isAdminPreviewMode: false,
          refreshVersion: 0,
          onResetStatus() {},
          onShowToast() {},
          pendingRefractoryReports: [buildPendingReport()],
          refractoryQueueError: "",
          onRefractoryReportResolved() {},
        }),
      );
    });

    assert.equal(
      rootElement.querySelector(
        'section[aria-label="Таблицы ОЦ на подтверждение"]',
      ),
      null,
    );
    const queueButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent.includes("Таблицы огнеупорного цеха"),
    );
    assert.ok(queueButton);
    assert.match(queueButton.textContent, /Ожидают решения: 1/u);

    await React.act(async () => queueButton.click());
    assert.ok(
      rootElement.querySelector(
        'section[aria-label="Таблицы ОЦ на подтверждение"]',
      ),
    );
    assert.ok(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent === "К выбору формы",
      ),
    );

    const rejectButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent === "Вернуть на доработку",
    );
    assert.ok(rejectButton);
    await React.act(async () => rejectButton.click());

    assert.ok(rootElement.querySelector(".refractory-reject-comment textarea"));
    assert.equal(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent === "Подтвердить",
      ),
      false,
    );
    assert.ok(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent === "Вернуть",
      ),
    );

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

test("refractory report highlights invalid numeric fields with a clear message", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  installDomGlobals(dom.window);
  const previousFetch = globalThis.fetch;
  let postCount = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "http://127.0.0.1:5173/");
    if (url.pathname.endsWith("/production-brands")) {
      return new Response(
        JSON.stringify({
          labels: ["ША-22", "Смесь МК"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (init?.method === "POST") postCount += 1;
    return new Response(
      JSON.stringify(
        init?.method === "POST"
          ? {
              error: {
                code: "invalid_response",
                message: "Строка 1, «Отработано, ч»: укажите число от 0 до 24.",
                details: [
                  {
                    fieldPath: "formed.0.workedHours",
                    message:
                      "Строка 1, «Отработано, ч»: укажите число от 0 до 24.",
                  },
                ],
              },
            }
          : { reports: [] },
      ),
      {
        status: init?.method === "POST" ? 400 : 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { RefractoryShopWorkspace } = await vite.ssrLoadModule(
      "/src/RefractoryReports.tsx",
    );
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(
        React.createElement(RefractoryShopWorkspace, {
          profile: buildOperatorProfile(),
          isAdminPreviewMode: false,
          onShowToast() {},
        }),
      );
    });
    await waitFor(
      React,
      () => rootElement.querySelector(".refractory-report-form") !== null,
    );

    const menuButtons = Array.from(
      rootElement.querySelectorAll(".refractory-report-menu button"),
    );
    await React.act(async () => menuButtons[1].click());
    assert.equal(
      rootElement.querySelectorAll(
        'button[aria-label="Добавить новую марку"]',
      ).length,
      0,
    );
    const workedHours = rootElement.querySelector(
      'input[aria-label="Пресс СМ-1085 №1: Отработано, ч"]',
    );
    assert.ok(workedHours);

    await React.act(async () => {
      setNativeInputValue(workedHours, "4ч,5");
      workedHours.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(workedHours.value, "4.5");

    setNativeInputValue(workedHours, "42");
    const form = rootElement.querySelector(".refractory-report-form");
    await React.act(async () => {
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    assert.equal(postCount, 0);
    assert.equal(workedHours.getAttribute("aria-invalid"), "true");
    assert.match(
      rootElement.querySelector(".form-status-error")?.textContent ?? "",
      /Отработано, ч.*от 0 до 24/u,
    );
    assert.doesNotMatch(rootElement.textContent, /workedHours/u);

    await React.act(async () => {
      setNativeInputValue(workedHours, "4");
      workedHours.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(workedHours.hasAttribute("aria-invalid"), false);

    await React.act(async () => {
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    assert.equal(postCount, 1);
    assert.equal(workedHours.getAttribute("aria-invalid"), "true");

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    input.ownerDocument.defaultView.HTMLInputElement.prototype,
    "value",
  )?.set;

  setter.call(input, value);
}

function buildPendingReport() {
  return {
    id: "report-1",
    reportType: "cosh",
    reportDate: "2026-07-21",
    shiftNumber: 1,
    revisionNumber: 1,
    status: "pending",
    payload: { kilnNumber: "1" },
    totals: {
      chamotteOutputTons: 0,
      bunkerFillTons: 0,
      chamotteSupplyTons: 0,
      baggingTons: 0,
      scrapRemovalTons: 0,
    },
    masterDisplayName: "Мастер ОЦ",
    submittedAt: "2026-07-21T08:30:00.000Z",
  };
}

function buildReturnedReport(overrides = {}) {
  return {
    ...buildPendingReport(),
    id: "returned-report",
    reportType: "equipment",
    status: "rejected",
    payload: { formedRows: [], unformedRows: [] },
    totals: {},
    rejectionComment: "Уточните данные",
    ...overrides,
  };
}

function buildOperatorProfile() {
  return {
    userId: "operator-user",
    displayName: "Иванов Иван Иванович",
    accountType: "worker",
    activeAccess: {
      accountId: "operator-access",
      accountType: "worker",
      position: "refractory-operator",
      positionDisplayName: "Мастер ОЦ",
      displayName: "Мастер ОЦ",
      scope: { kind: "organization" },
      capabilities: ["business.submit_refractory_reports"],
      navigationItems: ["business.refractory_shop"],
      issuedAt: "2026-07-21T08:00:00.000Z",
    },
    receivedAt: "2026-07-21T08:00:00.000Z",
  };
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  assert.fail("Timed out waiting for refractory workspace state.");
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

function readBrandOptions(input, root) {
  assert.ok(input);
  const listId = input.getAttribute("list");
  const list = listId === null ? null : root.querySelector(`#${listId}`);
  assert.ok(list);
  return Array.from(list.options).map((option) => option.value);
}

function restoreDomGlobals(previousGlobals) {
  for (const [name, descriptor] of Object.entries(previousGlobals)) {
    if (descriptor === undefined) delete globalThis[name];
    else Object.defineProperty(globalThis, name, descriptor);
  }
}
