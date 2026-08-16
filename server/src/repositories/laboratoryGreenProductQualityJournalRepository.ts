import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratoryGreenProductQualityFilters,
  LaboratoryGreenProductQualityOptions,
  LaboratoryGreenProductQualityAvailableWagon,
  LaboratoryGreenProductQualityPressNumber,
  LaboratoryGreenProductQualityRecord,
  LaboratoryGreenProductQualitySubmission,
  LaboratoryGreenProductQualityWagonOption,
} from "../contracts/laboratoryGreenProductQualityJournal.js";
import {
  isRefractoryWagonAvailableForRawControl,
  isRefractoryWagonLoadingComplete,
} from "../contracts/refractoryWagons.js";
import type { DatabasePool } from "../db/pool.js";
import { escapeLikePattern } from "./laboratoryResultsRepository.js";

export class LaboratoryGreenProductQualityWagonUnavailableError extends Error {
  constructor() {
    super("One or more refractory wagons are unavailable.");
    this.name = "LaboratoryGreenProductQualityWagonUnavailableError";
  }
}

/**
 * Задача 91: контроль сырца идёт после садки, поэтому сервер повторно
 * проверяет её полноту и не полагается на отфильтрованный список формы.
 */
export class LaboratoryGreenProductQualityWagonLoadingIncompleteError
  extends Error {
  constructor() {
    super("One or more refractory wagons have an incomplete loading stage.");
    this.name = "LaboratoryGreenProductQualityWagonLoadingIncompleteError";
  }
}

export class LaboratoryGreenProductQualityWagonBrandMismatchError extends Error {
  constructor() {
    super("Selected refractory wagons have different product brands.");
    this.name = "LaboratoryGreenProductQualityWagonBrandMismatchError";
  }
}

