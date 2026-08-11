import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDispatcherFeedDateRange,
  buildEquipmentDetailRows,
  buildEquipmentSummaryRows,
  buildIncidentSummaryRows,
  buildLocalProductionReportTableTotals,
  buildOwnerDispatcherOverview,
  buildOpenIncidentOptions,
  buildOpenIncidentRows,
  buildOpenIncidentSummaries,
  buildOpenVisitorOptions,
  buildProductionMonthOverview,
  buildProductionReportTables,
  buildVisitorVisitRows,
  filterProductionBrandCategoryRows,
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
          formingBrand1: "ФЛ-2",
          formingFact1: "6",
          formingBrand2: "ФЛ-3",
          formingFact2: "5",
          sortingPlan: "6",
          sortingBrand1: "СО-1",
          sortingFact1: "3",
          sortingBrand2: "СО-2",
          sortingFact2: "4",
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
      facts: [
        { brand: "ФЛ-2", value: 6, monthValue: 6 },
        { brand: "ФЛ-3", value: 5, monthValue: 5 },
      ],
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
      facts: [
        { brand: "СО-1", value: 3, monthValue: 3 },
        { brand: "СО-2", value: 4, monthValue: 4 },
      ],
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

test("local production totals mirror the server rules for the visible range", () => {
  const totals = buildLocalProductionReportTableTotals(
    {
      forming: [
        {
          reportId: "hidden",
          reportDate: "2026-07-01",
          receivedAt: "2026-07-01T18:00:00.000Z",
          facts: [],
          dayPlan: 95,
          dayFact: 93.37,
          monthPlan: 380,
          monthFact: 311.73,
          deviation: -68.27,
        },
        {
          reportId: "visible-without-plan",
          reportDate: "2026-07-02",
          receivedAt: "2026-07-02T18:00:00.000Z",
          facts: [],
          dayFact: 0,
          monthPlan: 475,
          monthFact: 311.73,
          deviation: -163.27,
        },
        {
          reportId: "visible-latest",
          reportDate: "2026-07-03",
          receivedAt: "2026-07-03T18:00:00.000Z",
          facts: [],
          dayPlan: 95,
          dayFact: 82.16,
          monthPlan: 570,
          monthFact: 393.89,
          deviation: -176.11,
        },
      ],
      sorting: [],
      unformed: [],
      chamotte: [],
      jars: [],
      granulation: [],
    },
    { dateFrom: "2026-07-02", dateTo: "2026-07-03" },
  );

  assert.deepEqual(totals.forming, {
    rowCount: 2,
    dayPlan: 95,
    dayFact: 82.16,
    monthPlan: 570,
    monthFact: 393.89,
    deviation: -176.11,
  });
  assert.equal(totals.sorting.rowCount, 0);
  assert.equal(totals.sorting.dayPlan, undefined);
});

test("buildProductionMonthOverview mirrors server month and today values locally", () => {
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
      new Date("2026-07-02T12:00:00.000Z"),
    ),
    {
      month: "2026-07",
      totalFact: 46,
      forming: { monthFact: 19, todayFact: 11 },
      sorting: { monthFact: 12, todayFact: 7 },
      unformed: { monthFact: 7, todayFact: 5 },
      chamotte: { monthFact: 8, todayFact: 5 },
      granulation: { monthFact: 120, todayFact: 70 },
    },
  );
});

test("buildProductionMonthOverview starts a new Moscow month with zero values locally", () => {
  const tables = buildProductionReportTables([
    buildSubmission("production-july", "production", {
      reportDate: "31.07.2026",
      formingDay: "8",
    }),
  ], {});

  assert.deepEqual(
    buildProductionMonthOverview(
      tables,
      new Date("2026-07-31T22:30:00.000Z"),
    ),
    {
      month: "2026-08",
      totalFact: 0,
      forming: { monthFact: 0, todayFact: 0 },
      sorting: { monthFact: 0, todayFact: 0 },
      unformed: { monthFact: 0, todayFact: 0 },
      chamotte: { monthFact: 0, todayFact: 0 },
      granulation: { monthFact: 0, todayFact: 0 },
    },
  );
});

