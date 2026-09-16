import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type { DirectorAssignment, PersonnelEmployee } from "../contracts/directorAssignments.js";
import { DirectorAssignmentError } from "../domain/directorAssignment.js";

type JsonRow = RowDataPacket & { payload: string | object };
function payload<T>(row: JsonRow): T {
  return (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as T;
}

/** Mutations must be called inside the application's audited transaction. */
export function createDirectorAssignmentsRepository(pool: DatabasePool) {
  async function accountEmployees(userId?: string, lock = false): Promise<PersonnelEmployee[]> {
    const [rows] = await pool.query<(RowDataPacket & { user_id: string; full_name: string; position_name: string })[]>(`
      select users.id as user_id, users.display_name as full_name, positions.display_name as position_name
      from app_users users
      join account_accesses accesses on accesses.user_id = users.id
      join account_positions positions on json_contains(coalesce(accesses.position_codes, json_array(accesses.position_code)), json_quote(positions.id))
      where users.status = 'active' and accesses.is_active = 1 and accesses.scope_kind = 'organization'
        ${userId === undefined ? "" : "and users.id = ?"}
      order by users.display_name, users.id, positions.sort_order, positions.id
      ${lock ? "for update" : ""}`, userId === undefined ? [] : [userId]);
    const employees = new Map<string, PersonnelEmployee>();
    for (const row of rows) {
      const current = employees.get(row.user_id);
      if (current) {
        if (!current.position.split(" / ").includes(row.position_name)) current.position += ` / ${row.position_name}`;
      } else employees.set(row.user_id, { id: `account:${row.user_id}`, revision: 0, fullName: row.full_name, position: row.position_name, department: "", category: "", userId: row.user_id, active: true });
    }
    return [...employees.values()];
  }
  async function listEmployees() {
    const [rows] = await pool.query<JsonRow[]>("select payload from personnel_employees order by full_name, id");
    return rows.map(row => payload<PersonnelEmployee>(row));
  }
  async function readEmployee(id: string, lock = false) {
    const [rows] = await pool.query<JsonRow[]>(`select payload from personnel_employees where id = ? ${lock ? "for update" : ""}`, [id]);
    return rows[0] ? payload<PersonnelEmployee>(rows[0]) : undefined;
  }
  return {
    listEmployees,
    readEmployee,
    async listAssignableEmployees() {
      const personnel = (await listEmployees()).filter(employee => employee.active);
      const linkedUsers = new Set(personnel.map(employee => employee.userId).filter(Boolean));
      return [...personnel, ...(await accountEmployees()).filter(employee => !linkedUsers.has(employee.userId))]
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
    },
    async readAssignableEmployee(id: string, lock = false) {
      return id.startsWith("account:") ? (await accountEmployees(id.slice(8), lock))[0] : readEmployee(id, lock);
    },
    async listUserOptions() {
      const [rows] = await pool.query<(RowDataPacket & { id: string; displayName: string; login: string })[]>(
        "select id, display_name as displayName, login from app_users where status = 'active' order by display_name, id",
      );
      return rows.map(row => ({ id: row.id, displayName: row.displayName, login: row.login }));
    },
    async saveEmployee(employee: PersonnelEmployee, create: boolean) {
      if (employee.userId !== null) {
        const [users] = await pool.query<RowDataPacket[]>("select id from app_users where id = ? and status = 'active' for update", [employee.userId]);
        if (!users.length) throw new DirectorAssignmentError("Учётная запись недоступна.");
      }
      if (create) {
        await pool.query("insert into personnel_employees (id, full_name, user_id, revision, payload) values (?, ?, ?, ?, ?)",
          [employee.id, employee.fullName, employee.userId, employee.revision, JSON.stringify(employee)]);
      } else {
        const [result] = await pool.query<ResultSetHeader>("update personnel_employees set full_name = ?, user_id = ?, revision = ?, payload = ? where id = ? and revision = ?",
          [employee.fullName, employee.userId, employee.revision, JSON.stringify(employee), employee.id, employee.revision - 1]);
        if (result.affectedRows !== 1) throw new DirectorAssignmentError("Сотрудник уже изменён. Обновите список.", 409);
      }
    },
    async list() {
      const [rows] = await pool.query<JsonRow[]>("select payload from director_assignments order by assigned_on desc, sequence_id desc");
      return rows.map(row => payload<DirectorAssignment>(row));
    },
    async listByBoardAssignment(boardAssignmentId: string) {
      const [rows] = await pool.query<JsonRow[]>(
        `select payload from director_assignments
         where json_unquote(json_extract(payload, '$.sourceBoardAssignmentId')) = ?
         order by sequence_id desc`, [boardAssignmentId],
      );
      return rows.map(row => payload<DirectorAssignment>(row));
    },
    async listBoardAssignmentRevisions(boardAssignmentId: string) {
      const [rows] = await pool.query<JsonRow[]>(
        `select history.payload from director_assignment_history history
         join director_assignments assignments on assignments.id = history.assignment_id
         where history.event_type = 'revision'
           and json_unquote(json_extract(assignments.payload, '$.sourceBoardAssignmentId')) = ?
         order by history.sequence_id asc`, [boardAssignmentId],
      );
      return rows.map(row => payload<DirectorAssignment>(row));
    },
    async read(id: string, lock = false) {
      const [rows] = await pool.query<JsonRow[]>(`select payload from director_assignments where id = ? ${lock ? "for update" : ""}`, [id]);
      return rows[0] ? payload<DirectorAssignment>(rows[0]) : undefined;
    },
    async create(assignment: DirectorAssignment) {
      const [result] = await pool.query<ResultSetHeader>("insert into director_assignments (id, assigned_on, revision, source_key, payload) values (?, ?, ?, ?, ?)",
        [assignment.id, assignment.assignedOn, assignment.revision, assignment.source?.key ?? null, JSON.stringify(assignment)]);
      if (!assignment.number) {
        assignment.number = `ГД-${result.insertId}`;
        await pool.query("update director_assignments set payload = ? where id = ?", [JSON.stringify(assignment), assignment.id]);
      }
      return assignment;
    },
    async update(assignment: DirectorAssignment, previous: DirectorAssignment) {
      const [result] = await pool.query<ResultSetHeader>("update director_assignments set assigned_on = ?, revision = ?, payload = ? where id = ? and revision = ?",
        [assignment.assignedOn, assignment.revision, JSON.stringify(assignment), assignment.id, previous.revision]);
      if (result.affectedRows !== 1) throw new DirectorAssignmentError("Поручение уже изменено. Обновите список.", 409);
      await pool.query("insert into director_assignment_history (id, assignment_id, event_type, payload) values (?, ?, 'revision', ?)", [randomUUID(), assignment.id, JSON.stringify(previous)]);
      return assignment;
    },
    async addCompletion(assignment: DirectorAssignment) {
      await pool.query("insert into director_assignment_history (id, assignment_id, event_type, payload) values (?, ?, 'completion', ?)", [randomUUID(), assignment.id, JSON.stringify(assignment)]);
    },
    async listCompletions() {
      const [rows] = await pool.query<(JsonRow & { id: string })[]>("select id, payload from director_assignment_history where event_type = 'completion' order by sequence_id desc");
      return rows.map(row => ({ id: row.id, assignment: payload<DirectorAssignment>(row) }));
    },
    async addDocument(assignmentId: string, id: string, fileName: string, pdf: Buffer) {
      await pool.query("insert into director_assignment_documents (id, assignment_id, file_name, pdf) values (?, ?, ?, ?)", [id, assignmentId, fileName, pdf]);
    },
    async readDocument(assignmentId: string, documentId: string) {
      const [rows] = await pool.query<(RowDataPacket & { fileName: string; pdf: Buffer })[]>("select file_name as fileName, pdf from director_assignment_documents where assignment_id = ? and id = ?", [assignmentId, documentId]);
      return rows[0];
    },
  };
}

export type DirectorAssignmentsRepository = ReturnType<typeof createDirectorAssignmentsRepository>;
