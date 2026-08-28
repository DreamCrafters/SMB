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

const viteServers = new Map();

async function loadViteServer(appEnv) {
  const cached = viteServers.get(appEnv);

  if (cached !== undefined) {
    return cached;
  }

  const previousAppEnv = process.env.VITE_SMB_APP_ENV;

  process.env.VITE_SMB_APP_ENV = appEnv;

  try {
    const server = await createServer({
      appType: "custom",
      logLevel: "silent",
      server: { middlewareMode: true },
    });

    viteServers.set(appEnv, server);

    return server;
  } finally {
    if (previousAppEnv === undefined) {
      delete process.env.VITE_SMB_APP_ENV;
    } else {
      process.env.VITE_SMB_APP_ENV = previousAppEnv;
    }
  }
}

test.after(async () => {
  for (const server of viteServers.values()) {
    await server.close();
  }
});

test("refractory workspace opens shift reports and the wagon journal", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await loadViteServer("production");

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
    const refractoryWagons = [
      {
        id: "wagon-16",
        number: "В-16",
        loadingDate: "2026-08-05",
        productBrand: "ШКУ-32",
        pressDate: "2026-08-04",
        pieceCount: 480,
        setter: "Иванов И.И.",
        pressOperator: "Петров П.П.",
        rawControlDate: "2026-08-05",
        firingOperator: "Зайцев З.З.",
        firingDates: ["2026-08-06", "2026-08-06"],
        sorter: "Орлова О.О.",
        sortingDate: "2026-08-08",
        postFiringCondition: "Можно эксплуатировать",
        serviceApprovalDate: "2026-08-07",
        createdAt: "2026-08-05T08:00:00.000Z",
      },
      // Задача 91: обжиг и сортировка видят только вагон, прошедший контроль
      // сырца и ещё не обожжённый, — В-16 свой цикл уже отработал.
      {
        id: "wagon-18",
        number: "В-18",
        loadingDate: "2026-08-05",
        productBrand: "ШКУ-32",
        pressDate: "2026-08-04",
        pieceCount: 480,
        setter: "Иванов И.И.",
        pressOperator: "Петров П.П.",
        rawControlDate: "2026-08-06",
        firingOperator: null,
        firingDates: [],
        sorter: null,
        sortingDate: null,
        postFiringCondition: null,
        serviceApprovalDate: null,
        createdAt: "2026-08-05T08:10:00.000Z",
      },
    ];
    let submittedWagon;
    let submittedInspection;
    let correctedWagon;
    let submittedReport;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (url.pathname.endsWith("/production-brands")) {
        return new Response(
          JSON.stringify({
            labels: ["ША-22", "Смесь МК", "Гранулы 0-5"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname.endsWith("/refractory-reports/banks")) {
        return new Response(JSON.stringify({
          currentAssignments: [
            buildBankAssignment(1, "ШКИ", 1.16),
            buildBankAssignment(2, "ШКИ-66", 1.57),
            buildBankAssignment(3, "ШГР-28", 1.09),
          ],
          coshMasterOptions: ["Сидоров С.С.", "Иванов Иван Иванович"],
          previousShipments: [
            { bankNumber: 1, materialLabel: "ШКИ", shipmentMassTons: 900 },
          ],
          volumeReference: { points: [
            { heightMeters: 0, volumeCubicMeters: 988.5 },
            { heightMeters: 0.1, volumeCubicMeters: 980.65 },
            { heightMeters: 0.2, volumeCubicMeters: 972.8 },
            { heightMeters: 15, volumeCubicMeters: 0 },
          ] },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (
        url.pathname.includes("/refractory-wagons/") &&
        init?.method === "PATCH"
      ) {
        correctedWagon = JSON.parse(String(init.body));
        const wagonId = url.pathname.split("/").at(-1);
        const index = refractoryWagons.findIndex((wagon) => wagon.id === wagonId);
        refractoryWagons[index] = {
          ...refractoryWagons[index],
          ...correctedWagon,
        };
        return new Response(JSON.stringify({ wagon: refractoryWagons[index] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname.endsWith("/refractory-wagon-inspections")) {
        if (init?.method === "POST") {
          submittedInspection = JSON.parse(String(init.body));
          const wagon = refractoryWagons.find(
            (item) => item.id === submittedInspection.wagonId,
          );
          wagon.postFiringCondition = submittedInspection.condition;
          wagon.serviceApprovalDate = submittedInspection.approvalDate;
          return new Response(JSON.stringify({
            inspection: {
              id: "inspection-1",
              wagonId: submittedInspection.wagonId,
              wagonNumber: wagon.number,
              sortingDate: wagon.sortingDate,
              condition: submittedInspection.condition,
              approvalDate: submittedInspection.approvalDate,
              inspectedByDisplayName: "Иванов Иван Иванович",
              createdAt: "2026-08-12T09:00:00.000Z",
            },
          }), { status: 201, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ inspections: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname.endsWith("/refractory-wagons")) {
        if (init?.method === "POST") {
          submittedWagon = JSON.parse(String(init.body));
          const wagon = {
            id: "wagon-17",
            ...submittedWagon,
            rawControlDate: null,
            firingOperator: null,
            firingDates: [],
            sorter: null,
            sortingDate: null,
            postFiringCondition: null,
            serviceApprovalDate: null,
            createdAt: "2026-08-06T08:30:00.000Z",
          };
          refractoryWagons.unshift(wagon);
          return new Response(JSON.stringify({ wagon }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ wagons: refractoryWagons }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (
        url.pathname.endsWith("/refractory-reports") &&
        init?.method === "POST"
      ) {
        submittedReport = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ report: {
          id: "firing-report-1",
          ...submittedReport,
          revisionNumber: 1,
          status: "pending",
          totals: {},
          masterDisplayName: "Иванов Иван Иванович",
          submittedAt: "2026-08-06T08:30:00.000Z",
        } }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
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
      ["ЦОШ", "Сводка по работе оборудования", "Вагоны"],
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
    const bankTable = rootElement.querySelector(".refractory-bank-table");
    assert.ok(bankTable);
    assert.deepEqual(
      Array.from(bankTable.querySelectorAll("thead th"), (cell) =>
        cell.textContent.trim().replace(/\s+/gu, " "),
      ),
      ["Показатель", "Банка I ШКИ", "Банка II ШКИ-66", "Банка III ШГР-28"],
    );
    assert.match(rootElement.textContent, /ШКИ-66/u);
    const chamotteOutputTable = rootElement.querySelector(
      ".refractory-input-table-cosh-output",
    );
    assert.ok(chamotteOutputTable);
    assert.deepEqual(
      Array.from(chamotteOutputTable.querySelectorAll("thead th"), (cell) =>
        cell.textContent.trim().replace(/\s+/gu, " "),
      ),
      ["Марка изделия", "Выпуск, т", ""],
    );
    const firstChamotteBrand = chamotteOutputTable.querySelector(
      'input[aria-label="Марка изделия, строка 1"]',
    );
    assert.deepEqual(readBrandOptions(firstChamotteBrand, rootElement), [
      "ША-22",
      "Смесь МК",
      "Гранулы 0-5",
    ]);
    assert.equal(chamotteOutputTable.querySelectorAll("tbody tr").length, 1);
    const addChamotteRow = rootElement.querySelector(
      'button[aria-label="Добавить строку выпуска шамота"]',
    );
    assert.ok(addChamotteRow);
    await React.act(async () => addChamotteRow.click());
    assert.equal(chamotteOutputTable.querySelectorAll("tbody tr").length, 2);
    assert.equal(
      bankTable.querySelectorAll('input[name^="jar.1."]:not([name$="Tons"])').length,
      4,
    );
    // Задача 103: пустая банка отмечается галочкой и заполняет все замеры
    // значением пустой банки из справочника, а не нулями.
    const emptyBankToggle = bankTable.querySelector(
      'input[aria-label="Банка I: банка пустая"]',
    );
    assert.ok(emptyBankToggle);
    await React.act(async () => emptyBankToggle.click());
    assert.deepEqual(
      Array.from(
        bankTable.querySelectorAll('input[name^="jar.1."]:not([name$="Tons"])'),
        (input) => input.value,
      ),
      ["15", "15", "15", "15"],
    );
    await React.act(async () => emptyBankToggle.click());
    for (const [name, value] of [
      ["jar.1.0", "0,1"],
      ["jar.1.loadedTons", "10"],
      ["jar.1.shippedTons", "4"],
    ]) {
      const input = bankTable.querySelector(`input[name="${name}"]`);
      assert.ok(input, name);
      await React.act(async () => {
        setNativeInputValue(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    }
    assert.deepEqual(
      Array.from(
        bankTable.querySelectorAll(".refractory-bank-mass-row td:nth-child(2) output"),
        (cell) => cell.textContent.replace(/\s/gu, " "),
      ),
      ["1 137,554", "906"],
    );
    assert.equal(rootElement.querySelector(".bank-measurement-add"), null);
    const coshMasterInput = rootElement.querySelector('input[name="coshMaster"]');
    assert.ok(coshMasterInput);
    assert.equal(coshMasterInput.value, "Иванов Иван Иванович");
    assert.deepEqual(readBrandOptions(coshMasterInput, rootElement), [
      "Иванов Иван Иванович",
      "Сидоров С.С.",
    ]);
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
      "Мастер ЦОШ",
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
    assert.equal(addBrandButtons.length, 0);
    assert.equal(
      formedBrand
        .closest(".production-brand-picker")
        ?.querySelector('button[aria-label="Добавить новую марку"]'),
      null,
    );
    assert.equal(formedBrand.value, "Старая марка");
    assert.equal(rootElement.querySelectorAll("form").length, 1);

    // «Обжиг/Сортировка» больше не отдельная кнопка сверху — она внутри
    // раздела «Вагоны», между «Оборот вагонов» и «Осмотр вагонов».
    await React.act(async () => menuButtons[2].click());
    const firingMenuButton = Array.from(
      rootElement.querySelectorAll(".refractory-wagon-journal-menu button"),
    ).find((button) => button.textContent?.includes("Обжиг/Сортировка"));
    assert.ok(firingMenuButton);
    await React.act(async () => firingMenuButton.click());
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
        "Дата обжига",
        "Обжигальщик",
        "Рассортированные вагоны",
        "Дата сортировки",
        "Сортировщик",
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
    // Марка изделия и вагоны для обжига больше не отдельные поля (задача 88):
    // марка приходит с вагона, а обжиг и сортировка используют один выбор.
    const sortingWagonsSelect = rootElement.querySelector(
      'select[aria-label="Рассортированные вагоны, строка 1"]',
    );
    await waitFor(
      React,
      () => sortingWagonsSelect?.querySelector('option[value="wagon-18"]') !== null,
    );
    assert.ok(sortingWagonsSelect);
    // Отработавший цикл В-16 в список этапа не попадает.
    assert.equal(
      sortingWagonsSelect.querySelector('option[value="wagon-16"]'),
      null,
    );
    await React.act(async () => {
      sortingWagonsSelect.querySelector('option[value="wagon-18"]').selected = true;
      sortingWagonsSelect.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
    });
    const submitFiringButton = Array.from(
      rootElement.querySelectorAll(".refractory-report-form button"),
    ).find((button) => button.textContent === "Отправить диспетчеру");
    assert.ok(submitFiringButton);
    await React.act(async () => submitFiringButton.click());
    assert.deepEqual(submittedReport.payload.rows[0].sortingWagons, [
      { id: "wagon-18" },
    ]);

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

    // «Обжиг/Сортировка» живёт внутри раздела «Вагоны», поэтому активной
    // остаётся сама кнопка «Вагоны», а не отдельная сменная таблица.
    assert.deepEqual(
      menuButtons.map((button) => button.classList.contains("is-active")),
      [false, false, true],
    );
    assert.ok(firingMenuButton.classList.contains("is-active"));
    const catalogMenuButton = Array.from(
      rootElement.querySelectorAll(".refractory-wagon-journal-menu button"),
    ).find((button) => button.textContent?.includes("Каталог вагонов"));
    assert.ok(catalogMenuButton);
    await React.act(async () => catalogMenuButton.click());
    await waitFor(
      React,
      () => rootElement.querySelector(
        ".refractory-wagon-catalog-table tbody tr",
      ) !== null,
    );
    const wagonJournalButtons = Array.from(
      rootElement.querySelectorAll(
        ".refractory-wagon-journal-menu .refractory-report-label",
      ),
      (label) => label.textContent,
    );
    assert.deepEqual(
      wagonJournalButtons,
      ["Каталог вагонов", "Оборот вагонов", "Обжиг/Сортировка", "Осмотр вагонов"],
    );
    const catalogRow = rootElement.querySelector(
      ".refractory-wagon-catalog-table tbody tr",
    );
    assert.ok(catalogRow);
    assert.deepEqual(
      Array.from(catalogRow.querySelectorAll("td"), (cell) => cell.textContent),
      ["В-16", "2", "Можно эксплуатировать"],
    );
    // Стиль таблиц вкладки Вагоны повторяет Обжиг/Сортировка: без внутренней
    // вертикальной прокрутки.
    assert.ok(
      catalogRow
        .closest(".refractory-table-wrap")
        ?.classList.contains("refractory-table-wrap-full-height"),
    );
    const turnoverButton = Array.from(
      rootElement.querySelectorAll(".refractory-wagon-journal-menu button"),
    ).find((button) => button.textContent?.includes("Оборот вагонов"));
    assert.ok(turnoverButton);
    await React.act(async () => turnoverButton.click());
    await waitFor(
      React,
      () => rootElement.querySelector(".refractory-wagon-journal") !== null,
    );
    // Открытый журнал снимает выделение со сменной таблицы, выбранной до него.
    assert.deepEqual(
      menuButtons.map((button) => button.classList.contains("is-active")),
      [false, false, true],
    );
    assert.match(rootElement.textContent, /В-16/u);
    const wagonTable = rootElement.querySelector(".refractory-wagon-table");
    assert.ok(wagonTable);
    assert.ok(
      wagonTable
        .closest(".refractory-table-wrap")
        ?.classList.contains("refractory-table-wrap-full-height"),
    );
    assert.deepEqual(
      Array.from(wagonTable.querySelectorAll("thead th"), (cell) =>
        cell.textContent.trim().replace(/\s+/gu, " "),
      ),
      [
        "№ вагона",
        "Дата садки",
        "Марка",
        "Дата пресса",
        "Кол-во шт.",
        "Садчик",
        "Прессовщик",
        "Дата контроля сырца",
        "Обжигальщик",
        "Даты обжига",
        "Сортировщик",
        "Дата сортировки",
        "Состояние вагона после обжига",
        "Дата осмотра",
      ],
    );
    assert.match(wagonTable.textContent, /06\.08\.2026; 06\.08\.2026/u);
    assert.match(wagonTable.textContent, /08\.08\.2026/u);

    // № вагона в Обороте вагонов — список первого этапа конвейера: годные
    // вагоны без садки. У В-16 и В-18 садка заполнена, поэтому список пуст.
    assert.deepEqual(
      Array.from(
        rootElement.querySelector('select[name="wagonNumber"]').options,
        (option) => option.value,
      ),
      [""],
    );
    // Обжигальщик, сортировщик, состояние и дата одобрения — производные поля.
    for (const derivedField of [
      "wagonFiringOperator",
      "wagonSorter",
      "wagonPostFiringCondition",
      "wagonServiceApprovalDate",
    ]) {
      assert.equal(
        rootElement.querySelector(`input[name="${derivedField}"]`),
        null,
      );
    }
    assert.ok(
      rootElement.querySelector('input[name="wagonSetter"]')
        .getAttribute("list"),
    );
    assert.ok(
      rootElement.querySelector('input[name="wagonPressOperator"]')
        .getAttribute("list"),
    );
    // Пока вагон не выбран, сохранять нечего.
    assert.equal(
      Array.from(
        rootElement.querySelectorAll(".refractory-wagon-form button"),
      ).find((button) => button.textContent === "Сохранить садку")
        .disabled,
      true,
    );

    // Новый номер вагона регистрируется только в Каталоге вагонов.
    const catalogButton = Array.from(
      rootElement.querySelectorAll(".refractory-wagon-journal-menu button"),
    ).find((button) => button.textContent?.includes("Каталог вагонов"));
    assert.ok(catalogButton);
    await React.act(async () => catalogButton.click());
    const catalogNumberInput = rootElement.querySelector(
      'input[name="wagonNumber"]',
    );
    assert.ok(catalogNumberInput);
    await React.act(async () => {
      setNativeInputValue(catalogNumberInput, "В-17");
      catalogNumberInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    const addWagonButton = Array.from(
      rootElement.querySelectorAll(".refractory-wagon-form button"),
    ).find((button) => button.textContent === "Добавить вагон");
    assert.ok(addWagonButton);
    await React.act(async () => addWagonButton.click());
    await waitFor(React, () => rootElement.textContent.includes("В-17"));
    assert.deepEqual(submittedWagon, {
      number: "В-17",
      loadingDate: null,
      productBrand: null,
      pressDate: null,
      pieceCount: null,
      setter: null,
      pressOperator: null,
    });

    // Заполнение оставшихся полей вагона идёт исправлением в Обороте вагонов.
    // Переход между журналами размонтирует форму, поэтому поля запрашиваются
    // заново после возврата.
    await React.act(async () => turnoverButton.click());
    await waitFor(
      React,
      () => rootElement.querySelector('select[name="wagonNumber"]')
        ?.querySelector('option[value="В-17"]') !== null,
    );
    const wagonNumberSelect = rootElement.querySelector(
      'select[name="wagonNumber"]',
    );
    await React.act(async () => {
      setNativeSelectValue(wagonNumberSelect, "В-17");
      wagonNumberSelect.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
    });
    const wagonLoadingDateInput = rootElement.querySelector(
      'input[name="wagonLoadingDate"]',
    );
    const wagonBrandInput = rootElement.querySelector(
      'input[aria-label="Марка вагона"]',
    );
    const wagonSetterInput = rootElement.querySelector(
      'input[name="wagonSetter"]',
    );
    const wagonPressOperatorInput = rootElement.querySelector(
      'input[name="wagonPressOperator"]',
    );
    const wagonPressDateInput = rootElement.querySelector(
      'input[name="wagonPressDate"]',
    );
    const wagonPieceCountInput = rootElement.querySelector(
      'input[name="wagonPieceCount"]',
    );
    assert.equal(wagonLoadingDateInput.value, "");
    // Вагон без садки открывает первый этап, а не исправление.
    const correctWagonButton = Array.from(
      rootElement.querySelectorAll(".refractory-wagon-form button"),
    ).find((button) => button.textContent === "Сохранить садку");
    assert.ok(correctWagonButton);
    assert.equal(correctWagonButton.disabled, false);
    await React.act(async () => {
      setNativeInputValue(wagonLoadingDateInput, "2026-08-06");
      wagonLoadingDateInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      setNativeInputValue(wagonBrandInput, "ШКУ-32");
      wagonBrandInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      setNativeInputValue(wagonSetterInput, "Сидоров С.С.");
      wagonSetterInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      setNativeInputValue(wagonPressOperatorInput, "Кузнецов К.К.");
      wagonPressOperatorInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      setNativeInputValue(wagonPressDateInput, "2026-08-05");
      wagonPressDateInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      setNativeInputValue(wagonPieceCountInput, "512");
      wagonPieceCountInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await React.act(async () => correctWagonButton.click());
    assert.deepEqual(correctedWagon, {
      number: "В-17",
      loadingDate: "2026-08-06",
      productBrand: "ШКУ-32",
      pressDate: "2026-08-05",
      pieceCount: 512,
      setter: "Сидоров С.С.",
      pressOperator: "Кузнецов К.К.",
    });
    // Сохранение сбрасывает форму: следующее исправление требует нового выбора.
    assert.equal(wagonNumberSelect.value, "");
    assert.equal(wagonSetterInput.value, "");
    assert.equal(wagonPressOperatorInput.value, "");
    assert.equal(wagonPressDateInput.value, "");
    assert.equal(wagonPieceCountInput.value, "");

    const editWagonButton = Array.from(
      rootElement.querySelectorAll(".refractory-wagon-edit-link"),
    ).find((button) => button.textContent === "В-17");
    assert.ok(editWagonButton);
    await React.act(async () => editWagonButton.click());
    // Заполненный вагон ушёл из списка садки, но его номер остаётся видимым в
    // поле, а форма переключается на исправление.
    assert.equal(wagonNumberSelect.value, "В-17");
    assert.equal(correctWagonButton.textContent, "Сохранить исправление");
    await React.act(async () => {
      setNativeInputValue(wagonLoadingDateInput, "2026-08-07");
      wagonLoadingDateInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await React.act(async () => correctWagonButton.click());
    assert.deepEqual(correctedWagon, {
      number: "В-17",
      loadingDate: "2026-08-07",
      productBrand: "ШКУ-32",
      pressDate: "2026-08-05",
      pieceCount: 512,
      setter: "Сидоров С.С.",
      pressOperator: "Кузнецов К.К.",
    });

    const inspectionButton = Array.from(
      rootElement.querySelectorAll(".refractory-wagon-journal-menu button"),
    ).find((button) => button.textContent?.includes("Осмотр вагонов"));
    assert.ok(inspectionButton);
    await React.act(async () => inspectionButton.click());
    await waitFor(
      React,
      () => rootElement.querySelector(
        'select[name="inspectionWagonId"]',
      ) !== null,
    );
    const inspectionWagonSelect = rootElement.querySelector(
      'select[name="inspectionWagonId"]',
    );
    await waitFor(
      React,
      () => inspectionWagonSelect.options.length > 1,
    );
    // В очередь осмотра попадает только рассортированный неодобренный вагон.
    assert.deepEqual(
      Array.from(inspectionWagonSelect.options, (option) => option.textContent),
      ["Выберите вагон", "В-16 · сортировка 08.08.2026"],
    );
    const inspectionConditionSelect = rootElement.querySelector(
      'select[name="inspectionCondition"]',
    );
    assert.deepEqual(
      Array.from(
        inspectionConditionSelect.options,
        (option) => option.textContent,
      ),
      ["Выберите действие", "Можно эксплуатировать", "В ремонт"],
    );
    await React.act(async () => {
      setNativeSelectValue(inspectionWagonSelect, "wagon-16");
      inspectionWagonSelect.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
      setNativeSelectValue(inspectionConditionSelect, "Можно эксплуатировать");
      inspectionConditionSelect.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
    });
    const inspectionApprovalDateInput = rootElement.querySelector(
      'input[name="inspectionApprovalDate"]',
    );
    // Дата одобрения подставляется сменной датой и остаётся исправляемой.
    assert.ok(inspectionApprovalDateInput.value);
    await React.act(async () => {
      setNativeInputValue(inspectionApprovalDateInput, "2026-08-12");
      inspectionApprovalDateInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    const saveInspectionButton = Array.from(
      rootElement.querySelectorAll(".refractory-wagon-form button"),
    ).find((button) => button.textContent === "Сохранить осмотр");
    assert.ok(saveInspectionButton);
    await React.act(async () => saveInspectionButton.click());
    await waitFor(React, () => submittedInspection !== undefined);
    assert.deepEqual(submittedInspection, {
      wagonId: "wagon-16",
      condition: "Можно эксплуатировать",
      approvalDate: "2026-08-12",
    });
    // Осмотренный вагон уходит из очереди и попадает в историю осмотров.
    assert.equal(inspectionWagonSelect.options.length, 1);
    const inspectionTable = rootElement.querySelector(
      ".refractory-wagon-inspection-table",
    );
    assert.match(inspectionTable?.textContent ?? "", /В-16/u);
    assert.ok(
      inspectionTable
        ?.closest(".refractory-table-wrap")
        ?.classList.contains("refractory-table-wrap-full-height"),
    );

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

test("refractory wagon save preserves rows loaded while the request is pending", () =>
  runRefractoryWagonSaveRace("load-first"));

test("refractory wagon save supersedes stale initial defaults", () =>
  runRefractoryWagonSaveRace("save-first"));

async function runRefractoryWagonSaveRace(responseOrder) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await loadViteServer("test");
  let resolveInitialLoad;
  let resolveSave;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") {
      return await new Promise((resolve) => {
        resolveSave = resolve;
      });
    }
    return await new Promise((resolve) => {
      resolveInitialLoad = resolve;
    });
  };

  try {
    const { RefractoryWagonCatalog } = await vite.ssrLoadModule(
      "/src/RefractoryWagonCatalog.tsx",
    );
    const rootElement = dom.window.document.querySelector("#root");
    const root = createRoot(rootElement);
    await React.act(async () => {
      root.render(React.createElement(RefractoryWagonCatalog, {
        isAdminPreviewMode: false,
        onShowToast() {},
      }));
    });
    await waitFor(React, () => typeof resolveInitialLoad === "function");

    const numberInput = rootElement.querySelector('input[name="wagonNumber"]');
    await React.act(async () => {
      setNativeInputValue(numberInput, "В-17");
      numberInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await React.act(async () => {
      rootElement.querySelector(".refractory-wagon-form").dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => typeof resolveSave === "function");

    const loadedWagon = {
      id: "wagon-16",
      number: "В-16",
      loadingDate: "2026-08-05",
      productBrand: "ШКУ-32",
      pressDate: null,
      pieceCount: null,
      setter: "Иванов И.И.",
      pressOperator: "Петров П.П.",
      rawControlDate: null,
      firingOperator: "Зайцев З.З.",
      firingDates: [],
      sorter: "Орлова О.О.",
      sortingDate: null,
      postFiringCondition: null,
      serviceApprovalDate: null,
      createdAt: "2026-08-05T08:00:00.000Z",
    };
    const initialLoadResponse = new Response(
      JSON.stringify({ wagons: [loadedWagon] }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
    const savedWagon = {
      id: "wagon-17",
      number: "В-17",
      loadingDate: null,
      productBrand: null,
      pressDate: null,
      pieceCount: null,
      setter: null,
      pressOperator: null,
      rawControlDate: null,
      firingOperator: null,
      firingDates: [],
      sorter: null,
      sortingDate: null,
      postFiringCondition: null,
      serviceApprovalDate: null,
      createdAt: "2026-08-06T08:30:00.000Z",
    };
    const saveResponse = new Response(JSON.stringify({ wagon: savedWagon }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
    });
    const finishInitialLoad = () => React.act(async () => {
      resolveInitialLoad(initialLoadResponse);
    });
    const finishSave = () => React.act(async () => {
      resolveSave(saveResponse);
    });
    if (responseOrder === "load-first") {
      await finishInitialLoad();
      await finishSave();
    } else {
      await finishSave();
      await finishInitialLoad();
    }

    // Ни один из откликов не должен вытеснить вагон, добавленный другим:
    // оба вагона остаются в каталоге независимо от порядка ответов.
    assert.deepEqual(
      Array.from(
        rootElement.querySelectorAll(
          ".refractory-wagon-catalog-table tbody tr td:first-child",
        ),
      ).map((cell) => cell.textContent),
      ["В-16", "В-17"],
    );
    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
}

function buildBankAssignment(bankNumber, materialLabel, density) {
  return {
    assignmentId: `assignment-${bankNumber}`,
    bankNumber,
    materialLabel,
    bulkDensityTonsPerCubicMeter: density,
    bulkDensitySource: "rotary_kiln_2_journal",
    bulkDensitySampleCount: 10,
    bulkDensityLatestRecordDate: "2026-08-16",
    assignedByDisplayName: "Лаборант",
    assignedAt: "2026-07-23T08:00:00.000Z",
  };
}

test("refractory correction can be cancelled without saving draft changes", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await loadViteServer("test");
  let postCount = 0;

  try {
    const { RefractoryShopWorkspace } = await vite.ssrLoadModule(
      "/src/RefractoryReports.tsx",
    );
    const approvedReport = {
      ...buildPendingReport(),
      status: "approved",
      payload: { kilnNumber: "1" },
    };
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (url.pathname.endsWith("/production-brands")) {
        return new Response(JSON.stringify({ labels: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname.endsWith("/refractory-reports/banks")) {
        return new Response(JSON.stringify({
          currentAssignments: [
            buildBankAssignment(1, "ШКИ", 1.16),
            buildBankAssignment(2, "ШКИ-66", 1.57),
            buildBankAssignment(3, "ШГР-28", 1.09),
          ],
          coshMasterOptions: ["Иванов Иван Иванович"],
          previousShipments: [],
          volumeReference: {
            points: [
              { heightMeters: 0, volumeCubicMeters: 100 },
              { heightMeters: 1, volumeCubicMeters: 90 },
            ],
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (init?.method === "POST") {
        postCount += 1;
      }
      return new Response(JSON.stringify({ reports: [approvedReport] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
      () => rootElement.querySelector(".refractory-state-approved") !== null,
    );

    const createCorrectionButton = Array.from(
      rootElement.querySelectorAll("button"),
    ).find((button) => button.textContent === "Создать исправление");
    assert.ok(createCorrectionButton);
    await React.act(async () => createCorrectionButton.click());

    const cancelButton = Array.from(
      rootElement.querySelectorAll(".refractory-form-actions button"),
    ).find((button) => button.textContent === "Отменить");
    assert.ok(cancelButton);
    const kilnNumberInput = rootElement.querySelector(
      'input[name="kilnNumber"]',
    );
    assert.ok(kilnNumberInput);
    assert.equal(kilnNumberInput.closest("fieldset")?.disabled, false);
    setNativeInputValue(kilnNumberInput, "2");

    await React.act(async () => cancelButton.click());

    const restoredKilnNumberInput = rootElement.querySelector(
      'input[name="kilnNumber"]',
    );
    assert.ok(restoredKilnNumberInput);
    assert.equal(restoredKilnNumberInput.value, "1");
    assert.equal(restoredKilnNumberInput.closest("fieldset")?.disabled, true);
    assert.equal(postCount, 0);
    assert.ok(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent === "Создать исправление",
      ),
    );
    assert.equal(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent === "Отменить",
      ),
      false,
    );

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
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
  const vite = await loadViteServer("test");

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
  const vite = await loadViteServer("test");

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
          dispatcherFeed: {
            status: "loading",
            message: "Загружаем историю.",
          },
          dispatcherFeedFilters: {
            group: "equipment",
            period: "custom",
            dateFrom: "",
            dateTo: "",
            incidentView: "period",
          },
          onDispatcherFeedFiltersChange() {},
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
  const vite = await loadViteServer("test");

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

function setNativeSelectValue(select, value) {
  const setter = Object.getOwnPropertyDescriptor(
    select.ownerDocument.defaultView.HTMLSelectElement.prototype,
    "value",
  )?.set;

  setter.call(select, value);
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