test("forming brand filter removes unrelated facts from mixed report rows", () => {
  const [row] = filterProductionBrandCategoryRows([
    {
      reportId: "production-july-2",
      reportDate: "2026-07-02",
      receivedAt: "2026-07-02T18:00:00.000Z",
      facts: [
        { brand: "МКР-1", value: 4, monthValue: 10 },
        { brand: "МКР-2", value: 7, monthValue: 15 },
      ],
      dayPlan: 20,
      dayFact: 11,
      monthPlan: 40,
      monthFact: 25,
      deviation: -15,
    },
  ], "мкр-2");

  assert.deepEqual(row, {
    reportId: "production-july-2",
    reportDate: "2026-07-02",
    receivedAt: "2026-07-02T18:00:00.000Z",
    facts: [{ brand: "МКР-2", value: 7, monthValue: 15 }],
    dayFact: 7,
    monthFact: 15,
  });
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

test("buildOpenIncidentRows shows every unclosed incident of the server list", () => {
  const rows = buildOpenIncidentRows([
    {
      incidentNumber: "INC-2026-2",
      openedAt: "15.07.2026 10:00",
      location: "Цех 1",
      description: "Описание",
    },
    {
      incidentNumber: "INC-2025-1",
      openedAt: "10.12.2025 10:00",
    },
  ]);

  assert.deepEqual(
    rows.map((row) => row.incidentNumber),
    ["INC-2026-2", "INC-2025-1"],
  );
  assert.ok(rows.every((row) => row.status === "open"));
  assert.equal(rows[0].location, "Цех 1");
  assert.equal(rows[0].description, "Описание");
  assert.equal(rows[1].closedAt, undefined);
});

test("incident helpers list only unclosed incidents by newest opening date", () => {
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
    buildSubmission(
      "inc-2",
      "incident",
      {
        incidentNumber: "INC-2026-2",
        datetime: "01.08.2026 13:00",
        criticality: "Высокий",
      },
      "2026-08-01T08:00:00.000Z",
    ),
    buildSubmission(
      "inc-old",
      "incident",
      {
        incidentNumber: "INC-2026-OLD",
        datetime: "31.07.2026 18:00",
        location: "Цех 2",
      },
      "2026-07-31T13:00:00.000Z",
    ),
    buildSubmission(
      "inc-other",
      "incident",
      {
        incidentNumber: "INC-2026-OTHER",
      },
      "2026-07-30T08:00:00.000Z",
    ),
  ];

  const options = buildOpenIncidentOptions(
    buildOpenIncidentSummaries(submissions),
  );

  assert.deepEqual(
    options.map((incident) => incident.incidentNumber),
    ["INC-2026-2", "INC-2026-OLD", "INC-2026-OTHER"],
  );
  assert.match(options[0].label, /INC-2026-2/);
  assert.match(options[0].label, /Высокий/);
  assert.match(options[1].label, /INC-2026-OLD/);
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

test("visitor overview closes a legacy entry when an exit contains a stale link", () => {
  const submissions = [
    buildSubmission("visit-current", "visitor", {
      fio: "Иван Иванов",
      organization: "ООО Ромашка",
      entryAt: "04.07.2026 09:10",
    }),
    buildSubmission("visit-exit", "visitor_exit", {
      visitorEntryId: "legacy-missing-entry",
      fio: "Иван Иванов",
      organization: "ООО Ромашка",
      exitAt: "04.07.2026 12:00",
    }),
  ];

  assert.equal(
    buildOwnerDispatcherOverview(submissions).visitors.openCount,
    0,
  );
  assert.deepEqual(buildOpenVisitorOptions(submissions), []);
});

test("buildVisitorVisitRows sorts completed visits by exit time descending", () => {
  const submissions = [
    buildSubmission("visit-july", "visitor", {
      fio: "Июльский посетитель",
      entryAt: "31.07.2026 08:00",
    }),
    buildSubmission("visit-july-exit", "visitor_exit", {
      visitorEntryId: "visit-july",
      fio: "Июльский посетитель",
      exitAt: "31.07.2026 12:00",
    }),
    buildSubmission("visit-august", "visitor", {
      fio: "Августовский посетитель",
      entryAt: "01.08.2026 08:00",
    }),
    buildSubmission("visit-august-exit", "visitor_exit", {
      visitorEntryId: "visit-august",
      fio: "Августовский посетитель",
      exitAt: "01.08.2026 09:00",
    }),
    buildSubmission("visit-open", "visitor", {
      fio: "Посетитель без выхода",
      entryAt: "02.08.2026 08:00",
    }),
  ];

  assert.deepEqual(
    buildVisitorVisitRows(submissions, {}).map((visitor) => visitor.entryId),
    ["visit-august", "visit-july", "visit-open"],
  );
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

test("visitor open options keep entries from earlier days until they exit", () => {
  const submissions = [
    buildSubmission("visit-today", "visitor", {
      fio: "Сегодняшний посетитель",
      entryAt: "04.07.2026 09:10",
    }),
    buildSubmission("visit-yesterday", "visitor", {
      fio: "Вчерашний посетитель",
      entryAt: "03.07.2026 16:40",
    }),
    buildSubmission("visit-closed", "visitor", {
      fio: "Вышедший посетитель",
      entryAt: "02.07.2026 08:00",
    }),
    buildSubmission("visit-closed-exit", "visitor_exit", {
      visitorEntryId: "visit-closed",
      fio: "Вышедший посетитель",
      exitAt: "02.07.2026 17:00",
    }),
  ];

  assert.deepEqual(
    buildOpenVisitorOptions(submissions).map((visitor) => visitor.fio),
    ["Сегодняшний посетитель", "Вчерашний посетитель"],
  );
});

test("buildOwnerDispatcherOverview restores equipment, production, and visitors", () => {
  const submissions = [
    buildSubmission(
      "equipment-press-working",
      "equipment",
      {
        reportDate: "24.07.2026",
        equipment: "Пресс №1",
        productionTons: "12",
      },
      "2026-07-24T08:00:00.000Z",
    ),
    buildSubmission(
      "equipment-press-idle",
      "equipment",
      {
        reportDate: "24.07.2026",
        equipment: "Пресс №2",
        productionTons: "0",
      },
      "2026-07-24T08:01:00.000Z",
    ),
    buildSubmission(
      "equipment-runners-working",
      "equipment",
      {
        reportDate: "24.07.2026",
        equipment: "Бегуны №1",
        productionTons: "5",
      },
      "2026-07-24T08:02:00.000Z",
    ),
    buildSubmission(
      "visitor-closed",
      "visitor",
      {
        fio: "Первый посетитель",
        whom: "Фридману",
        entryAt: "24.07.2026 09:00",
      },
      "2026-07-24T06:00:00.000Z",
    ),
    buildSubmission(
      "visitor-closed-exit",
      "visitor_exit",
      {
        visitorEntryId: "visitor-closed",
        exitAt: "24.07.2026 10:00",
      },
      "2026-07-24T07:00:00.000Z",
    ),
    buildSubmission(
      "visitor-open",
      "visitor",
      {
        fio: "Второй посетитель",
        whom: "Матвеевой",
        entryAt: "24.07.2026 11:00",
      },
      "2026-07-24T08:00:00.000Z",
    ),
  ];

  assert.deepEqual(
    buildOwnerDispatcherOverview(submissions, {
      month: "2026-07",
      totalFact: 46,
      forming: { monthFact: 19, todayFact: 11 },
      sorting: { monthFact: 12, todayFact: 7 },
      unformed: { monthFact: 7, todayFact: 5 },
      chamotte: { monthFact: 8, todayFact: 5 },
      granulation: { monthFact: 9, todayFact: 5.5 },
    }),
    {
      production: {
        month: "2026-07",
        totalFact: 46,
        forming: { monthFact: 19, todayFact: 11 },
        sorting: { monthFact: 12, todayFact: 7 },
        unformed: { monthFact: 7, todayFact: 5 },
        chamotte: { monthFact: 8, todayFact: 5 },
        granulation: { monthFact: 9, todayFact: 5.5 },
      },
      equipment: {
        updatedAt: "2026-07-24T08:02:00.000Z",
        reportDate: "2026-07-24",
        workingCounts: [
          {
            key: "press",
            label: "Прессов",
            count: 1,
          },
          {
            key: "runner",
            label: "Бегунов",
            count: 1,
          },
        ],
      },
      visitors: {
        latestDate: "2026-07-24",
        count: 2,
        hosts: ["Фридману", "Матвеевой"],
        openCount: 1,
      },
    },
  );
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