export type LaboratoryGreenProductQualityJournalRepository = {
  create: (input: {
    record: LaboratoryGreenProductQualitySubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<LaboratoryGreenProductQualityRecord>;
  list: (
    filters?: LaboratoryGreenProductQualityFilters & { limit?: number },
  ) => Promise<LaboratoryGreenProductQualityRecord[]>;
  listOptions: () => Promise<LaboratoryGreenProductQualityOptions>;
  update: (input: {
    id: string;
    record: LaboratoryGreenProductQualitySubmission;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<LaboratoryGreenProductQualityCorrectionResult | undefined>;
};

export type LaboratoryGreenProductQualitySnapshot =
  LaboratoryGreenProductQualitySubmission & {
    wagons: LaboratoryGreenProductQualityWagonOption[];
  };

export type LaboratoryGreenProductQualityCorrectionResult = {
  before: LaboratoryGreenProductQualitySnapshot;
  record: LaboratoryGreenProductQualityRecord;
};

type JournalRow = RowDataPacket & {
  id: string;
  record_date: Date | string;
  press_number: LaboratoryGreenProductQualityPressNumber;
  product_brand: string;
  press_date: Date | string | null;
  setter_name: string;
  press_operator: string;
  loading_date: Date | string | null;
  piece_count: number | string | null;
  measurements: unknown;
  press_operator_recommendations: string;
  created_at: Date | string;
};

type WagonLinkRow = WagonRow & {
  green_product_quality_id: string;
};

type OptionRow = RowDataPacket & {
  option_type: "setter" | "press_operator";
  value: string;
};

type WagonRow = RowDataPacket & {
  id: string;
  wagon_number: string;
};

type ResolvedWagonRow = WagonRow & LoadingStageRow & {
  product_brand: string | null;
};

type AvailableWagonRow = WagonRow & {
  loading_date: Date | string | null;
  product_brand: string | null;
  press_date: Date | string | null;
  piece_count: number | string | null;
  setter_name: string | null;
  press_operator: string | null;
  raw_control_date: Date | string | null;
  post_firing_condition: string | null;
};

type LoadingStageRow = {
  loading_date: Date | string | null;
  press_date: Date | string | null;
  setter_name: string | null;
  press_operator: string | null;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const defaultListLimit = 200;
const maxListLimit = 500;

export function createLaboratoryGreenProductQualityJournalRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): LaboratoryGreenProductQualityJournalRepository {
  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      const record = input.record;
      const wagons = await resolveWagons(pool, record.wagonIds, {
        requireLoadingStage: true,
      });

      await pool.query(
        `insert into laboratory_green_product_quality_journal (
          id,
          record_date,
          press_number,
          product_brand,
          press_date,
          setter_name,
          press_operator,
          loading_date,
          piece_count,
          measurements,
          press_operator_recommendations,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.recordDate,
          record.pressNumber,
          record.productBrand,
          record.pressDate,
          record.setter,
          record.pressOperator,
          record.loadingDate,
          record.pieceCount,
          JSON.stringify(record.measurements),
          record.pressOperatorRecommendations,
          input.submittedByUserId,
          input.submittedByAccountId,
          createdAt,
        ],
      );
      await insertWagonLinks(pool, id, record.wagonIds);
      await refreshRawControlDates(pool, record.wagonIds);

      return { id, ...record, wagons, createdAt };
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
            press_number,
            product_brand,
            setter_name,
            press_operator,
            measurements,
            press_operator_recommendations,
            (
              select group_concat(wagon.wagon_number order by link.position separator ' ')
              from laboratory_green_product_quality_wagons link
              inner join refractory_wagons wagon on wagon.id = link.wagon_id
              where link.green_product_quality_id =
                laboratory_green_product_quality_journal.id
            )
          ),
          ?
        ) > 0`);
        parameters.push(filters.query);
      }
      if (filters.nameQuery !== undefined) {
        clauses.push("product_brand like ?");
        parameters.push(`%${escapeLikePattern(filters.nameQuery)}%`);
      }
      const limit = Math.min(
        Math.max(Math.trunc(filters.limit ?? defaultListLimit), 1),
        maxListLimit,
      );
      const where = clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`;
      const [rows] = await pool.query<JournalRow[]>(
        `select
          id,
          record_date,
          press_number,
          product_brand,
          press_date,
          setter_name,
          press_operator,
          loading_date,
          piece_count,
          measurements,
          press_operator_recommendations,
          created_at
        from laboratory_green_product_quality_journal
        ${where}
        order by record_date desc, sequence_id desc
        limit ?`,
        [...parameters, limit],
      );
      if (rows.length === 0) return [];

      const wagonLinks = await listWagonLinks(
        pool,
        rows.map((row) => row.id),
      );
      const wagonsByRecordId = groupWagonsByRecordId(wagonLinks);
      return rows.map((row) => mapJournalRow(
        row,
        wagonsByRecordId.get(row.id) ?? [],
      ));
    },

    async listOptions() {
      const [people] = await pool.query<OptionRow[]>(
        `select option_type, value
        from (
          select
            'setter' as option_type,
            setter_name as value,
            max(sequence_id) as last_used_at
          from laboratory_green_product_quality_journal
          group by setter_name
          union all
          select
            'press_operator' as option_type,
            press_operator as value,
            max(sequence_id) as last_used_at
          from laboratory_green_product_quality_journal
          group by press_operator
        ) options
        order by option_type asc, last_used_at desc, value asc`,
      );
      // Каждый вагон может пройти несколько циклов «Оборота»; контроль сырца
      // видит только последний цикл, и то на своём этапе конвейера (задача 91).
      const [wagonRows] = await pool.query<AvailableWagonRow[]>(
        `select
          wagon.id,
          wagon.wagon_number,
          loading_date,
          product_brand,
          press_date,
          piece_count,
          setter_name,
          press_operator,
          raw_control_date,
          post_firing_condition
        from refractory_wagons wagon
        inner join (
          select wagon_number, max(sequence_id) as sequence_id
          from refractory_wagons
          group by wagon_number
        ) latest_cycle
          on latest_cycle.wagon_number = wagon.wagon_number
          and latest_cycle.sequence_id = wagon.sequence_id
        order by loading_date desc, wagon.sequence_id desc`,
      );
      return {
        setters: people
          .filter((row) => row.option_type === "setter")
          .map((row) => row.value),
        pressOperators: people
          .filter((row) => row.option_type === "press_operator")
          .map((row) => row.value),
        wagons: wagonRows
          .filter((row) =>
            isRefractoryWagonAvailableForRawControl(readWagonStage(row)))
          .map(mapAvailableWagon),
      };
    },

    async update(input) {
      const correctedWagons = await resolveWagons(pool, input.record.wagonIds);
      const [rows] = await pool.query<JournalRow[]>(
        `select
          id,
          record_date,
          press_number,
          product_brand,
          press_date,
          setter_name,
          press_operator,
          loading_date,
          piece_count,
          measurements,
          press_operator_recommendations,
          created_at
        from laboratory_green_product_quality_journal
        where id = ?
        limit 1
        for update`,
        [input.id],
      );
      const row = rows[0];
      if (row === undefined) return undefined;

      const previousLinks = await listWagonLinks(pool, [input.id]);
      const previousWagons = groupWagonsByRecordId(previousLinks).get(input.id) ?? [];
      const previousRecord = mapJournalRow(row, previousWagons);
      const before = toSnapshot(previousRecord);
      const after: LaboratoryGreenProductQualitySnapshot = {
        ...input.record,
        wagons: correctedWagons,
      };

      await pool.query(
        `update laboratory_green_product_quality_journal
        set
          record_date = ?,
          press_number = ?,
          product_brand = ?,
          press_date = ?,
          setter_name = ?,
          press_operator = ?,
          loading_date = ?,
          piece_count = ?,
          measurements = ?,
          press_operator_recommendations = ?
        where id = ?`,
        [
          input.record.recordDate,
          input.record.pressNumber,
          input.record.productBrand,
          input.record.pressDate,
          input.record.setter,
          input.record.pressOperator,
          input.record.loadingDate,
          input.record.pieceCount,
          JSON.stringify(input.record.measurements),
          input.record.pressOperatorRecommendations,
          input.id,
        ],
      );
      await pool.query(
        `delete from laboratory_green_product_quality_wagons
        where green_product_quality_id = ?`,
        [input.id],
      );
      await insertWagonLinks(pool, input.id, input.record.wagonIds);
      await refreshRawControlDates(
        pool,
        [...new Set([
          ...previousWagons.map((wagon) => wagon.id),
          ...input.record.wagonIds,
        ])],
      );
      const correctedAt = now().toISOString();
      await pool.query(
        `insert into laboratory_green_product_quality_revisions (
          id,
          green_product_quality_id,
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
          JSON.stringify(after),
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
          ...input.record,
          wagons: correctedWagons,
          createdAt: previousRecord.createdAt,
        },
      };
    },
  };
}

