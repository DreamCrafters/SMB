import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import {
  isBoardAssignmentStatus,
  type BoardAssignmentStatus,
  type ValidatedBoardAssignmentCreateRequest,
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

export type BoardAssignmentFilters = {
  status?: BoardAssignmentStatus;
  meetingDateFrom?: string;
  meetingDateTo?: string;
  query?: string;
};

export type BoardAssignmentsRepository = {
  list: (filters?: BoardAssignmentFilters) => Promise<BoardAssignmentSummary[]>;
  readById: (id: string) => Promise<BoardAssignment | undefined>;
  readByIdForUpdate: (id: string) => Promise<BoardAssignment | undefined>;
  create: (input: {
    assignment: ValidatedBoardAssignmentCreateRequest;
    actor: BoardAssignmentActor;
  }) => Promise<BoardAssignment>;
  applyAction: (input: {
    assignmentId: string;
    expectedStatus: BoardAssignmentStatus;
    status: BoardAssignmentStatus;
    comment: string;
    actor: BoardAssignmentActor;
  }) => Promise<BoardAssignment>;
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

type BoardAssignmentsRepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const assignmentSelect = `
  select assignments.id, assignments.meeting_date,
    assignments.protocol_number, assignments.decision_number,
    assignments.summary, assignments.details, assignments.co_executors,
    assignments.due_date, assignments.status,
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
  async function list(filters: BoardAssignmentFilters = {}) {
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

    const [rows] = await pool.query<BoardAssignmentRow[]>(
      `${assignmentSelect}
      ${conditions.length === 0 ? "" : `where ${conditions.join(" and ")}`}
      order by
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

    await pool.query(
      `insert into board_assignments (
        id, meeting_date, protocol_number, decision_number, summary, details,
        co_executors, due_date, status, created_by_user_id,
        created_by_account_id, created_by_display_name, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?)`,
      [
        assignmentId,
        assignment.meetingDate,
        assignment.protocolNumber,
        assignment.decisionNumber,
        assignment.summary,
        assignment.details,
        JSON.stringify(assignment.coExecutors),
        assignment.dueDate,
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

  async function applyAction({
    assignmentId,
    expectedStatus,
    status,
    comment,
    actor,
  }: {
    assignmentId: string;
    expectedStatus: BoardAssignmentStatus;
    status: BoardAssignmentStatus;
    comment: string;
    actor: BoardAssignmentActor;
  }) {
    const changedAt = formatSqlDateTime(now());
    const [result] = await pool.query<ResultSetHeader>(
      `update board_assignments
      set status = ?, updated_at = ?
      where id = ? and status = ?`,
      [status, changedAt, assignmentId, expectedStatus],
    );

    if (result.affectedRows !== 1) {
      throw new BoardAssignmentChangedError();
    }

    await insertComment({
      assignmentId,
      comment,
      status,
      actor,
      createdAt: changedAt,
    });

    const saved = await readById(assignmentId);

    if (saved === undefined) {
      throw new Error("Updated board assignment could not be read.");
    }

    return saved;
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
    applyAction,
  };
}

function mapSummary(row: BoardAssignmentRow): BoardAssignmentSummary {
  if (!isBoardAssignmentStatus(row.status)) {
    throw new Error("Stored board assignment status is invalid.");
  }

  return {
    id: row.id,
    meetingDate: formatDateOnly(row.meeting_date),
    protocolNumber: row.protocol_number,
    decisionNumber: row.decision_number,
    summary: row.summary,
    coExecutors: readStringArray(row.co_executors),
    dueDate: row.due_date,
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
