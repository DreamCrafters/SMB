import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDispatcherFeedDateRange,
  buildEquipmentDetailRows,
  buildEquipmentSummaryRows,
  buildIncidentSummaryRows,
  buildOwnerDispatcherOverview,
  buildOpenIncidentOptions,
  buildOpenVisitorOptions,
  buildProductionMonthOverview,
  buildProductionReportTables,
  buildVisitorVisitRows,
  filterProductionReportTables,
} from "../.test-build/src/services/dispatcherFeedViews.js";

test("buildDispatcherFeedDateRange builds current incomplete periods", () => {
  const currentDate = new Date(2026, 6, 15, 12, 0, 0);

  assert.deepEqual(buildDispatcherFeedDateRange("today", currentDate), {
    dateFrom: "2026-07-15",
    dateTo: "2026-07-15",
  });
  assert.deepEqual(buildDispatcherFeedDateRange("current_month", currentDate), {
    dateFrom: "2026-07-01",
    dateTo: "2026-07-15",
  });
  assert.deepEqual(buildDispatcherFeedDateRange("current_year", currentDate), {
    dateFrom: "2026-01-01",
    dateTo: "2026-07-15",
  });
  assert.deepEqual(buildDispatcherFeedDateRange("custom", currentDate), {});
});

test("buildEquipmentSummaryRows aggregates production, downtime, and reasons", () => {
  const rows = buildEquipmentSummaryRows(
    [
      buildSubmission("eq-1", "equipment", {
        reportDate: "01.07.2026",
        equipment: "Пресс №1",
        productionTons: "10.5",
        downtimeHours: "2",
        downtimeReason: "Резерв",
      }),
      buildSubmission("eq-2", "equipment", {
        reportDate: "02.07.2026",
        equipment: "Пресс №1",
        productionTons: "3",
        downtimeHours: "1",
        downtimeReason: "Резерв",
      }),
    ],
    {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    },
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].equipment, "Пресс №1");
  assert.equal(rows[0].productionTons, 13.5);
  assert.equal(rows[0].downtimeHours, 3);
  assert.deepEqual(rows[0].downtimeReasons, [
    {
      reason: "Резерв",
      hours: 3,
    },
  ]);
});

test("buildEquipmentDetailRows lists selected equipment rows by report date", () => {
  const rows = buildEquipmentDetailRows(
    [
      buildSubmission(
        "press-2-first",
        "equipment",
        {
          reportDate: "01.07.2026",
          equipment: "Пресс №2",
          productionTons: "10",
          downtimeHours: "2",
          downtimeReason: "Резерв",
          note: "Утро",
        },
        "2026-07-01T08:00:00.000Z",
      ),
      buildSubmission(
        "press-2-second",
        "equipment",
        {
          reportDate: "01.07.2026",
          equipment: "Пресс №2",
          productionTons: "5",
          downtimeHours: "1",
          downtimeReason: "Резерв",
          note: "Вечер",
        },
        "2026-07-01T20:00:00.000Z",
      ),
      buildSubmission(
        "press-2-next-day",
        "equipment",
        {
          reportDate: "03.07.2026",
          equipment: "Пресс №2",
          productionTons: "7",
          downtimeHours: "4",
          downtimeReason: "Простой по мех, эл. части",
        },
        "2026-07-03T18:00:00.000Z",
      ),
      buildSubmission("press-1", "equipment", {
        reportDate: "03.07.2026",
        equipment: "Пресс №1",
        productionTons: "99",
      }),
      buildSubmission("press-2-outside-period", "equipment", {
        reportDate: "10.07.2026",
        equipment: "Пресс №2",
        productionTons: "99",
      }),
    ],
    "Пресс №2",
    {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-08",
    },
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].reportDate, "2026-07-01");
  assert.equal(rows[0].productionTons, 15);
  assert.equal(rows[0].downtimeHours, 3);
  assert.equal(rows[0].receivedAt, "2026-07-01T20:00:00.000Z");
  assert.equal(rows[0].submissionCount, 2);
  assert.deepEqual(rows[0].downtimeReasons, [
    {
      reason: "Резерв",
      hours: 3,
    },
  ]);
  assert.deepEqual(rows[0].notes, ["Утро", "Вечер"]);
  assert.equal(rows[1].reportDate, "2026-07-03");
  assert.equal(rows[1].productionTons, 7);
  assert.equal(rows[1].downtimeHours, 4);
  assert.deepEqual(rows[1].downtimeReasons, [
    {
      reason: "Простой по мех, эл. части",
      hours: 4,
    },
  ]);
});

