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
  buildVisitorVisitRows,
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

  const overview = buildOwnerDispatcherOverview(submissions);

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
