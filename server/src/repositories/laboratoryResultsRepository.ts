import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type {
  LaboratoryResultSubmission,
  LaboratorySection,
} from "../domain/laboratoryResult.js";

export type LaboratoryResult = LaboratoryResultSubmission & {
  id: string;
  laboratoryAssistantDisplayName: string;
  createdAt: string;
};

export type LaboratoryResultFilters = {
  section?: LaboratorySection;
  dateFrom?: string;
  dateTo?: string;
  materialLabel?: string;
  productBrand?: string;
  limit?: number;
};

export type LaboratoryResultsRepository = {
  create: (input: {
    result: LaboratoryResultSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
    laboratoryAssistantDisplayName: string;
  }) => Promise<LaboratoryResult>;
  list: (filters?: LaboratoryResultFilters) => Promise<LaboratoryResult[]>;
};

type LaboratoryResultRow = RowDataPacket & {
  id: string;
  section: LaboratorySection;
  analysis_date: Date | string;
  material_label: string;
  product_brand: string | null;
  payload: unknown;
  laboratory_assistant_display_name: string;
  created_at: Date | string;
};

type LaboratoryResultsRepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const defaultListLimit = 100;
const maxListLimit = 200;

export function createLaboratoryResultsRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: LaboratoryResultsRepositoryOptions = {},
): LaboratoryResultsRepository {
  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      const productBrand = input.result.section === "finished_product"
        ? input.result.productBrand
        : null;

      await pool.query(
        `insert into laboratory_results (
          id,
          section,
          analysis_date,
          material_label,
          product_brand,
          submitted_by_user_id,
          submitted_by_account_id,
          laboratory_assistant_display_name,
          payload,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.result.section,
          input.result.analysisDate,
          input.result.materialLabel,
          productBrand,
          input.submittedByUserId,
          input.submittedByAccountId,
          input.laboratoryAssistantDisplayName,
          JSON.stringify(input.result),
          createdAt,
        ],
      );

      return {
        id,
        ...input.result,
        laboratoryAssistantDisplayName: input.laboratoryAssistantDisplayName,
        createdAt,
      };
    },

    async list(filters = {}) {
      const clauses: string[] = [];
      const parameters: unknown[] = [];

      if (filters.section !== undefined) {
        clauses.push("section = ?");
        parameters.push(filters.section);
      }
      if (filters.dateFrom !== undefined) {
        clauses.push("analysis_date >= ?");
        parameters.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        clauses.push("analysis_date <= ?");
        parameters.push(filters.dateTo);
      }
      if (filters.materialLabel !== undefined) {
        clauses.push("material_label = ?");
        parameters.push(filters.materialLabel);
      }
      if (filters.productBrand !== undefined) {
        clauses.push("product_brand = ?");
        parameters.push(filters.productBrand);
      }

      const limit = Math.min(
        Math.max(Math.trunc(filters.limit ?? defaultListLimit), 1),
        maxListLimit,
      );
      const where = clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`;
      const [rows] = await pool.query<LaboratoryResultRow[]>(
        `select
          id,
          section,
          analysis_date,
          material_label,
          product_brand,
          payload,
          laboratory_assistant_display_name,
          created_at
        from laboratory_results
        ${where}
        order by analysis_date desc, created_at desc, id desc
        limit ?`,
        [...parameters, limit],
      );

      return rows.map(mapLaboratoryResultRow);
    },
  };
}

function mapLaboratoryResultRow(row: LaboratoryResultRow): LaboratoryResult {
  const payload = readStoredSubmission(row.payload);

  if (
    payload.section !== row.section ||
    payload.analysisDate !== formatDate(row.analysis_date) ||
    payload.materialLabel !== row.material_label ||
    (payload.section === "finished_product" &&
      payload.productBrand !== row.product_brand)
  ) {
    throw new Error("Stored laboratory result columns are inconsistent.");
  }

  return {
    id: row.id,
    ...payload,
    laboratoryAssistantDisplayName: row.laboratory_assistant_display_name,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function readStoredSubmission(value: unknown): LaboratoryResultSubmission {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;

  if (
    !isRecord(parsed) ||
    (parsed.section !== "incoming" && parsed.section !== "finished_product") ||
    typeof parsed.analysisDate !== "string" ||
    typeof parsed.materialLabel !== "string"
  ) {
    throw new Error("Stored laboratory result payload is invalid.");
  }

  if (parsed.section === "incoming") {
    if (Array.isArray(parsed.samples) && parsed.samples.every(isIncomingSample)) {
      return parsed as LaboratoryResultSubmission;
    }
    if (
      typeof parsed.sampleIdentifier === "string" &&
      isStringRecord(parsed.values)
    ) {
      return {
        section: "incoming",
        analysisDate: parsed.analysisDate,
        materialLabel: parsed.materialLabel,
        ...(typeof parsed.documentType === "string"
          ? { documentType: parsed.documentType }
          : {}),
        ...(typeof parsed.documentNumber === "string"
          ? { documentNumber: parsed.documentNumber }
          : {}),
        ...(typeof parsed.transportType === "string"
          ? { transportType: parsed.transportType }
          : {}),
        ...(typeof parsed.samplingMethod === "string"
          ? { samplingMethod: parsed.samplingMethod }
          : {}),
        ...(typeof parsed.documentIndicators === "string"
          ? { documentIndicators: parsed.documentIndicators }
          : {}),
        samples: [{
          sampleIdentifier: parsed.sampleIdentifier,
          values: parsed.values,
        }],
      } as LaboratoryResultSubmission;
    }
    throw new Error("Stored incoming laboratory result payload is invalid.");
  }

  if (
    typeof parsed.productBrand !== "string" ||
    !isStringRecord(parsed.values)
  ) {
    throw new Error("Stored finished product laboratory result payload is invalid.");
  }
  return parsed as LaboratoryResultSubmission;
}

function isIncomingSample(value: unknown) {
  return isRecord(value) &&
    typeof value.sampleIdentifier === "string" &&
    isStringRecord(value.values);
}

function isStringRecord(value: unknown) {
  return isRecord(value) && Object.values(value).every(
    (item) => typeof item === "string",
  );
}

function formatDate(value: Date | string) {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
