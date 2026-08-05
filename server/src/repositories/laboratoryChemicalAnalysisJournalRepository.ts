import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratoryChemicalAnalysisJournalFilters,
  LaboratoryChemicalAnalysisJournalRecord,
  LaboratoryChemicalAnalysisJournalSubmission,
  LaboratoryChemicalAnalysisSampleOption,
  LaboratoryChemicalAnalysisSampleReference,
} from "../contracts/laboratoryChemicalAnalysisJournal.js";
import type { DatabasePool } from "../db/pool.js";
import { escapeLikePattern } from "./laboratoryResultsRepository.js";

type RepositoryFilters = LaboratoryChemicalAnalysisJournalFilters & {
  limit?: number;
};

export type LaboratoryChemicalAnalysisJournalCorrectionResult = {
  before: LaboratoryChemicalAnalysisJournalRecord;
  record: LaboratoryChemicalAnalysisJournalRecord;
};

export class LaboratoryChemicalAnalysisSampleUnavailableError extends Error {
  constructor() {
    super("Selected laboratory sample is unavailable for chemical analysis.");
    this.name = "LaboratoryChemicalAnalysisSampleUnavailableError";
  }
}

export type LaboratoryChemicalAnalysisJournalRepository = {
  create: (input: {
    analysis: LaboratoryChemicalAnalysisJournalSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<LaboratoryChemicalAnalysisJournalRecord>;
  update: (input: {
    id: string;
    analysis: LaboratoryChemicalAnalysisJournalSubmission;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<LaboratoryChemicalAnalysisJournalCorrectionResult | undefined>;
  list: (
    filters?: RepositoryFilters,
  ) => Promise<LaboratoryChemicalAnalysisJournalRecord[]>;
  listAvailableSampleOptions: (filters?: {
    query?: string;
    limit?: number;
  }) => Promise<LaboratoryChemicalAnalysisSampleOption[]>;
  findSampleOption: (
    reference: LaboratoryChemicalAnalysisSampleReference,
    options?: {
      availableOnly?: boolean;
      excludeAnalysisId?: string;
    },
  ) => Promise<LaboratoryChemicalAnalysisSampleOption | undefined>;
  getNextLaboratoryAnalysisNumber: () => Promise<string>;
};

type LaboratoryChemicalAnalysisSampleOptionRow = RowDataPacket & {
  sample_source: "sample_registration" | "unshaped_product";
  sample_id: string;
  laboratory_sample_code: string;
  sample_number: string;
  sample_name: string;
  sample_date: Date | string;
  registration_date: Date | string | null;
};

type LaboratoryChemicalAnalysisJournalRow = RowDataPacket & {
  id: string;
  sample_registration_id: string | null;
  unshaped_product_sample_id: string | null;
  sample_source: "sample_registration" | "unshaped_product";
  sample_id: string;
  laboratory_sample_code: string;
  sample_number: string;
  sample_name: string;
  sample_date: Date | string;
  registration_date: Date | string | null;
  laboratory_analysis_number: string | null;
  chemical_analysis_date: Date | string | null;
  chemical_analysis_laboratory_assistant: string | null;
  batch_number: string | null;
  al2o3: string | null;
  fe2o3: string | null;
  sio2: string | null;
  cao2: string | null;
  p2o5: string | null;
  loss_on_ignition: string | null;
  moisture: string | null;
  notes: string | null;
  created_at: Date | string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

type LaboratoryNextAnalysisNumberRow = RowDataPacket & {
  analysis_number: string;
};

const defaultListLimit = 200;
const maxListLimit = 500;

export function createLaboratoryChemicalAnalysisJournalRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): LaboratoryChemicalAnalysisJournalRepository {
  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      const analysis = input.analysis;
      const sample = await readSampleOption(pool, analysis, {
        availableOnly: true,
        lock: true,
      });
      if (sample === undefined) {
        throw new LaboratoryChemicalAnalysisSampleUnavailableError();
      }

      try {
        await pool.query(
          `insert into laboratory_chemical_analysis_journal (
          id,
          sample_registration_id,
          unshaped_product_sample_id,
          laboratory_analysis_number,
          chemical_analysis_date,
          chemical_analysis_laboratory_assistant,
          batch_number,
          al2o3,
          fe2o3,
          sio2,
          cao2,
          p2o5,
          loss_on_ignition,
          moisture,
          notes,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            analysis.sampleSource === "sample_registration"
              ? analysis.sampleId
              : null,
            analysis.sampleSource === "unshaped_product"
              ? analysis.sampleId
              : null,
            analysis.laboratoryAnalysisNumber ?? null,
            analysis.chemicalAnalysisDate ?? null,
            analysis.chemicalAnalysisLaboratoryAssistant ?? null,
            analysis.batchNumber ?? null,
            analysis.al2o3 ?? null,
            analysis.fe2o3 ?? null,
            analysis.sio2 ?? null,
            analysis.cao2 ?? null,
            analysis.p2o5 ?? null,
            analysis.lossOnIgnition ?? null,
            analysis.moisture ?? null,
            analysis.notes ?? null,
            input.submittedByUserId,
            input.submittedByAccountId,
            createdAt,
          ],
        );
        await writeSampleClaim(pool, analysis, id);
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          throw new LaboratoryChemicalAnalysisSampleUnavailableError();
        }
        throw error;
      }

      if (analysis.sampleSource === "unshaped_product") {
        await writeUnshapedProductSampleAnalysisNumber(
          pool,
          analysis.sampleId,
          analysis.laboratoryAnalysisNumber,
        );
      }

      return {
        id,
        ...analysis,
        laboratorySampleCode: sample.laboratorySampleCode,
        sampleNumber: sample.sampleNumber,
        sampleName: sample.sampleName,
        sampleDate: sample.sampleDate,
        ...(sample.registrationDate === undefined
          ? {}
          : { registrationDate: sample.registrationDate }),
        createdAt,
      };
    },

    async update(input) {
      const [rows] = await pool.query<LaboratoryChemicalAnalysisJournalRow[]>(
        `select
          analysis.id,
          analysis.sample_registration_id,
          analysis.unshaped_product_sample_id,
          case when analysis.sample_registration_id is null
            then 'unshaped_product' else 'sample_registration' end as sample_source,
          coalesce(
            analysis.sample_registration_id,
            analysis.unshaped_product_sample_id
          ) as sample_id,
          coalesce(registration.laboratory_sample_code, unshaped.sample_code)
            as laboratory_sample_code,
          coalesce(registration.sample_number, unshaped.sample_number)
            as sample_number,
          coalesce(registration.sample_name, unshaped.product_name)
            as sample_name,
          coalesce(registration.sampling_date, unshaped.sample_date)
            as sample_date,
          registration.registration_date,
          analysis.laboratory_analysis_number,
          analysis.chemical_analysis_date,
          analysis.chemical_analysis_laboratory_assistant,
          analysis.batch_number,
          analysis.al2o3,
          analysis.fe2o3,
          analysis.sio2,
          analysis.cao2,
          analysis.p2o5,
          analysis.loss_on_ignition,
          analysis.moisture,
          analysis.notes,
          analysis.created_at
        from laboratory_chemical_analysis_journal analysis
        left join laboratory_sample_registration_journal registration
          on registration.id = analysis.sample_registration_id
        left join laboratory_unshaped_product_sample_journal unshaped
          on unshaped.id = analysis.unshaped_product_sample_id
        where analysis.id = ?
        limit 1
        for update`,
        [input.id],
      );
      const current = rows[0];
      if (current === undefined) return undefined;

      const before = mapRecord(current);
      const correctedAt = now().toISOString();
      const beforeSampleReference: LaboratoryChemicalAnalysisSampleReference = {
        sampleSource: current.sample_source,
        sampleId: current.sample_id,
      };
      const sampleChanged =
        beforeSampleReference.sampleSource !== input.analysis.sampleSource ||
        beforeSampleReference.sampleId !== input.analysis.sampleId;

      const selectedSample = await readSampleOption(pool, input.analysis, {
        availableOnly: sampleChanged,
        ...(sampleChanged ? { excludeAnalysisId: input.id } : {}),
        lock: true,
      });
      if (selectedSample === undefined) {
        throw new LaboratoryChemicalAnalysisSampleUnavailableError();
      }

      const corrected = {
        id: input.id,
        ...input.analysis,
        laboratorySampleCode: selectedSample.laboratorySampleCode,
        sampleNumber: selectedSample.sampleNumber,
        sampleName: selectedSample.sampleName,
        sampleDate: selectedSample.sampleDate,
        ...(selectedSample.registrationDate === undefined
          ? {}
          : { registrationDate: selectedSample.registrationDate }),
        createdAt: before.createdAt,
      };

      try {
        await pool.query(
          `update laboratory_chemical_analysis_journal
        set
          sample_registration_id = ?,
          unshaped_product_sample_id = ?,
          laboratory_analysis_number = ?,
          chemical_analysis_date = ?,
          chemical_analysis_laboratory_assistant = ?,
          batch_number = ?,
          al2o3 = ?,
          fe2o3 = ?,
          sio2 = ?,
          cao2 = ?,
          p2o5 = ?,
          loss_on_ignition = ?,
          moisture = ?,
          notes = ?
        where id = ?`,
          [
            input.analysis.sampleSource === "sample_registration"
              ? input.analysis.sampleId
              : null,
            input.analysis.sampleSource === "unshaped_product"
              ? input.analysis.sampleId
              : null,
            input.analysis.laboratoryAnalysisNumber ?? null,
            input.analysis.chemicalAnalysisDate ?? null,
            input.analysis.chemicalAnalysisLaboratoryAssistant ?? null,
            input.analysis.batchNumber ?? null,
            input.analysis.al2o3 ?? null,
            input.analysis.fe2o3 ?? null,
            input.analysis.sio2 ?? null,
            input.analysis.cao2 ?? null,
            input.analysis.p2o5 ?? null,
            input.analysis.lossOnIgnition ?? null,
            input.analysis.moisture ?? null,
            input.analysis.notes ?? null,
            input.id,
          ],
        );
        if (sampleChanged) {
          await pool.query(
            `delete from laboratory_chemical_analysis_sample_claims
            where chemical_analysis_id = ?`,
            [input.id],
          );
          await restoreLatestSampleClaim(pool, beforeSampleReference);
          await writeSampleClaim(pool, input.analysis, input.id);
        }
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          throw new LaboratoryChemicalAnalysisSampleUnavailableError();
        }
        throw error;
      }
      if (
        current.unshaped_product_sample_id !== null &&
        current.unshaped_product_sample_id !==
          (input.analysis.sampleSource === "unshaped_product"
            ? input.analysis.sampleId
            : undefined)
      ) {
        await writeUnshapedProductSampleAnalysisNumber(
          pool,
          current.unshaped_product_sample_id,
          undefined,
        );
      }
      if (input.analysis.sampleSource === "unshaped_product") {
        await writeUnshapedProductSampleAnalysisNumber(
          pool,
          input.analysis.sampleId,
          input.analysis.laboratoryAnalysisNumber,
        );
      }
      await pool.query(
        `insert into laboratory_chemical_analysis_revisions (
          id,
          chemical_analysis_id,
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
          JSON.stringify(corrected),
          input.correctedByUserId,
          input.correctedByAccountId,
          input.correctedByDisplayName,
          correctedAt,
        ],
      );

      return { before, record: corrected };
    },

    async list(filters = {}) {
      const clauses: string[] = [];
      const parameters: unknown[] = [];

      if (filters.dateFrom !== undefined) {
        clauses.push("analysis.chemical_analysis_date >= ?");
        parameters.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        clauses.push("analysis.chemical_analysis_date <= ?");
        parameters.push(filters.dateTo);
      }
      if (filters.query !== undefined) {
        clauses.push(`instr(
          concat_ws(
            ' ',
            coalesce(registration.laboratory_sample_code, unshaped.sample_code),
            coalesce(registration.sample_number, unshaped.sample_number),
            coalesce(registration.sample_name, unshaped.product_name),
            analysis.laboratory_analysis_number,
            analysis.chemical_analysis_laboratory_assistant,
            analysis.batch_number,
            coalesce(analysis.notes, '')
          ),
          ?
        ) > 0`);
        parameters.push(filters.query);
      }
      if (filters.nameQuery !== undefined) {
        clauses.push(
          "coalesce(registration.sample_name, unshaped.product_name) like ?",
        );
        parameters.push(`%${escapeLikePattern(filters.nameQuery)}%`);
      }

      const limit = Math.min(
        Math.max(Math.trunc(filters.limit ?? defaultListLimit), 1),
        maxListLimit,
      );
      const where = clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`;
      const [rows] = await pool.query<LaboratoryChemicalAnalysisJournalRow[]>(
        `select
          analysis.id,
          analysis.sample_registration_id,
          analysis.unshaped_product_sample_id,
          case when analysis.sample_registration_id is null
            then 'unshaped_product' else 'sample_registration' end as sample_source,
          coalesce(
            analysis.sample_registration_id,
            analysis.unshaped_product_sample_id
          ) as sample_id,
          coalesce(registration.laboratory_sample_code, unshaped.sample_code)
            as laboratory_sample_code,
          coalesce(registration.sample_number, unshaped.sample_number)
            as sample_number,
          coalesce(registration.sample_name, unshaped.product_name)
            as sample_name,
          coalesce(registration.sampling_date, unshaped.sample_date)
            as sample_date,
          registration.registration_date,
          analysis.laboratory_analysis_number,
          analysis.chemical_analysis_date,
          analysis.chemical_analysis_laboratory_assistant,
          analysis.batch_number,
          analysis.al2o3,
          analysis.fe2o3,
          analysis.sio2,
          analysis.cao2,
          analysis.p2o5,
          analysis.loss_on_ignition,
          analysis.moisture,
          analysis.notes,
          analysis.created_at
        from laboratory_chemical_analysis_journal analysis
        left join laboratory_sample_registration_journal registration
          on registration.id = analysis.sample_registration_id
        left join laboratory_unshaped_product_sample_journal unshaped
          on unshaped.id = analysis.unshaped_product_sample_id
        ${where}
        order by
          coalesce(
            analysis.chemical_analysis_date,
            date(analysis.created_at)
          ) desc,
          analysis.created_at desc,
          analysis.sequence_id desc
        limit ?`,
        [...parameters, limit],
      );

      return rows.map(mapRecord);
    },

    async listAvailableSampleOptions(filters = {}) {
      const limit = Math.min(
        Math.max(Math.trunc(filters.limit ?? maxListLimit), 1),
        maxListLimit,
      );
      const where = filters.query === undefined
        ? ""
        : "where instr(samples.search_text, ?) > 0";
      const parameters = filters.query === undefined
        ? [limit]
        : [filters.query, limit];
      const [rows] = await pool.query<
        LaboratoryChemicalAnalysisSampleOptionRow[]
      >(
        `select
          samples.sample_source,
          samples.sample_id,
          samples.laboratory_sample_code,
          samples.sample_number,
          samples.sample_name,
          samples.sample_date,
          samples.registration_date
        from (
          select
            'sample_registration' as sample_source,
            registration.id as sample_id,
            registration.laboratory_sample_code,
            registration.sample_number,
            registration.sample_name,
            registration.sampling_date as sample_date,
            registration.registration_date,
            concat_ws(
              ' ',
              registration.laboratory_sample_code,
              registration.sample_number,
              registration.sample_name,
              registration.sampling_laboratory_assistant,
              registration.sampling_location
            ) as search_text
          from laboratory_sample_registration_journal registration
          left join laboratory_chemical_analysis_sample_claims claim
            on claim.sample_source = 'sample_registration'
            and claim.sample_id = registration.id
          where claim.sample_id is null

          union all

          select
            'unshaped_product' as sample_source,
            unshaped.id as sample_id,
            unshaped.sample_code as laboratory_sample_code,
            unshaped.sample_number,
            unshaped.product_name as sample_name,
            unshaped.sample_date,
            null as registration_date,
            concat_ws(
              ' ',
              unshaped.sample_code,
              unshaped.sample_number,
              unshaped.product_name,
              unshaped.sampled_by,
              unshaped.batch_number
            ) as search_text
          from laboratory_unshaped_product_sample_journal unshaped
          left join laboratory_chemical_analysis_sample_claims claim
            on claim.sample_source = 'unshaped_product'
            and claim.sample_id = unshaped.id
          where claim.sample_id is null
        ) samples
        ${where}
        order by
          samples.sample_date desc,
          samples.registration_date desc,
          samples.sample_id desc
        limit ?`,
        parameters,
      );

      return rows.map(mapSampleOption);
    },

    async findSampleOption(reference, options = {}) {
      return readSampleOption(pool, reference, options);
    },

    async getNextLaboratoryAnalysisNumber() {
      const [rows] = await pool.query<LaboratoryNextAnalysisNumberRow[]>(
        `select coalesce(
          nullif(
            trim(leading '0' from trim(laboratory_analysis_number)),
            ''
          ),
          '0'
        ) as analysis_number
        from laboratory_chemical_analysis_journal
        where trim(laboratory_analysis_number) regexp '^[0-9]+$'
        order by
          char_length(analysis_number) desc,
          analysis_number desc
        limit 1`,
      );

      return (BigInt(rows[0]?.analysis_number ?? "0") + 1n).toString();
    },
  };
}

function mapSampleOption(
  row: LaboratoryChemicalAnalysisSampleOptionRow,
): LaboratoryChemicalAnalysisSampleOption {
  return {
    sampleSource: row.sample_source,
    sampleId: row.sample_id,
    laboratorySampleCode: row.laboratory_sample_code,
    sampleNumber: row.sample_number,
    sampleName: row.sample_name,
    sampleDate: formatDate(row.sample_date),
    ...(row.registration_date === null
      ? {}
      : { registrationDate: formatDate(row.registration_date) }),
  };
}

function mapRecord(
  row: LaboratoryChemicalAnalysisJournalRow,
): LaboratoryChemicalAnalysisJournalRecord {
  return {
    id: row.id,
    sampleSource: row.sample_source,
    sampleId: row.sample_id,
    laboratorySampleCode: row.laboratory_sample_code,
    sampleNumber: row.sample_number,
    sampleName: row.sample_name,
    sampleDate: formatDate(row.sample_date),
    ...(row.registration_date === null
      ? {}
      : { registrationDate: formatDate(row.registration_date) }),
    ...(row.laboratory_analysis_number === null
      ? {}
      : { laboratoryAnalysisNumber: row.laboratory_analysis_number }),
    ...(row.batch_number === null ? {} : { batchNumber: row.batch_number }),
    ...(row.chemical_analysis_date === null
      ? {}
      : { chemicalAnalysisDate: formatDate(row.chemical_analysis_date) }),
    ...(row.chemical_analysis_laboratory_assistant === null
      ? {}
      : {
          chemicalAnalysisLaboratoryAssistant:
            row.chemical_analysis_laboratory_assistant,
        }),
    ...(row.al2o3 === null ? {} : { al2o3: row.al2o3 }),
    ...(row.fe2o3 === null ? {} : { fe2o3: row.fe2o3 }),
    ...(row.sio2 === null ? {} : { sio2: row.sio2 }),
    ...(row.cao2 === null ? {} : { cao2: row.cao2 }),
    ...(row.p2o5 === null ? {} : { p2o5: row.p2o5 }),
    ...(row.loss_on_ignition === null
      ? {}
      : { lossOnIgnition: row.loss_on_ignition }),
    ...(row.moisture === null ? {} : { moisture: row.moisture }),
    ...(row.notes === null ? {} : { notes: row.notes }),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function readSampleOption(
  pool: DatabasePool,
  reference: LaboratoryChemicalAnalysisSampleReference,
  {
    availableOnly = false,
    excludeAnalysisId,
    lock = false,
  }: {
    availableOnly?: boolean;
    excludeAnalysisId?: string;
    lock?: boolean;
  } = {},
) {
  const source = reference.sampleSource === "sample_registration"
    ? {
        table: "laboratory_sample_registration_journal",
        alias: "registration",
        code: "registration.laboratory_sample_code",
        number: "registration.sample_number",
        name: "registration.sample_name",
        date: "registration.sampling_date",
        registrationDate: "registration.registration_date",
      }
    : {
        table: "laboratory_unshaped_product_sample_journal",
        alias: "unshaped",
        code: "unshaped.sample_code",
        number: "unshaped.sample_number",
        name: "unshaped.product_name",
        date: "unshaped.sample_date",
        registrationDate: "null",
      };
  const availability = availableOnly
    ? `and not exists (
        select 1
        from laboratory_chemical_analysis_sample_claims claim
        where claim.sample_source = '${reference.sampleSource}'
          and claim.sample_id = ${source.alias}.id
          ${excludeAnalysisId === undefined
            ? ""
            : "and claim.chemical_analysis_id <> ?"}
      )`
    : "";
  const parameters = excludeAnalysisId === undefined || !availableOnly
    ? [reference.sampleId]
    : [reference.sampleId, excludeAnalysisId];
  const [rows] = await pool.query<LaboratoryChemicalAnalysisSampleOptionRow[]>(
    `select
      '${reference.sampleSource}' as sample_source,
      ${source.alias}.id as sample_id,
      ${source.code} as laboratory_sample_code,
      ${source.number} as sample_number,
      ${source.name} as sample_name,
      ${source.date} as sample_date,
      ${source.registrationDate} as registration_date
    from ${source.table} ${source.alias}
    where ${source.alias}.id = ?
      ${availability}
    limit 1
    ${lock ? "for update" : ""}`,
    parameters,
  );

  return rows[0] === undefined ? undefined : mapSampleOption(rows[0]);
}

async function writeUnshapedProductSampleAnalysisNumber(
  pool: DatabasePool,
  sampleId: string,
  laboratoryAnalysisNumber: string | undefined,
) {
  await pool.query(
    `update laboratory_unshaped_product_sample_journal
    set chemical_analysis_number = ?
    where id = ?`,
    [laboratoryAnalysisNumber ?? null, sampleId],
  );
}

async function writeSampleClaim(
  pool: DatabasePool,
  reference: LaboratoryChemicalAnalysisSampleReference,
  analysisId: string,
) {
  await pool.query(
    `insert into laboratory_chemical_analysis_sample_claims (
      sample_source,
      sample_id,
      chemical_analysis_id
    ) values (?, ?, ?)`,
    [reference.sampleSource, reference.sampleId, analysisId],
  );
}

async function restoreLatestSampleClaim(
  pool: DatabasePool,
  reference: LaboratoryChemicalAnalysisSampleReference,
) {
  const analysisColumn = reference.sampleSource === "sample_registration"
    ? "sample_registration_id"
    : "unshaped_product_sample_id";
  await pool.query(
    `insert into laboratory_chemical_analysis_sample_claims (
      sample_source,
      sample_id,
      chemical_analysis_id
    )
    select ?, ?, analysis.id
    from laboratory_chemical_analysis_journal analysis
    where analysis.${analysisColumn} = ?
    order by analysis.sequence_id desc
    limit 1
    on duplicate key update
      chemical_analysis_id = values(chemical_analysis_id)`,
    [reference.sampleSource, reference.sampleId, reference.sampleId],
  );
}

function formatDate(value: Date | string) {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

function isDuplicateEntryError(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY";
}
