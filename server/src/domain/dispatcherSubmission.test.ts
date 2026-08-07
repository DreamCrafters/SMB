import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDispatcherSubmissionDedupeKey,
  mapDispatcherSubmissionRow,
  validateDispatcherSubmissionDraft,
} from "./dispatcherSubmission.js";
import {
  applyIncidentStateRules,
  buildIncidentOverviewPeriod,
  buildIncidentOverviewSummary,
  buildOpenIncidentSummaries,
} from "./dispatcherIncidentState.js";
import { applyVisitorStateRules } from "./dispatcherVisitorState.js";

test("validateDispatcherSubmissionDraft accepts and trims a known form payload", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "equipment",
    payload: {
      reportDate: " 2026-06-18 ",
      equipment: "Пресс №1",
      productionTons: " 42,5 ",
      note: "",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.deepEqual(result.value.draft, {
      formId: "equipment",
      payload: {
        reportDate: "18.06.2026",
        reportMonth: "2026-06",
        equipment: "Пресс №1",
        productionTons: "42.5",
      },
    });
    assert.match(result.value.summary, /Пресс №1/);
    assert.match(result.value.summary, /18\.06\.2026/);
  }
});

test("validateDispatcherSubmissionDraft rejects malformed form payloads", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "equipment",
    payload: {
      reportDate: "June",
      equipment: "Неизвестное оборудование",
      productionTons: "много",
      extraField: "not allowed",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /reportDate/);
    assert.match(result.errors.join(" "), /equipment/);
    assert.match(result.errors.join(" "), /productionTons/);
    assert.match(result.errors.join(" "), /extraField/);
  }
});

test("validateDispatcherSubmissionDraft applies script rules for incidents", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "incident",
    payload: {
      datetime: "2026-06-18T10:30",
      location: "Цех 1",
      incidentType: "Поломка оборудования по мех. части",
      description: "Описание",
      criticality: "Высокий",
      responsible: "Ответственный",
      immediateActions: "Остановили участок",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.value.draft.payload.datetime, "18.06.2026 10:30");
    assert.equal(result.value.draft.payload.incidentStatus, "Новый");
  }
});

test("validateDispatcherSubmissionDraft rejects empty equipment reports", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "equipment",
    payload: {
      reportDate: "2026-06-18",
      equipment: "Пресс №1",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /equipment report/);
  }
});

test("validateDispatcherSubmissionDraft accepts a production report and derives its month", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "production",
    payload: {
      reportDate: "2026-07-16",
      formingDay: "12,5",
      formingProductBrand: "ПБ-5",
      unformedBrand1: "МКР-1",
      unformedFact1: "4,5",
      unformedBrand2: "МКР-2",
      unformedFact2: "3",
      jarStart1: "120",
      jarShipmentStart1: "118,5",
      jarEnd1: "95,5",
      jarShipmentEnd1: "94",
      granulationFraction1630Day: "3,25",
      granulationFraction1218Day: "1,75",
      granulationPlatesInOperation: "2",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.deepEqual(result.value.draft.payload, {
      reportDate: "16.07.2026",
      reportMonth: "2026-07",
      formingDay: "12.5",
      formingProductBrand: "ПБ-5",
      unformedBrand1: "МКР-1",
      unformedFact1: "4.5",
      unformedBrand2: "МКР-2",
      unformedFact2: "3",
      jarStart1: "120",
      jarShipmentStart1: "118.5",
      jarEnd1: "95.5",
      jarShipmentEnd1: "94",
      granulationFraction1630Day: "3.25",
      granulationFraction1218Day: "1.75",
      granulationPlatesInOperation: "2",
    });
    assert.match(result.value.summary, /16\.07\.2026/);
    assert.match(result.value.summary, /12\.5/);
  }
});

test("validateDispatcherSubmissionDraft requires one unique saved-brand fact per production column", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "production",
    payload: {
      reportDate: "2026-07-16",
      unformedBrand1: "МКР-1",
      unformedFact1: "4",
      unformedBrand2: " мкр-1 ",
      unformedFact2: "3",
      chamotteFact1: "2",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /must not repeat/u);
    assert.match(result.errors.join(" "), /chamotteBrand1/u);
  }
});

