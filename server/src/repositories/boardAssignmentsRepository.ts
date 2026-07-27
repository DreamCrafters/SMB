import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import {
  formatBoardAssignmentSchedule,
  isBoardAssignmentRecurrence,
  isBoardAssignmentStatus,
  type BoardAssignmentRecurrence,
  type BoardAssignmentStatus,
  type ValidatedBoardAssignmentCreateRequest,
  type ValidatedBoardAssignmentUpdateRequest,
} from "../domain/boardAssignment.js";

export type BoardAssignmentActor = {
  userId: string;
  accountId: string;
  displayName: string;
};

export type BoardAssignmentComment = {
  id: string;
  authorDisplayName: string;
  comment: string;
  statusAfter: BoardAssignmentStatus;
  createdAt: string;
};

export type BoardAssignmentSummary = {
  id: string;
  meetingDate: string;
  protocolNumber: string;
  decisionNumber: string;
  summary: string;
  coExecutors: string[];
  dueDate: string;
  recurrence: BoardAssignmentRecurrence;
  activeFrom: string;
  activeTo: string;
  currentOccurrenceDate: string;
  status: BoardAssignmentStatus;
  createdByDisplayName: string;
  createdAt: string;
  updatedAt: string;
};

export type BoardAssignment = BoardAssignmentSummary & {
  details: string;
  sourceMaterial?: {
    key: string;
    fileName: string;
  };
  comments: BoardAssignmentComment[];
};

export type BoardAssignmentCompletionSummary = {
  id: string;
  assignmentId: string;
  occurrenceDate: string;
  completedByDisplayName: string;
  completedAt: string;
  assignment: BoardAssignmentSummary;
};

export type BoardAssignmentCompletion = Omit<
  BoardAssignmentCompletionSummary,
  "assignment"
> & {
  assignment: BoardAssignment;
};

export type BoardAssignmentFilters = {
  status?: BoardAssignmentStatus;
  meetingDateFrom?: string;
  meetingDateTo?: string;
  query?: string;
};

export type BoardAssignmentsRepository = {
  list: (
    filters?: BoardAssignmentFilters,
    options?: { activeOn?: string },
  ) => Promise<BoardAssignmentSummary[]>;
  readById: (id: string) => Promise<BoardAssignment | undefined>;
  readByIdForUpdate: (id: string) => Promise<BoardAssignment | undefined>;
  create: (input: {
    assignment: ValidatedBoardAssignmentCreateRequest;
    actor: BoardAssignmentActor;
  }) => Promise<BoardAssignment>;
  update: (input: {
    assignmentId: string;
    expectedUpdatedAt: string;
    currentOccurrenceDate: string;
    current: BoardAssignment;
    assignment: Omit<
      ValidatedBoardAssignmentUpdateRequest,
      "expectedUpdatedAt"
    >;
    actor: BoardAssignmentActor;
  }) => Promise<BoardAssignment>;
  applyAction: (input: {
    assignmentId: string;
    expectedStatus: BoardAssignmentStatus;
    status: BoardAssignmentStatus;
    commentStatus: BoardAssignmentStatus;
    currentOccurrenceDate: string;
    completedOccurrenceDate?: string;
    comment: string;
    actor: BoardAssignmentActor;
  }) => Promise<BoardAssignment>;
  listCompletions: (
    filters?: Omit<BoardAssignmentFilters, "status">,
  ) => Promise<BoardAssignmentCompletionSummary[]>;
  readCompletionById: (
    id: string,
  ) => Promise<BoardAssignmentCompletion | undefined>;
};

export class BoardAssignmentChangedError extends Error {
  constructor() {
    super("Поручение уже изменено другим пользователем.");
    this.name = "BoardAssignmentChangedError";
  }
}

