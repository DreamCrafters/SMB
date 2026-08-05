import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratoryGreenProductQualityFilters,
  LaboratoryGreenProductQualityOptions,
  LaboratoryGreenProductQualityPressNumber,
  LaboratoryGreenProductQualityRecord,
  LaboratoryGreenProductQualitySubmission,
  LaboratoryGreenProductQualityWagonOption,
} from "../contracts/laboratoryGreenProductQualityJournal.js";
import type { DatabasePool } from "../db/pool.js";
import { escapeLikePattern } from "./laboratoryResultsRepository.js";

export class LaboratoryGreenProductQualityWagonUnavailableError extends Error {
  constructor() {
    super("One or more refractory wagons are unavailable.");
    this.name = "LaboratoryGreenProductQualityWagonUnavailableError";
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
  setter_name: string;
  press_operator: string;
  length_first: string;
  length_second: string;
  width_first: string;
  width_second: string;
  height_first: string;
  height_second: string;
  weight_value: string;
  mechanical_strength: string;
  density_value: string;
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
      const wagons = await resolveWagons(pool, record.wagonIds);

      await pool.query(
        `insert into laboratory_green_product_quality_journal (
          id,
          record_date,
          press_number,
          product_brand,
          setter_name,
          press_operator,
          length_first,
          length_second,
          width_first,
          width_second,
          height_first,
          height_second,
          weight_value,
          mechanical_strength,
          density_value,
          press_operator_recommendations,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.recordDate,
          record.pressNumber,
          record.productBrand,
          record.setter,
          record.pressOperator,
          record.lengthFirst,
          record.lengthSecond,
          record.widthFirst,
          record.widthSecond,
          record.heightFirst,
          record.heightSecond,
          record.weight,
          record.mechanicalStrength,
          record.density,
          record.pressOperatorRecommendations,
          input.submittedByUserId,
          input.submittedByAccountId,
          createdAt,
        ],
      );
      await insertWagonLinks(pool, id, record.wagonIds);

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
            length_first,
            length_second,
            width_first,
            width_second,
            height_first,
            height_second,
            weight_value,
            mechanical_strength,
            density_value,
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
          setter_name,
          press_operator,
          length_first,
          length_second,
          width_first,
          width_second,
          height_first,
          height_second,
          weight_value,
          mechanical_strength,
          density_value,
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
      const [wagonRows] = await pool.query<WagonRow[]>(
        `select id, wagon_number
        from refractory_wagons
        order by sequence_id desc`,
      );
      return {
        setters: people
          .filter((row) => row.option_type === "setter")
          .map((row) => row.value),
        pressOperators: people
          .filter((row) => row.option_type === "press_operator")
          .map((row) => row.value),
        wagons: wagonRows.map((row) => ({ id: row.id, number: row.wagon_number })),
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
          setter_name,
          press_operator,
          length_first,
          length_second,
          width_first,
          width_second,
          height_first,
          height_second,
          weight_value,
          mechanical_strength,
          density_value,
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
          setter_name = ?,
          press_operator = ?,
          length_first = ?,
          length_second = ?,
          width_first = ?,
          width_second = ?,
          height_first = ?,
          height_second = ?,
          weight_value = ?,
          mechanical_strength = ?,
          density_value = ?,
          press_operator_recommendations = ?
        where id = ?`,
        [
          input.record.recordDate,
          input.record.pressNumber,
          input.record.productBrand,
          input.record.setter,
          input.record.pressOperator,
          input.record.lengthFirst,
          input.record.lengthSecond,
          input.record.widthFirst,
          input.record.widthSecond,
          input.record.heightFirst,
          input.record.heightSecond,
          input.record.weight,
          input.record.mechanicalStrength,
          input.record.density,
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
    setter: record.setter,
    pressOperator: record.pressOperator,
    wagonIds: record.wagonIds,
    wagons: record.wagons,
    lengthFirst: record.lengthFirst,
    lengthSecond: record.lengthSecond,
    widthFirst: record.widthFirst,
    widthSecond: record.widthSecond,
    heightFirst: record.heightFirst,
    heightSecond: record.heightSecond,
    weight: record.weight,
    mechanicalStrength: record.mechanicalStrength,
    density: record.density,
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
    setter: row.setter_name,
    pressOperator: row.press_operator,
    wagonIds: wagons.map((wagon) => wagon.id),
    wagons,
    lengthFirst: row.length_first,
    lengthSecond: row.length_second,
    widthFirst: row.width_first,
    widthSecond: row.width_second,
    heightFirst: row.height_first,
    heightSecond: row.height_second,
    weight: row.weight_value,
    mechanicalStrength: row.mechanical_strength,
    density: row.density_value,
    pressOperatorRecommendations: row.press_operator_recommendations,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}

function formatCalendarDate(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function resolveWagons(
  pool: DatabasePool,
  wagonIds: string[],
): Promise<LaboratoryGreenProductQualityWagonOption[]> {
  const placeholders = wagonIds.map(() => "?").join(", ");
  const [rows] = await pool.query<WagonRow[]>(
    `select id, wagon_number
      from refractory_wagons
      where id in (${placeholders})`,
    wagonIds,
  );
  const wagonById = new Map(rows.map((row) => [
    row.id,
    { id: row.id, number: row.wagon_number },
  ]));
  if (wagonById.size !== wagonIds.length) {
    throw new LaboratoryGreenProductQualityWagonUnavailableError();
  }
  return wagonIds.map((id) => wagonById.get(id)!);
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