test("validateDispatcherSubmissionDraft accepts dynamic forming and sorting brand facts", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "production",
    payload: {
      reportDate: "2026-07-16",
      formingBrand1: "ФЛ-1",
      formingFact1: "4,5",
      formingBrand2: "ФЛ-2",
      formingFact2: "3",
      sortingBrand1: "СО-1",
      sortingFact1: "0",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.deepEqual(result.value.draft.payload, {
      reportDate: "16.07.2026",
      reportMonth: "2026-07",
      formingBrand1: "ФЛ-1",
      formingFact1: "4.5",
      formingBrand2: "ФЛ-2",
      formingFact2: "3",
      sortingBrand1: "СО-1",
      sortingFact1: "0",
    });
  }
});

test("validateDispatcherSubmissionDraft omits a blank forming fact on a weekend", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "production",
    payload: {
      reportDate: "2026-07-18",
      formingBrand1: "ФЛ-1",
      sortingBrand1: "СО-1",
      sortingFact1: "5",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.deepEqual(result.value.draft.payload, {
      reportDate: "18.07.2026",
      reportMonth: "2026-07",
      sortingBrand1: "СО-1",
      sortingFact1: "5",
    });
  }
});

test("validateDispatcherSubmissionDraft rejects duplicate dynamic forming brands", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "production",
    payload: {
      reportDate: "2026-07-16",
      formingBrand1: "ФЛ-1",
      formingFact1: "4",
      formingBrand2: " фл-1 ",
      formingFact2: "3",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /forming brands must not repeat/u);
  }
});

test("validateDispatcherSubmissionDraft requires a brand for every production fact", () => {
  const cases = [
    { payload: { formingDay: "0" }, missingField: "formingProductBrand" },
    { payload: { sortingDay: "5" }, missingField: "sortingProductBrand" },
    { payload: { unformedFact1: "7" }, missingField: "unformedBrand1" },
    { payload: { chamotteFact1: "9" }, missingField: "chamotteBrand1" },
  ];

  for (const { payload, missingField } of cases) {
    const result = validateDispatcherSubmissionDraft({
      formId: "production",
      payload: {
        reportDate: "2026-07-16",
        ...payload,
      },
    });

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.match(result.errors.join(" "), new RegExp(missingField, "u"));
    }
  }
});

test("validateDispatcherSubmissionDraft rejects calculated production fields", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "production",
    payload: {
      reportDate: "2026-07-16",
      formingMonth: "120",
      unformedDeviation1: "5",
      granulationFraction1600Month: "30",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /formingMonth/u);
    assert.match(result.errors.join(" "), /unformedDeviation1/u);
    assert.match(result.errors.join(" "), /granulationFraction1600Month/u);
  }
});

test("validateDispatcherSubmissionDraft rejects an empty production report", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "production",
    payload: {
      reportDate: "2026-07-16",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /production report/);
  }
});

test("validateDispatcherSubmissionDraft rejects downtime reason without positive hours", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "equipment",
    payload: {
      reportDate: "2026-06-18",
      equipment: "Пресс №1",
      downtimeReason: "Резерв",
      downtimeHours: "0",
      productionTons: "10",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /downtime hours/);
  }
});

test("validateDispatcherSubmissionDraft rejects downtime hours without reason", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "equipment",
    payload: {
      reportDate: "2026-06-18",
      equipment: "Пресс №1",
      downtimeHours: "7",
      productionTons: "10",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /downtime reason/);
  }
});

test("validateDispatcherSubmissionDraft rejects reserve downtime under 8 hours", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "equipment",
    payload: {
      reportDate: "2026-06-18",
      equipment: "Пресс №1",
      downtimeReason: "Резерв",
      downtimeHours: "7",
      productionTons: "10",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /reserve downtime/);
  }
});

test("validateDispatcherSubmissionDraft rejects downtime under 8 hours without production", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "equipment",
    payload: {
      reportDate: "2026-06-18",
      equipment: "Пресс №1",
      downtimeReason: "Замена марки/формы",
      downtimeHours: "7",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /production/);
  }
});

test("validateDispatcherSubmissionDraft accepts productive downtime under 8 hours", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "equipment",
    payload: {
      reportDate: "2026-06-18",
      equipment: "Пресс №1",
      downtimeReason: "Замена марки/формы",
      downtimeHours: "7",
      productionTons: "1",
    },
  });

  assert.equal(result.ok, true);
});

test("validateDispatcherSubmissionDraft accepts reserve downtime at exactly 8 hours", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "equipment",
    payload: {
      reportDate: "2026-06-18",
      equipment: "Пресс №1",
      downtimeReason: "Резерв",
      downtimeHours: "8",
    },
  });

  assert.equal(result.ok, true);
});

