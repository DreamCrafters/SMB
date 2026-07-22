import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type {
  BankAssignmentSnapshot,
  BankNumber,
} from "../domain/bankMeasurement.js";

export type LaboratoryBankAssignment = BankAssignmentSnapshot & {
  assignedByDisplayName: string;
};

export type LaboratoryBankAssignmentsRepository = {
  assign: (input: {
    bankNumber: BankNumber;
    laboratoryResultId: string;
    sampleIndex: number;
    sampleIdentifier: string;
    materialLabel: string;
    bulkDensityTonsPerCubicMeter: number;
    assignedByUserId: string;
    assignedByAccountId: string;
    assignedByDisplayName: string;
  }) => Promise<LaboratoryBankAssignment>;
  listCurrent: () => Promise<LaboratoryBankAssignment[]>;
  listHistory: (limit?: number) => Promise<LaboratoryBankAssignment[]>;
};

type LaboratoryBankAssignmentRow = RowDataPacket & {
  id: string;
  bank_number: BankNumber;
  laboratory_result_id: string;
  sample_index: number;
  sample_identifier: string;
  material_label: string;
  bulk_density: number | string;
  assigned_by_display_name: string;
  assigned_at: Date | string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

export function createLaboratoryBankAssignmentsRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): LaboratoryBankAssignmentsRepository {
  return {
    async assign(input) {
      const assignment: LaboratoryBankAssignment = {
        assignmentId: createId(),
        bankNumber: input.bankNumber,
        laboratoryResultId: input.laboratoryResultId,
        sampleIndex: input.sampleIndex,
        sampleIdentifier: input.sampleIdentifier,
        materialLabel: input.materialLabel,
        bulkDensityTonsPerCubicMeter: input.bulkDensityTonsPerCubicMeter,
        assignedByDisplayName: input.assignedByDisplayName,
        assignedAt: now().toISOString(),
      };

      await pool.query(
        `insert into laboratory_bank_assignments (
          id,
          bank_number,
          laboratory_result_id,
          sample_index,
          sample_identifier,
          material_label,
          bulk_density,
          assigned_by_user_id,
          assigned_by_account_id,
          assigned_by_display_name,
          assigned_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assignment.assignmentId,
          assignment.bankNumber,
          assignment.laboratoryResultId,
          assignment.sampleIndex,
          assignment.sampleIdentifier,
          assignment.materialLabel,
          assignment.bulkDensityTonsPerCubicMeter,
          input.assignedByUserId,
          input.assignedByAccountId,
          assignment.assignedByDisplayName,
          assignment.assignedAt,
        ],
      );

      return assignment;
    },

    async listCurrent() {
      const [rows] = await pool.query<LaboratoryBankAssignmentRow[]>(
        `select ${assignmentColumns("assignment")}
        from laboratory_bank_assignments assignment
        join (
          select bank_number, max(sequence_id) as sequence_id
          from laboratory_bank_assignments
          group by bank_number
        ) current_assignment
          on current_assignment.sequence_id = assignment.sequence_id
        order by assignment.bank_number asc`,
      );
      return rows.map(mapAssignmentRow);
    },

    async listHistory(limit = 100) {
      const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
      const [rows] = await pool.query<LaboratoryBankAssignmentRow[]>(
        `select ${assignmentColumns("assignment")}
        from laboratory_bank_assignments assignment
        order by assignment.sequence_id desc
        limit ?`,
        [safeLimit],
      );
      return rows.map(mapAssignmentRow);
    },
  };
}

function assignmentColumns(alias: string) {
  return [
    "id",
    "bank_number",
    "laboratory_result_id",
    "sample_index",
    "sample_identifier",
    "material_label",
    "bulk_density",
    "assigned_by_display_name",
    "assigned_at",
  ].map((column) => `${alias}.${column}`).join(",\n          ");
}

function mapAssignmentRow(
  row: LaboratoryBankAssignmentRow,
): LaboratoryBankAssignment {
  return {
    assignmentId: row.id,
    bankNumber: row.bank_number,
    laboratoryResultId: row.laboratory_result_id,
    sampleIndex: row.sample_index,
    sampleIdentifier: row.sample_identifier,
    materialLabel: row.material_label,
    bulkDensityTonsPerCubicMeter: Number(row.bulk_density),
    assignedByDisplayName: row.assigned_by_display_name,
    assignedAt: new Date(row.assigned_at).toISOString(),
  };
}
