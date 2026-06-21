import assert from "node:assert/strict";
import test from "node:test";
import {
  mapDispatcherSubmissionRow,
  validateDispatcherSubmissionDraft,
} from "./dispatcherSubmission.js";

test("validateDispatcherSubmissionDraft accepts and trims a known form payload", () => {
  const result = validateDispatcherSubmissionDraft({
    businessAccountId: " business-id ",
    formId: "equipment",
    payload: {
      reportDate: " 2026-06-18 ",
      reportMonth: "06.2026",
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
        reportDate: "2026-06-18",
        reportMonth: "2026-06",
        equipment: "Пресс №1",
        productionTons: "42.5",
      },
    });
    assert.match(result.value.summary, /Пресс №1/);
    assert.match(result.value.summary, /2026-06-18/);
  }
});

test("validateDispatcherSubmissionDraft rejects malformed form payloads", () => {
  const result = validateDispatcherSubmissionDraft({
    businessAccountId: "",
    formId: "equipment",
    payload: {
      reportDate: "June",
      reportMonth: "2026/13",
      equipment: "Неизвестное оборудование",
      productionTons: "много",
      extraField: "not allowed",
    },
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /businessAccountId/);
    assert.match(result.errors.join(" "), /reportDate/);
    assert.match(result.errors.join(" "), /reportMonth/);
    assert.match(result.errors.join(" "), /equipment/);
    assert.match(result.errors.join(" "), /productionTons/);
    assert.match(result.errors.join(" "), /extraField/);
  }
});

test("mapDispatcherSubmissionRow returns the frontend contract shape", () => {
  const result = mapDispatcherSubmissionRow({
    id: "submission-id",
    business_account_id: "business-id",
    form_id: "visitor",
    payload: {
      entryAt: "2026-06-18T10:30",
      visitorName: "Visitor Name",
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
    formTitle: "Посетитель",
    payload: {
      entryAt: "2026-06-18T10:30",
      visitorName: "Visitor Name",
      organization: "External Org",
    },
    summary: "ФИО посетителя: Visitor Name · Организация: External Org",
    status: "received",
    submittedByAccountId: "dispatcher-account",
    submittedAt: "2026-06-18T00:00:00.000Z",
    receivedAt: "2026-06-18T00:00:01.000Z",
  });
});