test("validateDispatcherSubmissionDraft rejects downtime over 8 hours", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "equipment",
    payload: {
      reportDate: "2026-06-18",
      equipment: "Пресс №1",
      downtimeReason: "Замена марки/формы",
      downtimeHours: "9",
      productionTons: "1",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /8 hours or less/);
  }
});

test("buildDispatcherSubmissionDedupeKey scopes equipment reports by date and equipment", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "equipment",
    payload: {
      reportDate: "2026-06-18",
      equipment: "Пресс №1",
      productionTons: "42",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(
      buildDispatcherSubmissionDedupeKey(result.value.draft),
      "equipment:18.06.2026:Пресс №1",
    );
  }
});

test("buildDispatcherSubmissionDedupeKey protects visitor submissions", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "visitor",
    payload: {
      fio: "Visitor Name",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.match(
      buildDispatcherSubmissionDedupeKey(result.value.draft) ?? "",
      /^dispatcher:visitor:[a-f0-9]{64}$/u,
    );
  }
});

test("buildDispatcherSubmissionDedupeKey normalizes incident identity", () => {
  const first = buildDispatcherSubmissionDedupeKey({
    formId: "incident",
    payload: { incidentNumber: " INC-2026-12 " },
  });
  const second = buildDispatcherSubmissionDedupeKey({
    formId: "incident",
    payload: { incidentNumber: "inc-2026-12" },
  });

  assert.equal(first, second);
  assert.match(first ?? "", /^dispatcher:incident:[a-f0-9]{64}$/u);
});

test("validateDispatcherSubmissionDraft stamps visitor exit time", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "visitor_exit",
    payload: {
      visitorEntryId: "visitor-entry-id",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.match(
      result.value.draft.payload.exitAt,
      /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/,
    );
  }
});

test("visitor state rules close same-timestamp entries before duplicate checks", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "visitor",
    payload: {
      fio: "Visitor Name",
      organization: "External Org",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    const stateResult = applyVisitorStateRules(result.value, [
      buildDispatcherSubmission("visitor-exit-id", "visitor_exit", {
        visitorEntryId: "visitor-entry-id",
        fio: "Visitor Name",
        organization: "External Org",
        exitAt: "18.06.2026 10:45",
      }),
      buildDispatcherSubmission("visitor-entry-id", "visitor", {
        fio: "Visitor Name",
        organization: "External Org",
        entryAt: "18.06.2026 10:30",
      }),
    ]);

    assert.equal(stateResult.ok, true);
  }
});

test("visitor state rules close a legacy entry when its exit link is stale", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "visitor",
    payload: {
      fio: "Visitor Name",
      organization: "External Org",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    const stateResult = applyVisitorStateRules(result.value, [
      buildDispatcherSubmission("visitor-entry-id", "visitor", {
        fio: "Visitor Name",
        organization: "External Org",
        entryAt: "18.06.2026 10:30",
      }),
      buildDispatcherSubmission("visitor-exit-id", "visitor_exit", {
        visitorEntryId: "missing-imported-entry-id",
        fio: "Visitor Name",
        organization: "External Org",
        exitAt: "18.06.2026 10:45",
      }),
    ]);

    assert.equal(stateResult.ok, true);
  }
});

test("visitor state rules allow exit only for entries from today", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "visitor_exit",
    payload: {
      visitorEntryId: "visitor-entry-id",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    const yesterdayResult = applyVisitorStateRules(
      result.value,
      [
        buildDispatcherSubmission("visitor-entry-id", "visitor", {
          fio: "Visitor Name",
          organization: "External Org",
          entryAt: "17.06.2026 10:30",
        }),
      ],
      new Date("2026-06-18T12:00:00.000Z"),
    );
    const todayResult = applyVisitorStateRules(
      result.value,
      [
        buildDispatcherSubmission("visitor-entry-id", "visitor", {
          fio: "Visitor Name",
          organization: "External Org",
          entryAt: "18.06.2026 10:30",
        }),
      ],
      new Date("2026-06-18T12:00:00.000Z"),
    );

    assert.equal(yesterdayResult.ok, false);
    assert.equal(todayResult.ok, true);
  }
});

