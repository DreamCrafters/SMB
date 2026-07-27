import assert from "node:assert/strict";
import test from "node:test";
import type { ServerUserProfile } from "./auth.js";
import {
  getBoardAssignmentPermissions,
  validateBoardAssignmentAction,
  validateBoardAssignmentCreateRequest,
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
    dueDate: "Ежемесячно, не позднее 5-го числа следующего месяца",
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
      dueDate: "Ежемесячно, не позднее 5-го числа следующего месяца",
      comment: "Поручение внесено по протоколу.",
    },
  });
});

test("board assignment creation rejects missing fields, an invalid meeting date and unknown input", () => {
  const result = validateBoardAssignmentCreateRequest({
    meetingDate: "2026-07-32",
    protocolNumber: "",
    decisionNumber: "",
    summary: "",
    details: "",
    coExecutors: "Экономист",
    dueDate: "",
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
  assert.match(result.errors.join(" "), /Срок исполнения/u);
  assert.match(result.errors.join(" "), /неизвестные поля/u);
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