type BoardAssignmentRow = RowDataPacket & {
  id: string;
  meeting_date: Date | string;
  protocol_number: string;
  decision_number: string;
  summary: string;
  details: string;
  co_executors: unknown;
  due_date: string;
  recurrence: string;
  active_from: Date | string;
  active_to: Date | string;
  current_occurrence_date: Date | string;
  status: string;
  source_material_key: string | null;
  source_material_file_name: string | null;
  created_by_user_id: string;
  created_by_account_id: string;
  created_by_display_name: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type BoardAssignmentCommentRow = RowDataPacket & {
  id: string;
  assignment_id: string;
  author_user_id: string;
  author_account_id: string;
  author_display_name: string;
  comment_text: string;
  status_after: string;
  created_at: Date | string;
};

type BoardAssignmentCompletionRow = RowDataPacket & {
  id: string;
  assignment_id: string;
  occurrence_date: Date | string;
  snapshot: unknown;
  completed_by_display_name: string;
  completed_at: Date | string;
};

type BoardAssignmentsRepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const assignmentSelect = `
  select assignments.id, assignments.meeting_date,
    assignments.protocol_number, assignments.decision_number,
    assignments.summary, assignments.details, assignments.co_executors,
    assignments.due_date, assignments.recurrence,
    assignments.active_from, assignments.active_to,
    assignments.current_occurrence_date, assignments.status,
    assignments.source_material_key, assignments.source_material_file_name,
    assignments.created_by_user_id, assignments.created_by_account_id,
    assignments.created_by_display_name, assignments.created_at,
    assignments.updated_at
  from board_assignments assignments
`;

export function createBoardAssignmentsRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: BoardAssignmentsRepositoryOptions = {},
): BoardAssignmentsRepository {
  async function list(
    filters: BoardAssignmentFilters = {},
    { activeOn }: { activeOn?: string } = {},
  ) {
    const conditions: string[] = [];
    const parameters: unknown[] = [];

    addFilter(conditions, parameters, filters.status, "assignments.status = ?");
    addFilter(
      conditions,
      parameters,
      filters.meetingDateFrom,
      "assignments.meeting_date >= ?",
    );
    addFilter(
      conditions,
      parameters,
      filters.meetingDateTo,
      "assignments.meeting_date <= ?",
    );
    if (filters.query !== undefined) {
      const pattern = `%${filters.query.toLocaleLowerCase("ru-RU")}%`;
      conditions.push(
        `(lower(assignments.summary) like ?
          or lower(assignments.details) like ?
          or lower(assignments.co_executors) like ?
          or lower(assignments.protocol_number) like ?
          or lower(assignments.decision_number) like ?
          or lower(assignments.due_date) like ?)`,
      );
      parameters.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }
    if (activeOn !== undefined) {
      conditions.push(
        `assignments.status in ('in_progress', 'revision_requested')`,
        "assignments.current_occurrence_date <= ?",
        `assignments.current_occurrence_date
          between assignments.active_from and assignments.active_to`,
      );
      parameters.push(activeOn);
    }

    const [rows] = await pool.query<BoardAssignmentRow[]>(
      `${assignmentSelect}
      ${conditions.length === 0 ? "" : `where ${conditions.join(" and ")}`}
      order by
        ${activeOn === undefined
          ? ""
          : "assignments.current_occurrence_date asc,"}
        case when assignments.status = 'completed' then 1 else 0 end asc,
        assignments.meeting_date desc,
        assignments.created_at desc`,
      parameters,
    );

    return rows.map(mapSummary);
  }

  async function readByIdInternal(id: string, forUpdate: boolean) {
    const [rows] = await pool.query<BoardAssignmentRow[]>(
      `${assignmentSelect}
      where assignments.id = ?
      limit 1
      ${forUpdate ? "for update" : ""}`,
      [id],
    );
    const row = rows[0];

    if (row === undefined) {
      return undefined;
    }

    const [commentRows] = await pool.query<BoardAssignmentCommentRow[]>(
      `select id, assignment_id, author_user_id, author_account_id,
        author_display_name, comment_text, status_after, created_at
      from board_assignment_comments
      where assignment_id = ?
      order by created_at asc, sequence_id asc`,
      [id],
    );

    return {
      ...mapSummary(row),
      details: row.details,
      ...(
        row.source_material_key === null ||
          row.source_material_file_name === null
          ? {}
          : {
              sourceMaterial: {
                key: row.source_material_key,
                fileName: row.source_material_file_name,
              },
            }
      ),
      comments: commentRows.map(mapComment),
    };
  }

  function readById(id: string) {
    return readByIdInternal(id, false);
  }

  function readByIdForUpdate(id: string) {
    return readByIdInternal(id, true);
  }

  async function create({
    assignment,
    actor,
  }: {
    assignment: ValidatedBoardAssignmentCreateRequest;
    actor: BoardAssignmentActor;
  }) {
    const assignmentId = createId();
    const createdAt = formatSqlDateTime(now());
    const dueDate = formatBoardAssignmentSchedule(assignment);

    await pool.query(
      `insert into board_assignments (
        id, meeting_date, protocol_number, decision_number, summary, details,
        co_executors, due_date, recurrence, active_from, active_to,
        current_occurrence_date, status, created_by_user_id,
        created_by_account_id, created_by_display_name, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?)`,
      [
        assignmentId,
        assignment.meetingDate,
        assignment.protocolNumber,
        assignment.decisionNumber,
        assignment.summary,
        assignment.details,
        JSON.stringify(assignment.coExecutors),
        dueDate,
        assignment.recurrence,
        assignment.activeFrom,
        assignment.activeTo,
        assignment.activeFrom,
        actor.userId,
        actor.accountId,
        actor.displayName,
        createdAt,
        createdAt,
      ],
    );

    if (assignment.comment !== undefined) {
      await insertComment({
        assignmentId,
        comment: assignment.comment,
        status: "in_progress",
        actor,
        createdAt,
      });
    }

    const saved = await readById(assignmentId);

    if (saved === undefined) {
      throw new Error("Saved board assignment could not be read.");
    }

    return saved;
  }

  async function update({
    assignmentId,
    expectedUpdatedAt,
    currentOccurrenceDate,
    current,
    assignment,
    actor,
  }: {
    assignmentId: string;
    expectedUpdatedAt: string;
    currentOccurrenceDate: string;
    current: BoardAssignment;
    assignment: Omit<
      ValidatedBoardAssignmentUpdateRequest,
      "expectedUpdatedAt"
    >;
    actor: BoardAssignmentActor;
  }) {
    const changedAt = formatSqlDateTime(now());
    const dueDate = formatBoardAssignmentSchedule(assignment);
    const [result] = await pool.query<ResultSetHeader>(
      `update board_assignments
      set meeting_date = ?, protocol_number = ?, decision_number = ?,
        summary = ?, details = ?, co_executors = ?, due_date = ?,
        recurrence = ?, active_from = ?, active_to = ?,
        current_occurrence_date = ?, updated_at = ?
      where id = ? and updated_at = ? and status <> 'completed'`,
      [
        assignment.meetingDate,
        assignment.protocolNumber,
        assignment.decisionNumber,
        assignment.summary,
        assignment.details,
        JSON.stringify(assignment.coExecutors),
        dueDate,
        assignment.recurrence,
        assignment.activeFrom,
        assignment.activeTo,
        currentOccurrenceDate,
        changedAt,
        assignmentId,
        formatSqlDateTime(new Date(expectedUpdatedAt)),
      ],
    );

    if (result.affectedRows !== 1) {
      throw new BoardAssignmentChangedError();
    }

    await insertComment({
      assignmentId,
      comment: assignment.comment,
      status: current.status,
      actor,
      createdAt: changedAt,
    });

    const saved = await readById(assignmentId);

    if (saved === undefined) {
      throw new Error("Updated board assignment could not be read.");
    }

    await pool.query(
      `insert into board_assignment_edit_revisions (
        id, assignment_id, before_snapshot, after_snapshot, edit_comment,
        edited_by_user_id, edited_by_account_id, edited_by_display_name,
        created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        createId(),
        assignmentId,
        JSON.stringify(current),
        JSON.stringify(saved),
        assignment.comment,
        actor.userId,
        actor.accountId,
        actor.displayName,
        changedAt,
      ],
    );

    return saved;
  }

  async function applyAction({
    assignmentId,
    expectedStatus,
    status,
    commentStatus,
    currentOccurrenceDate,
    completedOccurrenceDate,
    comment,
    actor,
  }: {
    assignmentId: string;
    expectedStatus: BoardAssignmentStatus;
    status: BoardAssignmentStatus;
    commentStatus: BoardAssignmentStatus;
    currentOccurrenceDate: string;
    completedOccurrenceDate?: string;
    comment: string;
    actor: BoardAssignmentActor;
  }) {
    const changedAt = formatSqlDateTime(now());
    const [result] = await pool.query<ResultSetHeader>(
      `update board_assignments
      set status = ?, current_occurrence_date = ?, updated_at = ?
      where id = ? and status = ?`,
      [
        status,
        currentOccurrenceDate,
        changedAt,
        assignmentId,
        expectedStatus,
      ],
    );

    if (result.affectedRows !== 1) {
      throw new BoardAssignmentChangedError();
    }

    await insertComment({
      assignmentId,
      comment,
      status: commentStatus,
      actor,
      createdAt: changedAt,
    });

    const saved = await readById(assignmentId);

    if (saved === undefined) {
      throw new Error("Updated board assignment could not be read.");
    }

    if (completedOccurrenceDate !== undefined) {
      const snapshot: BoardAssignment = {
        ...saved,
        currentOccurrenceDate: completedOccurrenceDate,
        status: "completed",
      };
      await pool.query(
        `insert into board_assignment_completion_snapshots (
          id, assignment_id, occurrence_date, snapshot,
          completed_by_user_id, completed_by_account_id,
          completed_by_display_name, completed_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createId(),
          assignmentId,
          completedOccurrenceDate,
          JSON.stringify(snapshot),
          actor.userId,
          actor.accountId,
          actor.displayName,
          changedAt,
        ],
      );
    }

    return saved;
  }

  async function listCompletions(
    filters: Omit<BoardAssignmentFilters, "status"> = {},
  ) {
    const conditions: string[] = [];
    const parameters: unknown[] = [];

    addFilter(
      conditions,
      parameters,
      filters.meetingDateFrom,
      "json_unquote(json_extract(completions.snapshot, '$.meetingDate')) >= ?",
    );
    addFilter(
      conditions,
      parameters,
      filters.meetingDateTo,
      "json_unquote(json_extract(completions.snapshot, '$.meetingDate')) <= ?",
    );
    if (filters.query !== undefined) {
      const pattern = `%${filters.query.toLocaleLowerCase("ru-RU")}%`;
      conditions.push(
        `(lower(json_unquote(json_extract(completions.snapshot, '$.summary'))) like ?
          or lower(json_unquote(json_extract(completions.snapshot, '$.details'))) like ?
          or lower(json_extract(completions.snapshot, '$.coExecutors')) like ?
          or lower(json_unquote(json_extract(completions.snapshot, '$.protocolNumber'))) like ?
          or lower(json_unquote(json_extract(completions.snapshot, '$.decisionNumber'))) like ?)`,
      );
      parameters.push(pattern, pattern, pattern, pattern, pattern);
    }

    const [rows] = await pool.query<BoardAssignmentCompletionRow[]>(
      `select completions.id, completions.assignment_id,
        completions.occurrence_date, completions.snapshot,
        completions.completed_by_display_name, completions.completed_at
      from board_assignment_completion_snapshots completions
      ${conditions.length === 0 ? "" : `where ${conditions.join(" and ")}`}
      order by completions.completed_at desc, completions.sequence_id desc`,
      parameters,
    );

    return rows.map(mapCompletionSummary);
  }

  async function readCompletionById(id: string) {
    const [rows] = await pool.query<BoardAssignmentCompletionRow[]>(
      `select completions.id, completions.assignment_id,
        completions.occurrence_date, completions.snapshot,
        completions.completed_by_display_name, completions.completed_at
      from board_assignment_completion_snapshots completions
      where completions.id = ?
      limit 1`,
      [id],
    );
    const row = rows[0];

    return row === undefined ? undefined : mapCompletion(row);
  }

  async function insertComment({
    assignmentId,
    comment,
    status,
    actor,
    createdAt,
  }: {
    assignmentId: string;
    comment: string;
    status: BoardAssignmentStatus;
    actor: BoardAssignmentActor;
    createdAt: string;
  }) {
    await pool.query(
      `insert into board_assignment_comments (
        id, assignment_id, author_user_id, author_account_id,
        author_display_name, comment_text, status_after, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        createId(),
        assignmentId,
        actor.userId,
        actor.accountId,
        actor.displayName,
        comment,
        status,
        createdAt,
      ],
    );
  }

  return {
    list,
    readById,
    readByIdForUpdate,
    create,
    update,
    applyAction,
    listCompletions,
    readCompletionById,
  };
}

function mapSummary(row: BoardAssignmentRow): BoardAssignmentSummary {
  if (!isBoardAssignmentStatus(row.status)) {
    throw new Error("Stored board assignment status is invalid.");
  }
  if (!isBoardAssignmentRecurrence(row.recurrence)) {
    throw new Error("Stored board assignment recurrence is invalid.");
  }

  return {
    id: row.id,
    meetingDate: formatDateOnly(row.meeting_date),
    protocolNumber: row.protocol_number,
    decisionNumber: row.decision_number,
    summary: row.summary,
    coExecutors: readStringArray(row.co_executors),
    dueDate: row.due_date,
    recurrence: row.recurrence,
    activeFrom: formatDateOnly(row.active_from),
    activeTo: formatDateOnly(row.active_to),
    currentOccurrenceDate: formatDateOnly(row.current_occurrence_date),
    status: row.status,
    createdByDisplayName: row.created_by_display_name,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapComment(row: BoardAssignmentCommentRow): BoardAssignmentComment {
  if (!isBoardAssignmentStatus(row.status_after)) {
    throw new Error("Stored board assignment comment status is invalid.");
  }

  return {
    id: row.id,
    authorDisplayName: row.author_display_name,
    comment: row.comment_text,
    statusAfter: row.status_after,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapCompletionSummary(
  row: BoardAssignmentCompletionRow,
): BoardAssignmentCompletionSummary {
  const completion = mapCompletion(row);
  const { details: _details, sourceMaterial: _sourceMaterial, comments: _comments, ...summary } =
    completion.assignment;

  return {
    ...completion,
    assignment: summary,
  };
}

function mapCompletion(
  row: BoardAssignmentCompletionRow,
): BoardAssignmentCompletion {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    occurrenceDate: formatDateOnly(row.occurrence_date),
    completedByDisplayName: row.completed_by_display_name,
    completedAt: new Date(row.completed_at).toISOString(),
    assignment: readBoardAssignmentSnapshot(row.snapshot),
  };
}

function addFilter(
  conditions: string[],
  parameters: unknown[],
  value: string | undefined,
  condition: string,
) {
  if (value === undefined) {
    return;
  }

  conditions.push(condition);
  parameters.push(value);
}

function readStringArray(value: unknown) {
  const parsed = typeof value === "string" ? parseJson(value) : value;

  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("Stored board assignment co-executors are invalid.");
  }

  return parsed;
}

function readBoardAssignmentSnapshot(value: unknown): BoardAssignment {
  const parsed = typeof value === "string" ? parseJson(value) : value;

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error("Stored board assignment completion snapshot is invalid.");
  }

  const snapshot = parsed as Partial<BoardAssignment>;
  if (
    typeof snapshot.id !== "string" ||
    typeof snapshot.meetingDate !== "string" ||
    typeof snapshot.protocolNumber !== "string" ||
    typeof snapshot.decisionNumber !== "string" ||
    typeof snapshot.summary !== "string" ||
    typeof snapshot.details !== "string" ||
    !Array.isArray(snapshot.coExecutors) ||
    !snapshot.coExecutors.every((item) => typeof item === "string") ||
    typeof snapshot.dueDate !== "string" ||
    !isBoardAssignmentRecurrence(snapshot.recurrence) ||
    typeof snapshot.activeFrom !== "string" ||
    typeof snapshot.activeTo !== "string" ||
    typeof snapshot.currentOccurrenceDate !== "string" ||
    !isBoardAssignmentStatus(snapshot.status) ||
    typeof snapshot.createdByDisplayName !== "string" ||
    typeof snapshot.createdAt !== "string" ||
    typeof snapshot.updatedAt !== "string" ||
    !Array.isArray(snapshot.comments) ||
    !snapshot.comments.every(isBoardAssignmentCommentSnapshot) ||
    (
      snapshot.sourceMaterial !== undefined &&
      (
        snapshot.sourceMaterial === null ||
        typeof snapshot.sourceMaterial !== "object" ||
        typeof snapshot.sourceMaterial.key !== "string" ||
        typeof snapshot.sourceMaterial.fileName !== "string"
      )
    )
  ) {
    throw new Error("Stored board assignment completion snapshot is invalid.");
  }

  return snapshot as BoardAssignment;
}

function isBoardAssignmentCommentSnapshot(
  value: unknown,
): value is BoardAssignmentComment {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const comment = value as Partial<BoardAssignmentComment>;
  return typeof comment.id === "string" &&
    typeof comment.authorDisplayName === "string" &&
    typeof comment.comment === "string" &&
    isBoardAssignmentStatus(comment.statusAfter) &&
    typeof comment.createdAt === "string";
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Stored board assignment JSON is invalid.");
  }
}

function formatDateOnly(value: Date | string) {
  if (typeof value === "string") {
    const match = /^\d{4}-\d{2}-\d{2}/u.exec(value);

    if (match !== null) {
      return match[0];
    }
  }

  return new Date(value).toISOString().slice(0, 10);
}

function formatSqlDateTime(value: Date) {
  return value.toISOString().slice(0, 23).replace("T", " ");
}
