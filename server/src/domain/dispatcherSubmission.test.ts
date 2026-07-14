import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDispatcherSubmissionDedupeKey,
  mapDispatcherSubmissionRow,
  validateDispatcherSubmissionDraft,
} from "./dispatcherSubmission.js";
import { applyIncidentStateRules } from "./dispatcherIncidentState.js";
import { applyVisitorStateRules } from "./dispatcherVisitorState.js";

test("validateDispatcherSubmissionDraft accepts and trims a known form payload", () => {
  const result = validateDispatcherSubmissionDraft({
    businessAccountId: " business-id ",
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
      businessAccountId: "business-id",
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
    businessAccountId: "",
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
    assert.match(result.errors.join(" "), /businessAccountId/);
    assert.match(result.errors.join(" "), /reportDate/);
    assert.match(result.errors.join(" "), /equipment/);
    assert.match(result.errors.join(" "), /productionTons/);
    assert.match(result.errors.join(" "), /extraField/);
  }
});

test("validateDispatcherSubmissionDraft applies script rules for incidents", () => {
  const result = validateDispatcherSubmissionDraft({
    businessAccountId: "business-id",
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
    businessAccountId: "business-id",
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

test("validateDispatcherSubmissionDraft rejects downtime reason without positive hours", () => {
  const result = validateDispatcherSubmissionDraft({
    businessAccountId: "business-id",
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
    businessAccountId: "business-id",
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
    businessAccountId: "business-id",
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
    businessAccountId: "business-id",
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
    businessAccountId: "business-id",
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
    businessAccountId: "business-id",
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
    businessAccountId: "business-id",
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

test("buildDispatcherSubmissionDedupeKey scopes equipment reports by business, date, and equipment", () => {
  const result = validateDispatcherSubmissionDraft({
    businessAccountId: "business-id",
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
      "equipment:business-id:18.06.2026:Пресс №1",
    );
  }
});

test("buildDispatcherSubmissionDedupeKey protects visitor submissions", () => {
  const result = validateDispatcherSubmissionDraft({
    businessAccountId: "business-id",
    formId: "visitor",
    payload: {
      fio: "Visitor Name",
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.match(
      buildDispatcherSubmissionDedupeKey(result.value.draft) ?? "",
      /^dispatcher:business-id:visitor:[a-f0-9]{64}$/u,
    );
  }
});

test("buildDispatcherSubmissionDedupeKey normalizes incident identity", () => {
  const first = buildDispatcherSubmissionDedupeKey({
    businessAccountId: "business-id",
    formId: "incident",
    payload: { incidentNumber: " INC-2026-12 " },
  });
  const second = buildDispatcherSubmissionDedupeKey({
    businessAccountId: "business-id",
    formId: "incident",
    payload: { incidentNumber: "inc-2026-12" },
  });

  assert.equal(first, second);
  assert.match(first ?? "", /^dispatcher:business-id:incident:[a-f0-9]{64}$/u);
});

test("validateDispatcherSubmissionDraft stamps visitor exit time", () => {
  const result = validateDispatcherSubmissionDraft({
    businessAccountId: "business-id",
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
    businessAccountId: "business-id",
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

test("visitor state rules allow exit only for entries from today", () => {
  const result = validateDispatcherSubmissionDraft({
    businessAccountId: "business-id",
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
    businessAccountId: "business-id",
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
    });
    const closure = buildDispatcherSubmission("incident-close-id", "incident_close", {
      incidentNumber: "INC-2026-1",
      closureDateTime: "18.06.2026 11:30",
    });
    const openResult = applyIncidentStateRules(result.value, [opening]);

    assert.equal(applyIncidentStateRules(result.value, []).ok, false);
    assert.equal(openResult.ok, true);

    if (openResult.ok) {
      assert.equal(openResult.value.draft.payload.location, "Цех 1");
    }

    assert.equal(
      applyIncidentStateRules(result.value, [opening, closure]).ok,
      false,
    );
  }
});

test("validateDispatcherSubmissionDraft rejects legacy gas forms as inactive", () => {
  const result = validateDispatcherSubmissionDraft({
    businessAccountId: "business-id",
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
    business_account_id: "business-id",
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
    businessAccountId: "business-id",
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
    business_account_id: "business-id",
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
) {
  return {
    id,
    businessAccountId: "business-id",
    formId,
    formTitle: formId,
    payload,
    summary: id,
    status: "received" as const,
    submittedByAccountId: "dispatcher-account",
    submittedAt: "2026-06-18T00:00:00.000Z",
    receivedAt: "2026-06-18T00:00:01.000Z",
  };
}
