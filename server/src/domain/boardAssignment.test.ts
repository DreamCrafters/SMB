import assert from "node:assert/strict";
import test from "node:test";
import type { ServerUserProfile } from "./auth.js";
import {
  getBoardAssignmentOccurrenceOnOrAfter,
  getNextBoardAssignmentOccurrenceDate,
  getBoardAssignmentPermissions,
  isBoardAssignmentActiveOn,
  isBoardAssignmentOverdueOn,
  validateBoardAssignmentAction,
  validateBoardAssignmentCreateRequest,
  validateBoardAssignmentUpdateRequest,
} from "./boardAssignment.js";

test("board assignment creation accepts protocol fields and normalizes co-executors", () => {
  const result = validateBoardAssignmentCreateRequest({
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.3",
    summary: "Подготовить анализ причин невыполнения плана",
    details:
      "Представить Совету директоров письменный анализ причин невыполнения плановых показателей.",
    coExecutors: ["Экономист", " Финансовый директор ", "Экономист"],
    recurrence: "monthly",
    activeFrom: "2026-08-01",
    activeTo: "2026-12-31",
    comment: "Поручение внесено по протоколу.",
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      meetingDate: "2026-07-10",
      protocolNumber: "369",
      decisionNumber: "2.3",
      summary: "Подготовить анализ причин невыполнения плана",
      details:
        "Представить Совету директоров письменный анализ причин невыполнения плановых показателей.",
      coExecutors: ["Экономист", "Финансовый директор"],
      recurrence: "monthly",
      activeFrom: "2026-08-01",
      activeTo: "2026-12-31",
      comment: "Поручение внесено по протоколу.",
    },
  });
});

test("board assignment editing requires an explicit change comment", () => {
  const request = {
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.3",
    summary: "Подготовить анализ причин невыполнения плана",
    details: "Представить Совету директоров письменный анализ.",
    coExecutors: ["Экономист"],
    recurrence: "monthly",
    activeFrom: "2026-08-01",
    activeTo: "2026-12-31",
  };

  assert.equal(validateBoardAssignmentUpdateRequest(request).ok, false);
  assert.equal(
    validateBoardAssignmentUpdateRequest({
      ...request,
      comment: "Уточнены сроки.",
      expectedUpdatedAt: "2026-07-20T08:00:00.000Z",
    }).ok,
    true,
  );
});

