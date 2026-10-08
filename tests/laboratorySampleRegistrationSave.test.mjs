import assert from "node:assert/strict";
import test from "node:test";
import { submitLaboratorySampleRegistrationJournalRecord } from "../.test-build/src/services/laboratorySampleRegistrationJournal.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

const submission = {
  sampleNumber: "1690",
  laboratorySampleCode: "26.1690",
  samplingDate: "2026-10-06",
  samplingLaboratoryAssistant: "Иванова А.А.",
  sampleName: "Новая марка",
  registrationDate: "2026-10-07",
  samplingLocation: "Склад готовой продукции",
  transmitToJournal: "verification",
};

function respondWith(payload) {
  globalThis.fetch = async () => new Response(JSON.stringify(payload), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

test("registration save reports the journal that got an automatic record or why it did not", async () => {
  const record = { id: "reg-1", ...submission, createdAt: "2026-10-07T08:00:00.000Z" };

  respondWith({ record, transmittedTo: "verification" });
  const created = await submitLaboratorySampleRegistrationJournalRecord(submission);
  assert.equal(created.status, "ready");
  assert.equal(created.transmittedTo, "verification");
  assert.equal(created.transmissionSkippedReason, undefined);

  respondWith({ record, transmissionSkippedReason: "unknown_raw_material" });
  const skipped = await submitLaboratorySampleRegistrationJournalRecord(submission);
  assert.equal(skipped.transmittedTo, undefined);
  assert.equal(skipped.transmissionSkippedReason, "unknown_raw_material");

  // Unknown values from the server are ignored rather than trusted.
  respondWith({ record, transmittedTo: "elsewhere", transmissionSkippedReason: "other" });
  const unknown = await submitLaboratorySampleRegistrationJournalRecord(submission);
  assert.equal(unknown.transmittedTo, undefined);
  assert.equal(unknown.transmissionSkippedReason, undefined);
});
