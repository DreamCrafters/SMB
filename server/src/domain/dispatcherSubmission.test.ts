import assert from "node:assert/strict";
import test from "node:test";
import {
  mapDispatcherSubmissionRow,
  validateDispatcherSubmissionDraft,
} from "./dispatcherSubmission.js";

test("validateDispatcherSubmissionDraft accepts and trims a valid payload", () => {
  const result = validateDispatcherSubmissionDraft({
    businessAccountId: " business-id ",
    period: "2026-06",
    metricCode: " dispatch.count ",
    rawValue: " 42 ",
    comment: " optional comment ",
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.deepEqual(result.draft, {
      businessAccountId: "business-id",
      period: "2026-06",
      metricCode: "dispatch.count",
      rawValue: "42",
      comment: "optional comment",
    });
  }
});

test("validateDispatcherSubmissionDraft rejects empty and malformed values", () => {
  const result = validateDispatcherSubmissionDraft({
    businessAccountId: "",
    period: "June",
    metricCode: 42,
    rawValue: "",
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.match(result.errors.join(" "), /businessAccountId/);
    assert.match(result.errors.join(" "), /period/);
    assert.match(result.errors.join(" "), /metricCode/);
    assert.match(result.errors.join(" "), /rawValue/);
  }
});

test("mapDispatcherSubmissionRow returns the frontend contract shape", () => {
  const result = mapDispatcherSubmissionRow({
    id: "submission-id",
    business_account_id: "business-id",
    period: "2026-06",
    metric_code: "dispatch.count",
    raw_value: "42",
    comment: null,
    status: "received",
    submitted_by_account_id: "dispatcher-account",
    submitted_at: new Date("2026-06-18T00:00:00.000Z"),
    received_at: new Date("2026-06-18T00:00:01.000Z"),
  });

  assert.deepEqual(result, {
    id: "submission-id",
    businessAccountId: "business-id",
    period: "2026-06",
    metricCode: "dispatch.count",
    rawValue: "42",
    comment: undefined,
    status: "received",
    submittedByAccountId: "dispatcher-account",
    submittedAt: "2026-06-18T00:00:00.000Z",
    receivedAt: "2026-06-18T00:00:01.000Z",
  });
});