test("board assignment creation rejects missing fields, an invalid meeting date and unknown input", () => {
  const result = validateBoardAssignmentCreateRequest({
    meetingDate: "2026-07-32",
    protocolNumber: "",
    decisionNumber: "",
    summary: "",
    details: "",
    coExecutors: "Экономист",
    recurrence: "sometimes",
    activeFrom: "2026-08-10",
    activeTo: "2026-08-01",
    extra: "unexpected",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.match(result.errors.join(" "), /Дата заседания/u);
  assert.match(result.errors.join(" "), /Номер протокола/u);
  assert.match(result.errors.join(" "), /Пункт решения/u);
  assert.match(result.errors.join(" "), /Краткое содержание/u);
  assert.match(result.errors.join(" "), /Полное содержание/u);
  assert.match(result.errors.join(" "), /Соисполнители/u);
  assert.match(result.errors.join(" "), /периодичность/u);
  assert.match(result.errors.join(" "), /начала/u);
  assert.match(result.errors.join(" "), /окончания/u);
  assert.match(result.errors.join(" "), /неизвестные поля/u);
});

test("board assignment recurrence advances from its anchor without accumulating missed runs", () => {
  assert.equal(
    getNextBoardAssignmentOccurrenceDate({
      recurrence: "daily",
      activeFrom: "2026-07-10",
      activeTo: "2026-07-31",
      completedOn: "2026-07-27",
    }),
    "2026-07-28",
  );
  assert.equal(
    getNextBoardAssignmentOccurrenceDate({
      recurrence: "weekly",
      activeFrom: "2026-07-10",
      activeTo: "2026-08-31",
      completedOn: "2026-07-27",
    }),
    "2026-07-31",
  );
  assert.equal(
    getNextBoardAssignmentOccurrenceDate({
      recurrence: "monthly",
      activeFrom: "2026-01-31",
      activeTo: "2026-04-30",
      completedOn: "2026-02-28",
    }),
    "2026-03-31",
  );
  assert.equal(
    getNextBoardAssignmentOccurrenceDate({
      recurrence: "yearly",
      activeFrom: "2024-02-29",
      activeTo: "2028-12-31",
      completedOn: "2026-03-01",
    }),
    "2027-02-28",
  );
  assert.equal(
    getNextBoardAssignmentOccurrenceDate({
      recurrence: "monthly",
      activeFrom: "2026-01-31",
      activeTo: "2026-02-28",
      completedOn: "2026-02-28",
    }),
    undefined,
  );
  assert.equal(
    getNextBoardAssignmentOccurrenceDate({
      recurrence: "once",
      activeFrom: "2026-07-10",
      activeTo: "2026-07-31",
      completedOn: "2026-07-10",
    }),
    undefined,
  );
});

test("board assignment editing keeps the current cycle at the next date of the new schedule", () => {
  assert.equal(
    getBoardAssignmentOccurrenceOnOrAfter({
      recurrence: "weekly",
      activeFrom: "2026-07-15",
      activeTo: "2026-12-31",
      targetDate: "2026-08-10",
    }),
    "2026-08-12",
  );
  assert.equal(
    getBoardAssignmentOccurrenceOnOrAfter({
      recurrence: "once",
      activeFrom: "2026-07-15",
      activeTo: "2026-07-15",
      targetDate: "2026-08-10",
    }),
    undefined,
  );
});

test("executor activity starts on the occurrence date and keeps overdue work active", () => {
  assert.equal(
    isBoardAssignmentActiveOn({
      status: "in_progress",
      currentOccurrenceDate: "2026-08-01",
      activeFrom: "2026-08-01",
      activeTo: "2026-08-31",
    }, "2026-07-31"),
    false,
  );
  assert.equal(
    isBoardAssignmentActiveOn({
      status: "revision_requested",
      currentOccurrenceDate: "2026-08-01",
      activeFrom: "2026-08-01",
      activeTo: "2026-08-31",
    }, "2026-09-05"),
    true,
  );
  assert.equal(
    isBoardAssignmentActiveOn({
      status: "under_review",
      currentOccurrenceDate: "2026-08-01",
      activeFrom: "2026-08-01",
      activeTo: "2026-08-31",
    }, "2026-08-10"),
    false,
  );
});

test("only unfinished assignments before the current date are overdue", () => {
  assert.equal(
    isBoardAssignmentOverdueOn({
      status: "in_progress",
      currentOccurrenceDate: "2026-08-07",
    }, "2026-08-08"),
    true,
  );
  assert.equal(
    isBoardAssignmentOverdueOn({
      status: "revision_requested",
      currentOccurrenceDate: "2026-08-07",
    }, "2026-08-08"),
    true,
  );
  assert.equal(
    isBoardAssignmentOverdueOn({
      status: "in_progress",
      currentOccurrenceDate: "2026-08-08",
    }, "2026-08-08"),
    false,
  );
  assert.equal(
    isBoardAssignmentOverdueOn({
      status: "under_review",
      currentOccurrenceDate: "2026-08-07",
    }, "2026-08-08"),
    false,
  );
});

test("board assignment permissions separate creation, execution and review authority", () => {
  assert.deepEqual(
    getBoardAssignmentPermissions(
      buildProfile("board_member", "Белов Юрий Иванович"),
    ),
    {
      canView: true,
      canCreate: true,
      canExecute: false,
      canReview: false,
    },
  );
  assert.deepEqual(
    getBoardAssignmentPermissions(
      buildProfile("general_director", "Фридман Евгений Михайлович"),
    ),
    {
      canView: true,
      canCreate: false,
      canExecute: true,
      canReview: false,
    },
  );

  for (const position of [
    "board_chair",
    "board_deputy_chair",
    "board_assignment_reviewer",
  ]) {
    assert.equal(
      getBoardAssignmentPermissions(buildProfile(position, "Проверяющий"))
        .canReview,
      true,
      position,
    );
  }
});

test("board assignment actions enforce the execution and review lifecycle", () => {
  assert.deepEqual(
    validateBoardAssignmentAction(
      { action: "submit_for_review", comment: "Работа выполнена." },
      "in_progress",
      { canView: true, canCreate: false, canExecute: true, canReview: false },
    ),
    {
      ok: true,
      value: {
        action: "submit_for_review",
        comment: "Работа выполнена.",
        status: "under_review",
      },
    },
  );
  assert.equal(
    validateBoardAssignmentAction(
      { action: "complete", comment: "Принято." },
      "under_review",
      { canView: true, canCreate: false, canExecute: true, canReview: false },
    ).ok,
    false,
  );
  assert.deepEqual(
    validateBoardAssignmentAction(
      { action: "return_for_revision", comment: "Нужны подтверждающие данные." },
      "under_review",
      { canView: true, canCreate: true, canExecute: false, canReview: true },
    ),
    {
      ok: true,
      value: {
        action: "return_for_revision",
        comment: "Нужны подтверждающие данные.",
        status: "revision_requested",
      },
    },
  );
  assert.equal(
    validateBoardAssignmentAction(
      { action: "complete", comment: "" },
      "under_review",
      { canView: true, canCreate: true, canExecute: false, canReview: true },
    ).ok,
    false,
  );
});

function buildProfile(
  position: string,
  displayName: string,
): ServerUserProfile {
  const capabilities =
    position === "general_director"
      ? [
          "business.view_board_assignments",
          "business.execute_board_assignments",
        ] as const
      : position === "board_chair" ||
          position === "board_deputy_chair" ||
          position === "board_assignment_reviewer"
        ? [
            "business.view_board_assignments",
            "business.create_board_assignments",
            "business.review_board_assignments",
          ] as const
        : [
            "business.view_board_assignments",
            "business.create_board_assignments",
          ] as const;

  return {
    userId: `${position}-user`,
    displayName,
    accountType: "business_owner",
    activeAccess: {
      accountId: `${position}-access`,
      accountType: "business_owner",
      position,
      positionDisplayName: position,
      displayName: position,
      scope: { kind: "organization" },
      capabilities: [...capabilities],
      navigationItems: ["business.board_assignments"],
      issuedAt: "2026-07-10T08:00:00.000Z",
    },
    receivedAt: "2026-07-10T08:00:00.000Z",
  };
}