test("incident state rules allow closure of earlier-day open incidents only", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "incident_close",
    payload: {
      incidentNumber: "INC-2026-1",
      rootCauses: "Root cause",
      preventiveMeasures: "Preventive measures",
      closureDateTime: "2026-06-18T12:00",
      approvedBy: "Approver",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    const opening = buildDispatcherSubmission("incident-id", "incident", {
      incidentNumber: "INC-2026-1",
      datetime: "17.06.2026 10:30",
      location: "Цех 1",
      incidentType: "Пожар",
      criticality: "Высокий",
      description: "Возгорание кабеля",
    });
    const closure = buildDispatcherSubmission("incident-close-id", "incident_close", {
      incidentNumber: "INC-2026-1",
      closureDateTime: "18.06.2026 11:30",
    });
    const openResult = applyIncidentStateRules(result.value, [opening]);

    assert.equal(applyIncidentStateRules(result.value, []).ok, false);
    assert.equal(openResult.ok, true);

    if (openResult.ok) {
      assert.equal(openResult.value.draft.payload.datetime, "17.06.2026 10:30");
      assert.equal(openResult.value.draft.payload.location, "Цех 1");
      assert.equal(openResult.value.draft.payload.incidentType, "Пожар");
      assert.equal(openResult.value.draft.payload.criticality, "Высокий");
      assert.equal(
        openResult.value.draft.payload.description,
        "Возгорание кабеля",
      );
    }

    assert.equal(
      applyIncidentStateRules(result.value, [opening, closure]).ok,
      false,
    );
  }
});

test("incident overview summarizes the current month, today, and all open incidents", () => {
  const submissions = [
    buildDispatcherSubmission(
      "incident-old-open",
      "incident",
      {
        incidentNumber: "INC-2026-1",
        datetime: "28.06.2026 10:00",
      },
      "2026-06-28T07:00:00.000Z",
    ),
    buildDispatcherSubmission(
      "incident-old-closed",
      "incident",
      {
        incidentNumber: "INC-2026-2",
        datetime: "29.06.2026 10:00",
      },
      "2026-06-29T07:00:00.000Z",
    ),
    buildDispatcherSubmission(
      "incident-old-closure",
      "incident_close",
      {
        incidentNumber: "INC-2026-2",
        closureDateTime: "02.07.2026 12:00",
      },
      "2026-07-02T09:00:00.000Z",
    ),
    buildDispatcherSubmission(
      "incident-month-closed",
      "incident",
      {
        incidentNumber: "INC-2026-3",
        datetime: "03.07.2026 08:30",
      },
      "2026-07-03T05:30:00.000Z",
    ),
    buildDispatcherSubmission(
      "incident-month-closure",
      "incident_close",
      {
        incidentNumber: "INC-2026-3",
        closureDateTime: "04.07.2026 14:00",
      },
      "2026-07-04T11:00:00.000Z",
    ),
    buildDispatcherSubmission(
      "incident-month-open",
      "incident",
      {
        incidentNumber: "INC-2026-4",
        datetime: "15.07.2026 09:15",
      },
      "2026-07-15T06:15:00.000Z",
    ),
    buildDispatcherSubmission(
      "incident-today-open",
      "incident",
      {
        incidentNumber: "INC-2026-5",
        datetime: "23.07.2026 11:45",
      },
      "2026-07-23T08:45:00.000Z",
    ),
  ];

  assert.deepEqual(
    buildIncidentOverviewSummary(
      submissions,
      new Date("2026-07-23T12:00:00.000Z"),
    ),
    {
      monthTotal: 3,
      monthClosed: 1,
      todayTotal: 1,
      openNow: 3,
    },
  );
});

