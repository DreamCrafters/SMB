import { directorReminderLeaseSeconds, type DirectorReminderDelivery } from "../domain/directorAssignmentReminders.js";
import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import { assignmentInboxNavigationItem, assignmentRegistries, type AssignmentRegistryId, type DirectorAssignment, type PersonnelEmployee } from "../contracts/directorAssignments.js";
import { DirectorAssignmentError } from "../domain/directorAssignment.js";

type JsonRow = RowDataPacket & { payload: string | object };
function jsonList(value: unknown): string[] {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}
function payload<T>(row: JsonRow): T {
  return (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as T;
}

// Apply the current status rule without rewriting immutable legacy snapshots.
function assignmentPayload(row: JsonRow): DirectorAssignment {
  const assignment = payload<DirectorAssignment>(row);
  return assignment.status === "completed" ? { ...assignment, needsClarification: false } : assignment;
}

/** Fixed table names per registry: registries never share assignment rows, history or files. */
const registryTables = {
  director: { assignments: "director_assignments", history: "director_assignment_history", documents: "director_assignment_documents", reminders: "director_assignment_reminder_deliveries" },
  collegium: { assignments: "collegium_assignments", history: "collegium_assignment_history", documents: "collegium_assignment_documents", reminders: "collegium_assignment_reminder_deliveries" },
} as const satisfies Record<AssignmentRegistryId, Record<string, string>>;

/** Mutations must be called inside the application's audited transaction. */
export function createDirectorAssignmentsRepository(pool: DatabasePool, registryId: AssignmentRegistryId) {
  const tables = registryTables[registryId];
  const registry = assignmentRegistries[registryId];
  async function accountEmployees(userId?: string, lock = false): Promise<PersonnelEmployee[]> {
    const [rows] = await pool.query<(RowDataPacket & { user_id: string; full_name: string; position_name: string; navigation_items?: unknown; capabilities?: unknown })[]>(`
      select users.id as user_id, users.display_name as full_name, positions.display_name as position_name,
        positions.navigation_items, positions.capabilities
      from app_users users
      join account_accesses accesses on accesses.user_id = users.id
      join account_positions positions on json_contains(coalesce(accesses.position_codes, json_array(accesses.position_code)), json_quote(positions.id))
      where users.status = 'active' and accesses.is_active = 1 and accesses.scope_kind = 'organization'
        ${userId === undefined ? "" : "and users.id = ?"}
      order by users.display_name, users.id, positions.sort_order, positions.id
      ${lock ? "for update" : ""}`, userId === undefined ? [] : [userId]);
    const employees = new Map<string, PersonnelEmployee>();
    const access = new Map<string, Set<string>>();
    for (const row of rows) {
      const granted = access.get(row.user_id) ?? new Set<string>();
      for (const value of [...jsonList(row.navigation_items), ...jsonList(row.capabilities)]) granted.add(value);
      access.set(row.user_id, granted);
      const current = employees.get(row.user_id);
      if (current) {
        if (!current.position.split(" / ").includes(row.position_name)) current.position += ` / ${row.position_name}`;
      } else employees.set(row.user_id, { id: `account:${row.user_id}`, revision: 0, fullName: row.full_name, position: row.position_name, department: "", category: "", userId: row.user_id, active: true });
    }
    // Same rule as the service's canExecute over the union of the account's positions.
    for (const employee of employees.values()) {
      const granted = access.get(employee.userId!)!;
      employee.canReceive = granted.has(assignmentInboxNavigationItem) && granted.has(registry.viewCapability) && granted.has(registry.executeCapability);
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
    /** The only source of the registry for services and reminders built on this repository. */
    registryId,
    listEmployees,
    readEmployee,
    async listAssignableEmployees() {
      return accountEmployees();
    },
    async readAssignableEmployee(id: string, lock = false) {
      if (id.startsWith("account:")) return (await accountEmployees(id.slice(8), lock))[0];
      // Legacy assignments keep their explicit link; names never resolve accounts.
      const employee = await readEmployee(id, lock);
      return employee?.active && employee.userId ? (await accountEmployees(employee.userId, lock))[0] : undefined;
    },
    /** Active accounts whose current positions grant control of this registry. */
    async listManagerUserIds() {
      const [rows] = await pool.query<(RowDataPacket & { user_id: string })[]>(`
        select distinct users.id as user_id
        from app_users users
        join account_accesses accesses on accesses.user_id = users.id
        join account_positions positions on json_contains(coalesce(accesses.position_codes, json_array(accesses.position_code)), json_quote(positions.id))
        where users.status = 'active' and accesses.is_active = 1
          and json_contains(positions.navigation_items, json_quote(?))
          and json_contains(positions.capabilities, json_quote(?))`,
      [registry.navigationItem, registry.manageCapability]);
      return rows.map(row => row.user_id);
    },
    async claimReminder(delivery: DirectorReminderDelivery, token: string) {
      const key = [delivery.assignmentId, delivery.occurrenceDate, delivery.daysBefore, delivery.userId, delivery.channel];
      await pool.query(`insert ignore into ${tables.reminders}
        (assignment_id, occurrence_date, days_before, user_id, channel) values (?, ?, ?, ?, ?)`, key);
      const [result] = await pool.query<ResultSetHeader>(`update ${tables.reminders}
        set claim_token = ?, lease_until = timestampadd(second, ?, utc_timestamp(3))
        where assignment_id = ? and occurrence_date = ? and days_before = ? and user_id = ? and channel = ?
          and delivered_at is null and (lease_until is null or lease_until <= utc_timestamp(3))`,
        [token, directorReminderLeaseSeconds, ...key]);
      return result.affectedRows === 1;
    },
    async completeReminder(delivery: DirectorReminderDelivery, token: string) {
      await pool.query(`update ${tables.reminders}
        set delivered_at = utc_timestamp(3), lease_until = null
        where assignment_id = ? and occurrence_date = ? and days_before = ? and user_id = ? and channel = ? and claim_token = ?`,
        [delivery.assignmentId, delivery.occurrenceDate, delivery.daysBefore, delivery.userId, delivery.channel, token]);
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
      const [rows] = await pool.query<JsonRow[]>(`select payload from ${tables.assignments} order by assigned_on desc, sequence_id desc`);
      return rows.map(assignmentPayload);
    },
    async listByBoardAssignment(boardAssignmentId: string) {
      const [rows] = await pool.query<JsonRow[]>(
        `select payload from ${tables.assignments}
         where json_unquote(json_extract(payload, '$.sourceBoardAssignmentId')) = ?
         order by sequence_id desc`, [boardAssignmentId],
      );
      return rows.map(assignmentPayload);
    },
    async listWithInitiativeLink() {
      const [rows] = await pool.query<JsonRow[]>(
        `select payload from ${tables.assignments}
         where json_type(json_extract(payload, '$.sourceInitiativeId')) = 'STRING'
         order by sequence_id`,
      );
      return rows.map(assignmentPayload);
    },
    async listBySourceInitiative(initiativeId: string) {
      const [rows] = await pool.query<JsonRow[]>(
        `select payload from ${tables.assignments}
         where json_unquote(json_extract(payload, '$.sourceInitiativeId')) = ?
         order by sequence_id`, [initiativeId],
      );
      return rows.map(assignmentPayload);
    },
    async listBoardAssignmentRevisions(boardAssignmentId: string) {
      const [rows] = await pool.query<JsonRow[]>(
        `select history.payload from ${tables.history} history
         join ${tables.assignments} assignments on assignments.id = history.assignment_id
         where history.event_type = 'revision'
           and json_unquote(json_extract(assignments.payload, '$.sourceBoardAssignmentId')) = ?
         order by history.sequence_id asc`, [boardAssignmentId],
      );
      return rows.map(assignmentPayload);
    },
    async read(id: string, lock = false) {
      const [rows] = await pool.query<JsonRow[]>(`select payload from ${tables.assignments} where id = ? ${lock ? "for update" : ""}`, [id]);
      return rows[0] ? assignmentPayload(rows[0]) : undefined;
    },
    async create(assignment: DirectorAssignment) {
      const [result] = await pool.query<ResultSetHeader>(`insert into ${tables.assignments} (id, assigned_on, revision, source_key, payload) values (?, ?, ?, ?, ?)`,
        [assignment.id, assignment.assignedOn, assignment.revision, assignment.source?.key ?? null, JSON.stringify(assignment)]);
      if (!assignment.number) {
        assignment.number = `${registry.numberPrefix}-${result.insertId}`;
        await pool.query(`update ${tables.assignments} set payload = ? where id = ?`, [JSON.stringify(assignment), assignment.id]);
      }
      return assignment;
    },
    async update(assignment: DirectorAssignment, previous: DirectorAssignment) {
      const [result] = await pool.query<ResultSetHeader>(`update ${tables.assignments} set assigned_on = ?, revision = ?, payload = ? where id = ? and revision = ?`,
        [assignment.assignedOn, assignment.revision, JSON.stringify(assignment), assignment.id, previous.revision]);
      if (result.affectedRows !== 1) throw new DirectorAssignmentError("Поручение уже изменено. Обновите список.", 409);
      await pool.query(`insert into ${tables.history} (id, assignment_id, event_type, payload) values (?, ?, 'revision', ?)`, [randomUUID(), assignment.id, JSON.stringify(previous)]);
      return assignment;
    },
    async addCompletion(assignment: DirectorAssignment) {
      await pool.query(`insert into ${tables.history} (id, assignment_id, event_type, payload) values (?, ?, 'completion', ?)`, [randomUUID(), assignment.id, JSON.stringify(assignment)]);
    },
    async listCompletions() {
      const [rows] = await pool.query<(JsonRow & { id: string })[]>(`select id, payload from ${tables.history} where event_type = 'completion' order by sequence_id desc`);
      return rows.map(row => ({ id: row.id, assignment: assignmentPayload(row) }));
    },
    async addDocument(assignmentId: string, id: string, fileName: string, pdf: Buffer) {
      await pool.query(`insert into ${tables.documents} (id, assignment_id, file_name, pdf) values (?, ?, ?, ?)`, [id, assignmentId, fileName, pdf]);
    },
    async readDocument(assignmentId: string, documentId: string) {
      const [rows] = await pool.query<(RowDataPacket & { fileName: string; pdf: Buffer })[]>(`select file_name as fileName, pdf from ${tables.documents} where assignment_id = ? and id = ?`, [assignmentId, documentId]);
      return rows[0];
    },
  };
}

export type DirectorAssignmentsRepository = ReturnType<typeof createDirectorAssignmentsRepository>;