function toSnapshot(
  record: LaboratoryGreenProductQualityRecord,
): LaboratoryGreenProductQualitySnapshot {
  return {
    recordDate: record.recordDate,
    pressNumber: record.pressNumber,
    productBrand: record.productBrand,
    pressDate: record.pressDate,
    setter: record.setter,
    pressOperator: record.pressOperator,
    loadingDate: record.loadingDate,
    pieceCount: record.pieceCount,
    wagonIds: record.wagonIds,
    wagons: record.wagons,
    measurements: record.measurements,
    pressOperatorRecommendations: record.pressOperatorRecommendations,
  };
}

async function listWagonLinks(pool: DatabasePool, recordIds: string[]) {
  const placeholders = recordIds.map(() => "?").join(", ");
  const [rows] = await pool.query<WagonLinkRow[]>(
    `select
      link.green_product_quality_id,
      wagon.id,
      wagon.wagon_number
    from laboratory_green_product_quality_wagons link
    inner join refractory_wagons wagon on wagon.id = link.wagon_id
    where link.green_product_quality_id in (${placeholders})
    order by link.green_product_quality_id asc, link.position asc`,
    recordIds,
  );
  return rows;
}

function groupWagonsByRecordId(rows: WagonLinkRow[]) {
  const wagonsByRecordId = new Map<
    string,
    LaboratoryGreenProductQualityWagonOption[]
  >();
  for (const row of rows) {
    const wagons = wagonsByRecordId.get(row.green_product_quality_id) ?? [];
    wagons.push({ id: row.id, number: row.wagon_number });
    wagonsByRecordId.set(row.green_product_quality_id, wagons);
  }
  return wagonsByRecordId;
}

