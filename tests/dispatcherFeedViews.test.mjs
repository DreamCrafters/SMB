import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEquipmentSummaryRows,
  buildIncidentSummaryRows,
  buildOpenVisitorOptions,
  buildVisitorVisitRows,
} from "../.test-build/src/services/dispatcherFeedViews.js";

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

  const rows = buildVisitorVisitRows(submissions, "2026-07-04");

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

  const rows = buildVisitorVisitRows(submissions, "2026-07-04");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].exitAt, "04.07.2026 09:15");
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
    buildOpenVisitorOptions(submissions, undefined, "2026-07-04").map(
      (visitor) => visitor.fio,
    ),
    ["Сегодняшний посетитель"],
  );
});

function buildSubmission(id, formId, payload) {
  return {
    id,
    businessAccountId: "business-id",
    formId,
    formTitle: formId,
    payload,
    summary: id,
    status: "received",
    submittedByAccountId: "dispatcher",
    submittedAt: "2026-07-04T00:00:00.000Z",
    receivedAt: "2026-07-04T00:00:00.000Z",
  };
}
