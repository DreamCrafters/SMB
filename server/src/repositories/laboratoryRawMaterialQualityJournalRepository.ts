import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratoryRawMaterialQualityFilters,
  LaboratoryRawMaterialQualityOptions,
  LaboratoryRawMaterialQualityRecommendationRecipient,
  LaboratoryRawMaterialQualityRecord,
  LaboratoryRawMaterialQualityShift,
  LaboratoryRawMaterialQualitySubmission,
} from "../contracts/laboratoryRawMaterialQualityJournal.js";
import type { DatabasePool } from "../db/pool.js";
import { escapeLikePattern } from "./laboratoryResultsRepository.js";

type RepositoryFilters = LaboratoryRawMaterialQualityFilters & {
  limit?: number;
};

export type LaboratoryRawMaterialQualityJournalRepository = {
  create: (input: {
    record: LaboratoryRawMaterialQualitySubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<LaboratoryRawMaterialQualityRecord>;
  list: (
    filters?: RepositoryFilters,
  ) => Promise<LaboratoryRawMaterialQualityRecord[]>;
  listOptions: () => Promise<LaboratoryRawMaterialQualityOptions>;
  update: (input: {
    id: string;
    record: LaboratoryRawMaterialQualitySubmission;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<LaboratoryRawMaterialQualityCorrectionResult | undefined>;
};

export type LaboratoryRawMaterialQualityCorrectionResult = {
  before: LaboratoryRawMaterialQualitySubmission;
  record: LaboratoryRawMaterialQualityRecord;
};

type JournalRow = RowDataPacket & {
  id: string;
  record_date: Date | string;
  laboratory_assistant: string;
  shift_supervisor: string;
  shift_code: LaboratoryRawMaterialQualityShift;
  clay_measurements: unknown;
  temper_measurements: unknown;
  slip_measurements: unknown;
  runner_measurements: unknown;
  elutriation_coefficient: string | null;
  recommendation_recipient: LaboratoryRawMaterialQualityRecommendationRecipient | null;
  recommendation_text: string | null;
  created_at: Date | string;
};

type BrandRow = RowDataPacket & {
  clay_measurements: unknown;
  temper_measurements: unknown;
};

type OptionRow = RowDataPacket & {
  option_type: "laboratory_assistant" | "shift_supervisor";
  value: string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const defaultListLimit = 200;
const maxListLimit = 500;

const journalColumns = `
  id,
  record_date,
  laboratory_assistant,
  shift_supervisor,
  shift_code,
  clay_measurements,
  temper_measurements,
  slip_measurements,
  runner_measurements,
  elutriation_coefficient,
  recommendation_recipient,
  recommendation_text,
  created_at
`;

export function createLaboratoryRawMaterialQualityJournalRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): LaboratoryRawMaterialQualityJournalRepository {
  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      const record = input.record;

      await pool.query(
        `insert into laboratory_raw_material_quality_journal (
          id,
          record_date,
          laboratory_assistant,
          shift_supervisor,
          shift_code,
          clay_measurements,
          temper_measurements,
          slip_measurements,
          runner_measurements,
          elutriation_coefficient,
          recommendation_recipient,
          recommendation_text,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          ...readSubmissionValues(record),
          input.submittedByUserId,
          input.submittedByAccountId,
          createdAt,
        ],
      );

      return { id, ...record, createdAt };
    },

    async list(filters = {}) {
      const clauses: string[] = [];
      const parameters: unknown[] = [];

      if (filters.dateFrom !== undefined) {
        clauses.push("record_date >= ?");
        parameters.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        clauses.push("record_date <= ?");
        parameters.push(filters.dateTo);
      }
      if (filters.query !== undefined) {
        clauses.push(`instr(
          concat_ws(
            ' ',
            laboratory_assistant,
            shift_supervisor,
            case shift_code
              when 'day' then '8:00-20:00'
              when 'night' then '20:00-8:00'
              when 'day_short' then '08:00-17:00'
              else shift_code
            end,
            clay_measurements,
            temper_measurements,
            slip_measurements,
            runner_measurements,
            elutriation_coefficient,
            case recommendation_recipient
              when 'dryer_operator' then 'Сушильщик'
              when 'runner_operator' then 'Бегунщик'
              when 'slurry_operator' then 'Шликерщик'
              when 'batch_operator' then 'Шихтовщик'
              else recommendation_recipient
            end,
            recommendation_text
          ),
          ?
        ) > 0`);
        parameters.push(filters.query);
      }
      if (filters.nameQuery !== undefined) {
        clauses.push("(clay_measurements like ? or temper_measurements like ?)");
        const pattern = `%${escapeLikePattern(filters.nameQuery)}%`;
        parameters.push(pattern, pattern);
      }

      const limit = Math.min(
        Math.max(Math.trunc(filters.limit ?? defaultListLimit), 1),
        maxListLimit,
      );
      const where = clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`;
      const [rows] = await pool.query<JournalRow[]>(
        `select ${journalColumns}
        from laboratory_raw_material_quality_journal
        ${where}
        order by record_date desc, sequence_id desc
        limit ?`,
        [...parameters, limit],
      );

      return rows.map(mapRecord);
    },

    async listOptions() {
      const [rows] = await pool.query<OptionRow[]>(
        `select option_type, value
        from (
          select
            'laboratory_assistant' as option_type,
            laboratory_assistant as value,
            max(created_at) as last_used_at
          from laboratory_raw_material_quality_journal
          group by laboratory_assistant
          union all
          select
            'shift_supervisor' as option_type,
            shift_supervisor as value,
            max(created_at) as last_used_at
          from laboratory_raw_material_quality_journal
          group by shift_supervisor
        ) as journal_options
        order by option_type asc, last_used_at desc, value asc`,
      );

      const [brandRows] = await pool.query<BrandRow[]>(
        `select clay_measurements, temper_measurements
        from laboratory_raw_material_quality_journal
        order by created_at desc`,
      );

      return {
        laboratoryAssistants: readOptions(rows, "laboratory_assistant"),
        shiftSupervisors: readOptions(rows, "shift_supervisor"),
        clayBrands: collectUniqueBrands(brandRows, "clay_measurements", "clayBrand"),
        temperBrands: collectUniqueBrands(brandRows, "temper_measurements", "temperBrand"),
      };
    },

    async update(input) {
      const [rows] = await pool.query<JournalRow[]>(
        `select ${journalColumns}
        from laboratory_raw_material_quality_journal
        where id = ?
        limit 1
        for update`,
        [input.id],
      );
      const current = rows[0];
      if (current === undefined) return undefined;

      const before = mapSubmission(current);
      const correctedAt = now().toISOString();
      const record = input.record;
      await pool.query(
        `update laboratory_raw_material_quality_journal
        set
          record_date = ?,
          laboratory_assistant = ?,
          shift_supervisor = ?,
          shift_code = ?,
          clay_measurements = ?,
          temper_measurements = ?,
          slip_measurements = ?,
          runner_measurements = ?,
          elutriation_coefficient = ?,
          recommendation_recipient = ?,
          recommendation_text = ?
        where id = ?`,
        [...readSubmissionValues(record), input.id],
      );
      await pool.query(
        `insert into laboratory_raw_material_quality_revisions (
          id,
          raw_material_quality_id,
          before_snapshot,
          after_snapshot,
          corrected_by_user_id,
          corrected_by_account_id,
          corrected_by_display_name,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createId(),
          input.id,
          JSON.stringify(before),
          JSON.stringify(record),
          input.correctedByUserId,
          input.correctedByAccountId,
          input.correctedByDisplayName,
          correctedAt,
        ],
      );

      return {
        before,
        record: {
          id: input.id,
          ...record,
          createdAt: new Date(current.created_at).toISOString(),
        },
      };
    },
  };
}

function readOptions(rows: OptionRow[], type: OptionRow["option_type"]) {
  return rows
    .filter((row) => row.option_type === type)
    .map((row) => row.value);
}

function collectUniqueBrands(
  rows: BrandRow[],
  column: "clay_measurements" | "temper_measurements",
  brandField: "clayBrand" | "temperBrand",
): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of rows) {
    const measurements = readJson(row[column]);
    if (!Array.isArray(measurements)) continue;
    for (const measurement of measurements) {
      const brand = isRecord(measurement) ? measurement[brandField] : undefined;
      if (typeof brand === "string" && brand.length > 0 && !seen.has(brand)) {
        seen.add(brand);
        values.push(brand);
      }
    }
  }
  return values;
}

function mapRecord(row: JournalRow): LaboratoryRawMaterialQualityRecord {
  return {
    id: row.id,
    ...mapSubmission(row),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapSubmission(
  row: JournalRow,
): LaboratoryRawMaterialQualitySubmission {
  return {
    recordDate: formatDate(row.record_date),
    laboratoryAssistant: row.laboratory_assistant,
    shiftSupervisor: row.shift_supervisor,
    shift: row.shift_code,
    clayMeasurements: readJson(row.clay_measurements) as
      LaboratoryRawMaterialQualitySubmission["clayMeasurements"],
    temperMeasurements: readJson(row.temper_measurements) as
      LaboratoryRawMaterialQualitySubmission["temperMeasurements"],
    slipMeasurements: readJson(row.slip_measurements) as
      LaboratoryRawMaterialQualitySubmission["slipMeasurements"],
    runnerMeasurements: readJson(row.runner_measurements) as
      LaboratoryRawMaterialQualitySubmission["runnerMeasurements"],
    elutriationCoefficient: row.elutriation_coefficient,
    recommendationRecipient: row.recommendation_recipient,
    recommendationText: row.recommendation_text,
  };
}

function readSubmissionValues(record: LaboratoryRawMaterialQualitySubmission) {
  return [
    record.recordDate,
    record.laboratoryAssistant,
    record.shiftSupervisor,
    record.shift,
    JSON.stringify(record.clayMeasurements),
    JSON.stringify(record.temperMeasurements),
    JSON.stringify(record.slipMeasurements),
    JSON.stringify(record.runnerMeasurements),
    record.elutriationCoefficient,
    record.recommendationRecipient,
    record.recommendationText,
  ];
}

function readJson(value: unknown): unknown[] {
  if (typeof value === "string") return JSON.parse(value) as unknown[];
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatDate(value: Date | string) {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}