function mapJournalRow(
  row: JournalRow,
  wagons: LaboratoryGreenProductQualityWagonOption[],
): LaboratoryGreenProductQualityRecord {
  return {
    id: row.id,
    recordDate: formatCalendarDate(row.record_date),
    pressNumber: row.press_number,
    productBrand: row.product_brand,
    pressDate: formatOptionalCalendarDate(row.press_date),
    setter: row.setter_name,
    pressOperator: row.press_operator,
    loadingDate: formatOptionalCalendarDate(row.loading_date),
    pieceCount: readOptionalCount(row.piece_count),
    wagonIds: wagons.map((wagon) => wagon.id),
    wagons,
    measurements: readJson(row.measurements) as
      LaboratoryGreenProductQualityRecord["measurements"],
    pressOperatorRecommendations: row.press_operator_recommendations,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}

function readLoadingStage(row: LoadingStageRow) {
  return {
    loadingDate: formatOptionalCalendarDate(row.loading_date),
    pressDate: formatOptionalCalendarDate(row.press_date),
    setter: row.setter_name,
    pressOperator: row.press_operator,
  };
}

function readWagonStage(row: AvailableWagonRow) {
  return {
    ...readLoadingStage(row),
    rawControlDate: formatOptionalCalendarDate(row.raw_control_date),
    postFiringCondition: row.post_firing_condition,
  };
}

function mapAvailableWagon(
  row: AvailableWagonRow,
): LaboratoryGreenProductQualityAvailableWagon {
  return {
    id: row.id,
    number: row.wagon_number,
    loadingDate: row.loading_date === null
      ? null
      : formatCalendarDate(row.loading_date),
    productBrand: row.product_brand,
    pressDate: formatOptionalCalendarDate(row.press_date),
    pieceCount: readOptionalCount(row.piece_count),
    setter: row.setter_name,
    pressOperator: row.press_operator,
  };
}

function formatCalendarDate(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatOptionalCalendarDate(value: Date | string | null | undefined) {
  return value === null || value === undefined ? null : formatCalendarDate(value);
}

function readOptionalCount(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readJson(value: unknown): unknown[] {
  if (typeof value === "string") return JSON.parse(value) as unknown[];
  return Array.isArray(value) ? value : [];
}

async function resolveWagons(
  pool: DatabasePool,
  wagonIds: string[],
  { requireLoadingStage = false }: { requireLoadingStage?: boolean } = {},
): Promise<LaboratoryGreenProductQualityWagonOption[]> {
  const placeholders = wagonIds.map(() => "?").join(", ");
  const [rows] = await pool.query<ResolvedWagonRow[]>(
    `select id, wagon_number, product_brand, loading_date, press_date,
      setter_name, press_operator
      from refractory_wagons
      where id in (${placeholders})
      for update`,
    wagonIds,
  );
  const wagonById = new Map(rows.map((row) => [
    row.id,
    { id: row.id, number: row.wagon_number },
  ]));
  if (wagonById.size !== wagonIds.length) {
    throw new LaboratoryGreenProductQualityWagonUnavailableError();
  }
  // Исправление уже сохранённой записи этап садки не перепроверяет: она давно
  // пройдена, а её поля мог изменить более поздний `Оборот вагонов`.
  if (
    requireLoadingStage &&
    rows.some((row) => !isRefractoryWagonLoadingComplete(readLoadingStage(row)))
  ) {
    throw new LaboratoryGreenProductQualityWagonLoadingIncompleteError();
  }
  const productBrands = new Set(
    rows
      .map((row) => normalizeProductBrand(row.product_brand))
      .filter((brand): brand is string => brand !== undefined),
  );
  if (productBrands.size > 1) {
    throw new LaboratoryGreenProductQualityWagonBrandMismatchError();
  }
  return wagonIds.map((id) => wagonById.get(id)!);
}

function normalizeProductBrand(value: string | null) {
  const normalized = value?.trim().replace(/\s+/gu, " ");
  return normalized === undefined || normalized === ""
    ? undefined
    : normalized.toLocaleLowerCase("ru-RU");
}

async function insertWagonLinks(
  pool: DatabasePool,
  recordId: string,
  wagonIds: string[],
) {
  const values = wagonIds.map(() => "(?, ?, ?)").join(", ");
  await pool.query(
    `insert into laboratory_green_product_quality_wagons (
      green_product_quality_id,
      wagon_id,
      position
    ) values ${values}`,
    wagonIds.flatMap((wagonId, position) => [recordId, wagonId, position]),
  );
}

async function refreshRawControlDates(
  pool: DatabasePool,
  wagonIds: string[],
) {
  if (wagonIds.length === 0) return;
  const placeholders = wagonIds.map(() => "?").join(", ");
  await pool.query(
    `update refractory_wagons wagon
    left join (
      select
        link.wagon_id,
        max(journal.record_date) as raw_control_date
      from laboratory_green_product_quality_wagons link
      inner join laboratory_green_product_quality_journal journal
        on journal.id = link.green_product_quality_id
      where link.wagon_id in (${placeholders})
      group by link.wagon_id
    ) control on control.wagon_id = wagon.id
    set wagon.raw_control_date = control.raw_control_date
    where wagon.id in (${placeholders})`,
    [...wagonIds, ...wagonIds],
  );
}