test("buildProductionReportTables calculates monthly forming and sorting values", () => {
  const tables = buildProductionReportTables(
    [
      buildSubmission(
        "production-july-1",
        "production",
        {
          reportDate: "01.07.2026",
          formingPlan: "10",
          formingDay: "8",
          sortingPlan: "6",
          sortingDay: "5",
        },
        "2026-07-01T18:00:00.000Z",
      ),
      buildSubmission(
        "production-july-2-stale",
        "production",
        {
          reportDate: "2026-07-02",
          formingPlan: "100",
          formingDay: "100",
          sortingPlan: "100",
          sortingDay: "100",
        },
        "2026-07-02T17:00:00.000Z",
      ),
      buildSubmission(
        "production-july-2-latest",
        "production",
        {
          reportDate: "02.07.2026",
          formingPlan: "10",
          formingDay: "11",
          formingProductBrand: "ФЛ-2",
          sortingPlan: "6",
          sortingDay: "7",
          sortingProductBrand: "СО-2",
        },
        "2026-07-02T18:00:00.000Z",
      ),
      buildSubmission("equipment-row", "equipment", {
        reportDate: "02.07.2026",
        productionTons: "99",
      }),
      buildSubmission(
        "production-june",
        "production",
        {
          reportDate: "30.06.2026",
          formingPlan: "50",
          formingDay: "50",
        },
        "2026-06-30T18:00:00.000Z",
      ),
    ],
    {
      dateFrom: "2026-07-02",
      dateTo: "2026-07-31",
    },
  );

  assert.deepEqual(tables.forming, [
    {
      reportId: "production-july-2-latest",
      reportDate: "2026-07-02",
      brand: "ФЛ-2",
      dayPlan: 10,
      dayFact: 11,
      monthPlan: 20,
      monthFact: 19,
      deviation: -1,
      receivedAt: "2026-07-02T18:00:00.000Z",
    },
  ]);
  assert.deepEqual(tables.sorting, [
    {
      reportId: "production-july-2-latest",
      reportDate: "2026-07-02",
      brand: "СО-2",
      dayPlan: 6,
      dayFact: 7,
      monthPlan: 12,
      monthFact: 12,
      deviation: 0,
      receivedAt: "2026-07-02T18:00:00.000Z",
    },
  ]);
});

test("filterProductionReportTables keeps server-calculated monthly totals", () => {
  const tables = buildProductionReportTables(
    [
      buildSubmission("production-1", "production", {
        reportDate: "01.07.2026",
        formingPlan: "10",
        formingDay: "8",
      }),
      buildSubmission("production-2", "production", {
        reportDate: "02.07.2026",
        formingPlan: "10",
        formingDay: "11",
      }),
    ],
    {},
  );
  const filtered = filterProductionReportTables(tables, {
    dateFrom: "2026-07-02",
    dateTo: "2026-07-02",
  });

  assert.equal(filtered.forming.length, 1);
  assert.equal(filtered.forming[0].reportDate, "2026-07-02");
  assert.equal(filtered.forming[0].monthPlan, 20);
  assert.equal(filtered.forming[0].monthFact, 19);
});

test("buildProductionMonthOverview mirrors the server total in local test mode", () => {
  const tables = buildProductionReportTables(
    [
      buildSubmission("production-july-1", "production", {
        reportDate: "01.07.2026",
        formingDay: "8",
        sortingDay: "5",
        unformedBrand1: "ПБ-5",
        unformedFact1: "2",
        chamotteBrand1: "Ш-1",
        chamotteFact1: "3",
        granulationFraction1630Day: "50",
      }),
      buildSubmission("production-july-2", "production", {
        reportDate: "02.07.2026",
        formingDay: "11",
        sortingDay: "7",
        unformedBrand1: "ПБ-5",
        unformedFact1: "5",
        chamotteBrand1: "Ш-1",
        chamotteFact1: "5",
        granulationFraction1630Day: "70",
      }),
    ],
    {},
  );

  assert.deepEqual(
    buildProductionMonthOverview(
      tables,
      new Date("2026-07-18T12:00:00.000Z"),
    ),
    {
      month: "2026-07",
      totalFact: 46,
    },
  );
});