test("open incident list matches the overview counter for the same history", () => {
  const submissions = [
    buildDispatcherSubmission(
      "incident-open-old",
      "incident",
      {
        incidentNumber: "INC-2026-1",
        datetime: "28.06.2026 10:00",
        location: "ЦОШ (Цех обжига шамота)",
        incidentType: "Поломка оборудования по мех. части",
        criticality: "Высокий",
        description: "Остановлен пресс",
      },
      "2026-06-28T07:00:00.000Z",
    ),
    buildDispatcherSubmission(
      "incident-closed",
      "incident",
      {
        incidentNumber: "INC-2026-2",
        datetime: "03.07.2026 08:30",
      },
      "2026-07-03T05:30:00.000Z",
    ),
    buildDispatcherSubmission(
      "incident-closure",
      "incident_close",
      {
        incidentNumber: "INC-2026-2",
        closureDateTime: "04.07.2026 14:00",
      },
      "2026-07-04T11:00:00.000Z",
    ),
    buildDispatcherSubmission(
      "incident-open-new",
      "incident",
      {
        incidentNumber: "INC-2026-3",
        datetime: "15.07.2026 09:15",
      },
      "2026-07-15T06:15:00.000Z",
    ),
    buildDispatcherSubmission(
      "incident-future",
      "incident",
      {
        incidentNumber: "INC-2026-4",
        datetime: "30.07.2026 09:15",
      },
      "2026-07-23T06:15:00.000Z",
    ),
  ];
  const currentDate = new Date("2026-07-23T12:00:00.000Z");
  const openIncidents = buildOpenIncidentSummaries(submissions, currentDate);

  assert.deepEqual(openIncidents, [
    {
      incidentNumber: "INC-2026-3",
      openedAt: "15.07.2026 09:15",
    },
    {
      incidentNumber: "INC-2026-1",
      openedAt: "28.06.2026 10:00",
      location: "ЦОШ (Цех обжига шамота)",
      incidentType: "Поломка оборудования по мех. части",
      criticality: "Высокий",
      description: "Остановлен пресс",
    },
  ]);
  assert.equal(
    openIncidents.length,
    buildIncidentOverviewSummary(submissions, currentDate).openNow,
  );
});

test("incident overview period follows the Moscow calendar at month rollover", () => {
  assert.deepEqual(
    buildIncidentOverviewPeriod(
      new Date("2026-07-31T22:30:00.000Z"),
    ),
    {
      monthStart: "2026-08-01",
      today: "2026-08-01",
    },
  );
});

test("validateDispatcherSubmissionDraft rejects legacy gas forms as inactive", () => {
  const result = validateDispatcherSubmissionDraft({
    formId: "gas_oc",
    payload: {
      date: "2026-06-18",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /active dispatcher form/);
  }
});

test("mapDispatcherSubmissionRow returns the frontend contract shape", () => {
  const result = mapDispatcherSubmissionRow({
    id: "submission-id",
    form_id: "visitor",
    payload: {
      entryAt: "18.06.2026 10:30",
      fio: "Visitor Name",
      organization: "External Org",
    },
    summary: "ФИО посетителя: Visitor Name · Организация: External Org",
    status: "received",
    submitted_by_account_id: "dispatcher-account",
    submitted_at: new Date("2026-06-18T00:00:00.000Z"),
    received_at: new Date("2026-06-18T00:00:01.000Z"),
  });

  assert.deepEqual(result, {
    id: "submission-id",
    formId: "visitor",
    formTitle: "Вход посетителя",
    payload: {
      entryAt: "18.06.2026 10:30",
      fio: "Visitor Name",
      organization: "External Org",
    },
    summary: "ФИО посетителя: Visitor Name · Организация: External Org",
    status: "received",
    submittedByAccountId: "dispatcher-account",
    submittedAt: "2026-06-18T00:00:00.000Z",
    receivedAt: "2026-06-18T00:00:01.000Z",
  });
});

test("mapDispatcherSubmissionRow reads MariaDB JSON payload strings", () => {
  const result = mapDispatcherSubmissionRow({
    id: "submission-id",
    form_id: "incident",
    payload: JSON.stringify({
      incidentNumber: "INC-2026-1",
      incidentStatus: "Новый",
    }),
    summary: "Номер инцидента: INC-2026-1",
    status: "received",
    submitted_by_account_id: "dispatcher-account",
    submitted_at: "2026-06-18 00:00:00.000",
    received_at: "2026-06-18 00:00:01.000",
  });

  assert.deepEqual(result.payload, {
    incidentNumber: "INC-2026-1",
    incidentStatus: "Новый",
  });
  assert.equal(result.submittedAt, "2026-06-18T00:00:00.000Z");
  assert.equal(result.receivedAt, "2026-06-18T00:00:01.000Z");
});

function buildDispatcherSubmission(
  id: string,
  formId: "incident" | "incident_close" | "visitor" | "visitor_exit",
  payload: Record<string, string>,
  receivedAt = "2026-06-18T00:00:01.000Z",
) {
  return {
    id,
    formId,
    formTitle: formId,
    payload,
    summary: id,
    status: "received" as const,
    submittedByAccountId: "dispatcher-account",
    submittedAt: "2026-06-18T00:00:00.000Z",
    receivedAt,
  };
}
