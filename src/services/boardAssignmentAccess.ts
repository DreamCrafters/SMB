import type {
  AccountCapability,
  AccountPosition,
} from "../contracts/accounts.js";

// Local dev-session fallback only. Production authorization is always derived
// and enforced by the backend from the assigned position.
export function resolveLocalBoardAssignmentCapabilities(
  position: AccountPosition,
  baseCapabilities: readonly AccountCapability[],
): AccountCapability[] {
  const actionCapabilities: AccountCapability[] =
    position === "general_director"
      ? ["business.execute_board_assignments"]
      : (
          position === "board_chair" ||
          position === "board_deputy_chair" ||
          position === "board_assignment_reviewer"
        )
        ? [
            "business.create_board_assignments",
            "business.review_board_assignments",
          ]
        : position === "board_member"
          ? ["business.create_board_assignments"]
          : [];

  return Array.from(new Set([
    ...baseCapabilities,
    "business.view_board_assignments",
    ...actionCapabilities,
  ]));
}
