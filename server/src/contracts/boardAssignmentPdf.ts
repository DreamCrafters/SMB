export type BoardAssignmentPdfRequest = {
  mode: "register" | "assignment";
  source: "current" | "history";
  entries: Array<{ id: string; expectedUpdatedAt: string }>;
};
