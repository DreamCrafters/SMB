import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type {
  BankAssignmentSnapshot,
  BankBulkDensitySource,
  BankNumber,
} from "../domain/bankMeasurement.js";

export type LaboratoryBankAssignment = BankAssignmentSnapshot & {
  assignedByDisplayName: string;
};

export type LaboratoryBankAssignmentsRepository = {
  assign: (input: {
    bankNumber: BankNumber;
    materialLabel: string;
    bulkDensityTonsPerCubicMeter: number;
    bulkDensitySource: BankBulkDensitySource;
    bulkDensitySampleCount: number;
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
  laboratory_result_id: string | null;
  sample_index: number | null;
  sample_identifier: string | null;
  material_label: string;
  bulk_density: number | string;
  bulk_density_source: string;
  bulk_density_sample_count: number | string | null;
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
        materialLabel: input.materialLabel,
        bulkDensityTonsPerCubicMeter: input.bulkDensityTonsPerCubicMeter,
        bulkDensitySource: input.bulkDensitySource,
        bulkDensitySampleCount: input.bulkDensitySampleCount,
        assignedByDisplayName: input.assignedByDisplayName,
        assignedAt: now().toISOString(),
      };

      await pool.query(
        `insert into laboratory_bank_assignments (
          id,
          bank_number,
          material_label,
          bulk_density,
          bulk_density_source,
          bulk_density_sample_count,
          assigned_by_user_id,
          assigned_by_account_id,
          assigned_by_display_name,
          assigned_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assignment.assignmentId,
          assignment.bankNumber,
          assignment.materialLabel,
          assignment.bulkDensityTonsPerCubicMeter,
          assignment.bulkDensitySource,
          assignment.bulkDensitySampleCount,
          input.assignedByUserId,
          input.assignedByAccountId,
          assignment.assignedByDisplayName,
          assignment.assignedAt,
        ],
      );

      return assignment;
    },

    async listCurrent() {
      /**
       * Текущим считается последнее назначение банки. Назначения из журнала
       * печи 2 самодостаточны, а исторические ссылки на результат испытаний
       * по-прежнему учитываются только для контроля готовой продукции.
       */
      const [rows] = await pool.query<LaboratoryBankAssignmentRow[]>(
        `select ${assignmentColumns("assignment")}
        from laboratory_bank_assignments assignment
        join (
          select bank_number, max(sequence_id) as sequence_id
          from laboratory_bank_assignments
          group by bank_number
        ) current_assignment
          on current_assignment.sequence_id = assignment.sequence_id
        left join laboratory_results result
          on result.id = assignment.laboratory_result_id
        where assignment.laboratory_result_id is null
          or result.section = 'finished_product'
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
    "bulk_density_source",
    "bulk_density_sample_count",
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
    materialLabel: row.material_label,
    bulkDensityTonsPerCubicMeter: Number(row.bulk_density),
    bulkDensitySource: row.bulk_density_source === "rotary_kiln_2_journal"
      ? "rotary_kiln_2_journal"
      : "laboratory_result",
    ...(row.bulk_density_sample_count === null
      ? {}
      : { bulkDensitySampleCount: Number(row.bulk_density_sample_count) }),
    ...(row.laboratory_result_id === null
      ? {}
      : { laboratoryResultId: row.laboratory_result_id }),
    ...(row.sample_index === null ? {} : { sampleIndex: row.sample_index }),
    ...(row.sample_identifier === null
      ? {}
      : { sampleIdentifier: row.sample_identifier }),
    assignedByDisplayName: row.assigned_by_display_name,
    assignedAt: new Date(row.assigned_at).toISOString(),
  };
}
