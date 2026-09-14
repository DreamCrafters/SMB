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
  return {
    async listEmployees() {
      const [rows] = await pool.query<JsonRow[]>("select payload from personnel_employees order by full_name, id");
      return rows.map(row => payload<PersonnelEmployee>(row));
    },
    async readEmployee(id: string, lock = false) {
      const [rows] = await pool.query<JsonRow[]>(`select payload from personnel_employees where id = ? ${lock ? "for update" : ""}`, [id]);
      return rows[0] ? payload<PersonnelEmployee>(rows[0]) : undefined;
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