test("buildProductionReportTables groups unformed products and chamotte by brand", () => {
  const tables = buildProductionReportTables(
    [
      buildSubmission("production-july-1", "production", {
        reportDate: "01.07.2026",
        unformedBrand1: "ПБ-5",
        unformedPlan1: "3",
        unformedFact1: "2",
        chamotteBrand1: "Ш-1",
        chamottePlan1: "4",
        chamotteFact1: "3",
      }),
      buildSubmission("production-july-2", "production", {
        reportDate: "02.07.2026",
        unformedBrand1: " пб-5 ",
        unformedPlan1: "2",
        unformedFact1: "3",
        unformedBrand2: "ПБ-6",
        unformedPlan2: "2",
        unformedFact2: "1",
        unformedBrand3: "ПБ-5",
        unformedPlan3: "1",
        unformedFact3: "1",
        chamotteBrand1: "Ш-1",
        chamottePlan1: "4",
        chamotteFact1: "5",
      }),
    ],
    {
      dateFrom: "2026-07-02",
      dateTo: "2026-07-31",
    },
  );

  assert.deepEqual(tables.unformed, [
    {
      reportId: "production-july-2",
      reportDate: "2026-07-02",
      facts: [
        { brand: "ПБ-5", value: 4, monthValue: 6 },
        { brand: "ПБ-6", value: 1, monthValue: 1 },
      ],
      dayPlan: 5,
      dayFact: 5,
      monthPlan: 8,
      monthFact: 7,
      deviation: -1,
      receivedAt: "2026-07-04T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(tables.chamotte, [
    {
      reportId: "production-july-2",
      reportDate: "2026-07-02",
      facts: [{ brand: "Ш-1", value: 5, monthValue: 8 }],
      dayPlan: 4,
      dayFact: 5,
      monthPlan: 8,
      monthFact: 8,
      deviation: 0,
      receivedAt: "2026-07-04T00:00:00.000Z",
    },
  ]);
});

test("buildProductionReportTables calculates jar consumption and granulation month totals", () => {
  const tables = buildProductionReportTables(
    [
      buildSubmission("production-july-1", "production", {
        reportDate: "01.07.2026",
        granulationFraction1600Day: "1.5",
        granulationSamplesDay: "2",
      }),
      buildSubmission("production-july-2", "production", {
        reportDate: "02.07.2026",
        jarStart1: "120",
        jarEnd1: "95",
        jarStart2: "80",
        jarEnd3: "10",
        granulationPlatesInOperation: "2",
        granulationMillHours: "7.5",
        granulationFraction1630Day: "2.5",
        granulationFraction1218Day: "3",
      }),
    ],
    {
      dateFrom: "2026-07-02",
      dateTo: "2026-07-31",
    },
  );

  assert.deepEqual(tables.jars, [
    {
      reportId: "production-july-2",
      reportDate: "2026-07-02",
      jarNumber: 1,
      start: 120,
      end: 95,
      consumption: 25,
      receivedAt: "2026-07-04T00:00:00.000Z",
    },
    {
      reportId: "production-july-2",
      reportDate: "2026-07-02",
      jarNumber: 2,
      start: 80,
      end: undefined,
      consumption: undefined,
      receivedAt: "2026-07-04T00:00:00.000Z",
    },
    {
      reportId: "production-july-2",
      reportDate: "2026-07-02",
      jarNumber: 3,
      start: undefined,
      end: 10,
      consumption: undefined,
      receivedAt: "2026-07-04T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(tables.granulation, [
    {
      reportId: "production-july-2",
      reportDate: "2026-07-02",
      platesInOperation: 2,
      millHours: 7.5,
      fraction1630Day: 2.5,
      fraction1630Month: 4,
      fraction1218Day: 3,
      fraction1218Month: 5,
      receivedAt: "2026-07-04T00:00:00.000Z",
    },
  ]);
});

test("buildIncidentSummaryRows keeps incidents not closed before range start", () => {
  const rows = buildIncidentSummaryRows(
    [
      buildSubmission("inc-1", "incident", {
        incidentNumber: "INC-2026-1",
        datetime: "30.06.2026 10:00",
        location: "Цех 1",
      }),
      buildSubmission("close-1", "incident_close", {
        incidentNumber: "INC-2026-1",
        closureDateTime: "02.07.2026 10:00",
        approvedBy: "Начальник",
      }),
      buildSubmission("inc-2", "incident", {
        incidentNumber: "INC-2026-2",
        datetime: "20.06.2026 10:00",
      }),
      buildSubmission("close-2", "incident_close", {
        incidentNumber: "INC-2026-2",
        closureDateTime: "25.06.2026 10:00",
      }),
    ],
    {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    },
  );

  assert.deepEqual(
    rows.map((row) => row.incidentNumber),
    ["INC-2026-1"],
  );
  assert.equal(rows[0].status, "closed");
});

test("buildIncidentSummaryRows can show every unclosed incident regardless of age", () => {
  const rows = buildIncidentSummaryRows(
    [
      buildSubmission("inc-old-open", "incident", {
        incidentNumber: "INC-2025-1",
        datetime: "10.12.2025 10:00",
      }),
      buildSubmission("inc-closed", "incident", {
        incidentNumber: "INC-2026-1",
        datetime: "01.07.2026 10:00",
      }),
      buildSubmission("close-1", "incident_close", {
        incidentNumber: "INC-2026-1",
        closureDateTime: "02.07.2026 10:00",
      }),
      buildSubmission("inc-current-open", "incident", {
        incidentNumber: "INC-2026-2",
        datetime: "15.07.2026 10:00",
      }),
    ],
    {},
    "open",
  );

  assert.deepEqual(
    rows.map((row) => row.incidentNumber),
    ["INC-2026-2", "INC-2025-1"],
  );
  assert.ok(rows.every((row) => row.status === "open"));
});

test("incident helpers list only unclosed incidents", () => {
  const submissions = [
    buildSubmission("inc-1", "incident", {
      incidentNumber: "INC-2026-1",
      datetime: "04.07.2026 09:10",
      location: "Цех 1",
      incidentType: "Поломка оборудования по мех. части",
    }),
    buildSubmission("close-1", "incident_close", {
      incidentNumber: "INC-2026-1",
      closureDateTime: "04.07.2026 12:00",
    }),
    buildSubmission("inc-2", "incident", {
      incidentNumber: "INC-2026-2",
      datetime: "04.07.2026 13:00",
      criticality: "Высокий",
    }),
    buildSubmission("inc-old", "incident", {
      incidentNumber: "INC-2026-OLD",
      datetime: "03.07.2026 18:00",
      location: "Цех 2",
    }),
    buildSubmission("inc-other", "incident", {
      incidentNumber: "INC-2026-OTHER",
    }),
  ];

  const options = buildOpenIncidentOptions(submissions);

  assert.deepEqual(
    options.map((incident) => incident.incidentNumber),
    ["INC-2026-OTHER", "INC-2026-2", "INC-2026-OLD"],
  );
  assert.match(options[1].label, /INC-2026-2/);
  assert.match(options[1].label, /Высокий/);
  assert.match(options[2].label, /INC-2026-OLD/);
});

test("visitor helpers list open visitors and daily visits", () => {
  const entry = buildSubmission("visit-1", "visitor", {
    fio: "Иван Иванов",
    organization: "ООО Ромашка",
    whom: "Отдел снабжения",
    entryAt: "04.07.2026 09:10",
  });
  const submissions = [
    entry,
    buildSubmission("visit-exit-1", "visitor_exit", {
      visitorEntryId: "visit-1",
      fio: "Иван Иванов",
      organization: "ООО Ромашка",
      exitAt: "04.07.2026 12:00",
    }),
    buildSubmission("visit-2", "visitor", {
      fio: "Пётр Петров",
      entryAt: "04.07.2026 13:00",
    }),
  ];

  assert.deepEqual(
    buildOpenVisitorOptions(submissions).map((visitor) => visitor.fio),
    ["Пётр Петров"],
  );

  const rows = buildVisitorVisitRows(submissions, {
    dateFrom: "2026-07-04",
    dateTo: "2026-07-04",
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].exitAt, "04.07.2026 12:00");
  assert.equal(rows[1].exitAt, undefined);
});

test("visitor helpers close entries when exit has the same received timestamp", () => {
  const entry = buildSubmission("visit-1", "visitor", {
    fio: "Иван Иванов",
    organization: "ООО Ромашка",
    entryAt: "04.07.2026 09:10",
  });
  const exit = buildSubmission("visit-exit-1", "visitor_exit", {
    visitorEntryId: "visit-1",
    fio: "Иван Иванов",
    organization: "ООО Ромашка",
    exitAt: "04.07.2026 09:15",
  });
  const submissions = [exit, entry];

  assert.deepEqual(buildOpenVisitorOptions(submissions), []);

  const rows = buildVisitorVisitRows(submissions, {
    dateFrom: "2026-07-04",
    dateTo: "2026-07-04",
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].exitAt, "04.07.2026 09:15");
});

test("buildVisitorVisitRows supports ranges and an empty all-time range", () => {
  const submissions = [
    buildSubmission("visit-june", "visitor", {
      fio: "Июньский посетитель",
      entryAt: "30.06.2026 16:40",
    }),
    buildSubmission("visit-july-first", "visitor", {
      fio: "Первый июльский посетитель",
      entryAt: "03.07.2026 09:10",
    }),
    buildSubmission("visit-july-second", "visitor", {
      fio: "Второй июльский посетитель",
      entryAt: "04.07.2026 13:20",
    }),
  ];

  assert.deepEqual(
    buildVisitorVisitRows(submissions, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    }).map((visitor) => visitor.fio),
    ["Первый июльский посетитель", "Второй июльский посетитель"],
  );
  assert.equal(buildVisitorVisitRows(submissions, {}).length, 3);
});

test("visitor open options can be limited to entries from one day", () => {
  const submissions = [
    buildSubmission("visit-today", "visitor", {
      fio: "Сегодняшний посетитель",
      entryAt: "04.07.2026 09:10",
    }),
    buildSubmission("visit-yesterday", "visitor", {
      fio: "Вчерашний посетитель",
      entryAt: "03.07.2026 16:40",
    }),
  ];

  assert.deepEqual(
    buildOpenVisitorOptions(submissions, "2026-07-04").map(
      (visitor) => visitor.fio,
    ),
    ["Сегодняшний посетитель"],
  );
});

test("buildOwnerDispatcherOverview summarizes latest dispatcher statuses", () => {
  const submissions = [
    buildSubmission(
      "eq-old",
      "equipment",
      {
        reportDate: "07.07.2026",
        equipment: "Пресс №1",
        productionTons: "0",
      },
      "2026-07-07T16:00:00.000Z",
    ),
    ...[
      ["Пресс №1", "12"],
      ["Пресс №2", "9"],
      ["Пресс №3", "8"],
      ["Пресс №4", "0"],
      ["Бегуны №1", "0"],
      ["Дезинтегратор №2", "5"],
      ["Сушильный №2", "7"],
      ["Шаровая №1", "3"],
      ["Шаровая №2", "0"],
    ].map(([equipment, productionTons], index) =>
      buildSubmission(
        `eq-latest-${index}`,
        "equipment",
        {
          reportDate: "08.07.2026",
          equipment,
          productionTons,
        },
        "2026-07-08T16:00:00.000Z",
      ),
    ),
    buildSubmission(
      "inc-1",
      "incident",
      {
        datetime: "08.07.2026 20:48",
        location: "Склад готовой продукции",
        incidentType: "Травма",
        description: "сломался палец",
        criticality: "Высокий",
        responsible: "тест",
        immediateActions: "забинтовали",
        incidentStatus: "Новый",
        incidentNumber: "INC-2026-16",
      },
      "2026-07-08T16:10:00.000Z",
    ),
    buildSubmission(
      "close-1",
      "incident_close",
      {
        incidentNumber: "INC-2026-16",
        rootCauses: "нарушение инструкции",
        preventiveMeasures: "зачитали инструкцию по ТБ",
        closureDateTime: "08.07.2026 20:50",
        costs: "0",
        approvedBy: "Фридман",
        closureNote: "",
        incidentStatus: "Закрыт",
      },
      "2026-07-08T16:15:00.000Z",
    ),
    buildSubmission(
      "visit-1",
      "visitor",
      {
        fio: "Посетитель 1",
        whom: "Фридману",
        entryAt: "08.07.2026 09:00",
      },
      "2026-07-08T04:00:00.000Z",
    ),
    buildSubmission(
      "visit-1-exit",
      "visitor_exit",
      {
        visitorEntryId: "visit-1",
        exitAt: "08.07.2026 10:00",
      },
      "2026-07-08T05:00:00.000Z",
    ),
    buildSubmission(
      "visit-2",
      "visitor",
      {
        fio: "Посетитель 2",
        whom: "Глушкову",
        entryAt: "08.07.2026 11:00",
      },
      "2026-07-08T06:00:00.000Z",
    ),
    buildSubmission(
      "visit-2-exit",
      "visitor_exit",
      {
        visitorEntryId: "visit-2",
        exitAt: "08.07.2026 12:00",
      },
      "2026-07-08T07:00:00.000Z",
    ),
    buildSubmission(
      "visit-3",
      "visitor",
      {
        fio: "Посетитель 3",
        whom: "Матвеевой",
        entryAt: "08.07.2026 13:00",
      },
      "2026-07-08T08:00:00.000Z",
    ),
    buildSubmission(
      "visit-4",
      "visitor",
      {
        fio: "Посетитель 4",
        whom: "Фридману",
        entryAt: "08.07.2026 14:00",
      },
      "2026-07-08T09:00:00.000Z",
    ),
  ];

  const overview = buildOwnerDispatcherOverview(submissions, {
    month: "2026-07",
    totalFact: 46,
  });

  assert.deepEqual(overview.production, { month: "2026-07", totalFact: 46 });
  assert.equal(overview.equipment?.updatedAt, "2026-07-08T16:00:00.000Z");
  assert.equal(overview.equipment?.reportDate, "2026-07-08");
  assert.deepEqual(overview.equipment?.workingCounts, [
    {
      key: "press",
      label: "Прессов",
      count: 3,
    },
    {
      key: "runner",
      label: "Бегунов",
      count: 0,
    },
    {
      key: "disintegrator",
      label: "Дезинтегратор",
      count: 1,
    },
    {
      key: "dryer",
      label: "Сушильный",
      count: 1,
    },
    {
      key: "ball_mill",
      label: "Шаровая",
      count: 1,
    },
  ]);
  assert.equal(overview.latestIncident?.incidentNumber, "INC-2026-16");
  assert.equal(overview.latestIncident?.location, "Склад готовой продукции");
  assert.equal(overview.latestIncidentClosure?.incidentType, "Травма");
  assert.equal(
    overview.latestIncidentClosure?.location,
    "Склад готовой продукции",
  );
  assert.equal(overview.latestIncidentClosure?.approvedBy, "Фридман");
  assert.equal(overview.visitors.latestDate, "2026-07-08");
  assert.equal(overview.visitors.count, 4);
  assert.deepEqual(overview.visitors.hosts, [
    "Фридману",
    "Глушкову",
    "Матвеевой",
  ]);
  assert.equal(overview.visitors.openCount, 2);
});

function buildSubmission(
  id,
  formId,
  payload,
  receivedAt = "2026-07-04T00:00:00.000Z",
) {
  return {
    id,
    formId,
    formTitle: formId,
    payload,
    summary: id,
    status: "received",
    submittedByAccountId: "dispatcher",
    submittedAt: "2026-07-04T00:00:00.000Z",
    receivedAt,
  };
}
