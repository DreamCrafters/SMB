import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  RefractoryWagonRecord,
  RefractoryWagonSubmission,
} from "../contracts/refractoryWagons.js";
import type { DatabasePool } from "../db/pool.js";

export class RefractoryWagonNumberAlreadyExistsError extends Error {
  constructor() {
    super("A refractory wagon with this number already exists.");
    this.name = "RefractoryWagonNumberAlreadyExistsError";
  }
}

export class RefractoryWagonNotFoundError extends Error {
  constructor() {
    super("A refractory wagon was not found.");
    this.name = "RefractoryWagonNotFoundError";
  }
}

export class RefractoryWagonBrandMismatchError extends Error {
  constructor() {
    super("A refractory wagon brand does not match the report row.");
    this.name = "RefractoryWagonBrandMismatchError";
  }
}

export type RefractoryWagonReference = Pick<
  RefractoryWagonRecord,
  "id" | "number" | "productBrand"
>;

export type RefractoryWagonsRepository = {
  create: (input: {
    wagon: RefractoryWagonSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<RefractoryWagonRecord>;
  list: () => Promise<RefractoryWagonRecord[]>;
  findByIds: (ids: string[]) => Promise<RefractoryWagonReference[]>;
  replaceReportLifecycle: (input: {
    sourceReportId: string;
    reportDate: string;
    shiftNumber: 1 | 2;
    firingWagonIds: string[];
    sortingWagonIds: string[];
    wagonProductBrands: Record<string, string>;
    /** Обжигальщик и сортировщик строки отчёта по каждому вагону. */
    firingOperators: Record<string, string | null>;
    sorters: Record<string, string | null>;
    /** Дата обжига/сортировки строки отчёта по каждому вагону, если указана. */
    firingDates: Record<string, string | null>;
    sortingDates: Record<string, string | null>;
  }) => Promise<void>;
  update: (input: {
    id: string;
    wagon: RefractoryWagonSubmission;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<RefractoryWagonCorrectionResult | undefined>;
};

export type RefractoryWagonCorrectionResult = {
  before: RefractoryWagonRecord;
  record: RefractoryWagonRecord;
};

type WagonRow = RowDataPacket & {
  id: string;
  catalog_wagon_id?: string;
  wagon_number: string;
  loading_date: Date | string | null;
  product_brand: string | null;
  press_date: Date | string | null;
  piece_count: number | string | null;
  setter_name: string | null;
  press_operator: string | null;
  raw_control_date: Date | string | null;
  firing_operator: string | null;
  sorter_name: string | null;
  post_firing_condition: string | null;
  service_approval_date: Date | string | null;
  created_at: Date | string;
};

type LifecycleEventRow = RowDataPacket & {
  wagon_id: string;
  event_type: "firing" | "sorting";
  event_date: Date | string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

export function createRefractoryWagonsRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): RefractoryWagonsRepository {
  return {
    async create(input) {
      const catalogId = createId();
      const id = createId();
      const createdAt = now().toISOString();
      try {
        await pool.query(
          `insert into refractory_wagon_catalog (
            id,
            wagon_number,
            submitted_by_user_id,
            submitted_by_account_id,
            created_at
          ) values (?, ?, ?, ?, ?)`,
          [
            catalogId,
            input.wagon.number,
            input.submittedByUserId,
            input.submittedByAccountId,
            createdAt,
          ],
        );
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          throw new RefractoryWagonNumberAlreadyExistsError();
        }
        throw error;
      }

      // Первый цикл нового физического вагона: та же запись, что и раньше,
      // плюс ссылка на каталожную запись, которая единственная держит
      // уникальность номера.
      await pool.query(
        `insert into refractory_wagons (
          id,
          catalog_wagon_id,
          wagon_number,
          loading_date,
          product_brand,
          press_date,
          piece_count,
          setter_name,
          press_operator,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          catalogId,
          input.wagon.number,
          input.wagon.loadingDate,
          input.wagon.productBrand,
          input.wagon.pressDate,
          input.wagon.pieceCount,
          input.wagon.setter,
          input.wagon.pressOperator,
          input.submittedByUserId,
          input.submittedByAccountId,
          createdAt,
        ],
      );

      return {
        id,
        ...input.wagon,
        rawControlDate: null,
        firingOperator: null,
        firingDates: [],
        sorter: null,
        sortingDate: null,
        postFiringCondition: null,
        serviceApprovalDate: null,
        createdAt,
      };
    },

    async list() {
      const [rows] = await pool.query<WagonRow[]>(
        `select
          id,
          wagon_number,
          loading_date,
          product_brand,
          press_date,
          piece_count,
          setter_name,
          press_operator,
          raw_control_date,
          firing_operator,
          sorter_name,
          post_firing_condition,
          service_approval_date,
          created_at
        from refractory_wagons
        order by sequence_id desc`,
      );
      const lifecycle = await loadLifecycle(pool, rows.map((row) => row.id));
      return rows.map((row) => mapWagonRow(row, lifecycle.get(row.id)));
    },

    async findByIds(ids) {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) return [];
      const placeholders = uniqueIds.map(() => "?").join(", ");
      const [rows] = await pool.query<WagonRow[]>(
        `select id, wagon_number, product_brand
        from refractory_wagons
        where id in (${placeholders})`,
        uniqueIds,
      );
      return rows.map((row) => ({
        id: row.id,
        number: row.wagon_number,
        productBrand: row.product_brand,
      }));
    },

    async replaceReportLifecycle(input) {
      const wagonIds = [...new Set([
        ...input.firingWagonIds,
        ...input.sortingWagonIds,
      ])];
      if (wagonIds.length > 0) {
        const placeholders = wagonIds.map(() => "?").join(", ");
        const [rows] = await pool.query<Array<
          RowDataPacket & { id: string; product_brand: string | null }
        >>(
          `select id, product_brand
          from refractory_wagons
          where id in (${placeholders})
          for update`,
          wagonIds,
        );
        if (rows.length !== wagonIds.length) {
          throw new RefractoryWagonNotFoundError();
        }
        if (rows.some((row) =>
          row.product_brand !== input.wagonProductBrands[row.id])) {
          throw new RefractoryWagonBrandMismatchError();
        }
      }

      await pool.query(
        `delete from refractory_wagon_lifecycle_events
        where source_report_type = ?
          and source_report_date = ?
          and source_shift_number = ?`,
        ["firing", input.reportDate, input.shiftNumber],
      );
      const events = [
        ...input.firingWagonIds.map((wagonId, position) => ({
          eventType: "firing" as const,
          position,
          wagonId,
          eventDate: input.firingDates[wagonId] ?? input.reportDate,
        })),
        ...input.sortingWagonIds.map((wagonId, position) => ({
          eventType: "sorting" as const,
          position,
          wagonId,
          eventDate: input.sortingDates[wagonId] ?? input.reportDate,
        })),
      ];
      if (events.length === 0) return;

      const placeholders = events.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");
      await pool.query(
        `insert into refractory_wagon_lifecycle_events (
          source_report_type,
          source_report_date,
          source_shift_number,
          event_type,
          position,
          wagon_id,
          event_date,
          source_report_id
        ) values ${placeholders}`,
        events.flatMap((event) => [
          "firing",
          input.reportDate,
          input.shiftNumber,
          event.eventType,
          event.position,
          event.wagonId,
          event.eventDate,
          input.sourceReportId,
        ]),
      );

      // Обжигальщик и сортировщик приходят из той же строки отчёта, что и даты.
      for (const wagonId of wagonIds) {
        const firingOperator = input.firingOperators[wagonId];
        const sorter = input.sorters[wagonId];
        if (firingOperator === undefined && sorter === undefined) continue;
        const assignments: string[] = [];
        const parameters: unknown[] = [];
        if (firingOperator !== undefined) {
          assignments.push("firing_operator = ?");
          parameters.push(firingOperator);
        }
        if (sorter !== undefined) {
          assignments.push("sorter_name = ?");
          parameters.push(sorter);
        }
        await pool.query(
          `update refractory_wagons set ${assignments.join(", ")} where id = ?`,
          [...parameters, wagonId],
        );
      }
    },

    async update(input) {
      const [rows] = await pool.query<WagonRow[]>(
        `select
          id,
          catalog_wagon_id,
          wagon_number,
          loading_date,
          product_brand,
          press_date,
          piece_count,
          setter_name,
          press_operator,
          raw_control_date,
          firing_operator,
          sorter_name,
          post_firing_condition,
          service_approval_date,
          created_at
        from refractory_wagons
        where id = ?
        limit 1
        for update`,
        [input.id],
      );
      const row = rows[0];
      if (row === undefined) return undefined;

      const lifecycle = await loadLifecycle(pool, [input.id]);
      const before = mapWagonRow(row, lifecycle.get(input.id));
      try {
        // Уникальность номера держит только каталог, поэтому переименование
        // проверяем и фиксируем там же, до правки самого цикла.
        if (input.wagon.number !== row.wagon_number) {
          await pool.query(
            `update refractory_wagon_catalog set wagon_number = ? where id = ?`,
            [input.wagon.number, row.catalog_wagon_id],
          );
        }
        await pool.query(
          `update refractory_wagons
          set wagon_number = ?, loading_date = ?, product_brand = ?,
            press_date = ?, piece_count = ?, setter_name = ?, press_operator = ?
          where id = ?`,
          [
            input.wagon.number,
            input.wagon.loadingDate,
            input.wagon.productBrand,
            input.wagon.pressDate,
            input.wagon.pieceCount,
            input.wagon.setter,
            input.wagon.pressOperator,
            input.id,
          ],
        );
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          throw new RefractoryWagonNumberAlreadyExistsError();
        }
        throw error;
      }

      const record: RefractoryWagonRecord = {
        ...before,
        ...input.wagon,
      };
      await pool.query(
        `insert into refractory_wagon_revisions (
          id,
          wagon_id,
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
          now().toISOString(),
        ],
      );

      return { before, record };
    },
  };
}

function mapWagonRow(
  row: WagonRow,
  lifecycle?: { firingDates: string[]; sortingDate: string | null },
): RefractoryWagonRecord {
  return {
    id: row.id,
    number: row.wagon_number,
    loadingDate: formatOptionalCalendarDate(row.loading_date),
    productBrand: row.product_brand,
    pressDate: formatOptionalCalendarDate(row.press_date),
    pieceCount: readOptionalCount(row.piece_count),
    setter: row.setter_name,
    pressOperator: row.press_operator,
    rawControlDate: formatOptionalCalendarDate(row.raw_control_date),
    firingOperator: row.firing_operator,
    firingDates: lifecycle?.firingDates ?? [],
    sorter: row.sorter_name,
    sortingDate: lifecycle?.sortingDate ?? null,
    postFiringCondition: row.post_firing_condition,
    serviceApprovalDate: formatOptionalCalendarDate(row.service_approval_date),
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}

async function loadLifecycle(pool: DatabasePool, wagonIds: string[]) {
  const lifecycle = new Map<
    string,
    { firingDates: string[]; sortingDate: string | null }
  >();
  if (wagonIds.length === 0) return lifecycle;

  const placeholders = wagonIds.map(() => "?").join(", ");
  const [rows] = await pool.query<LifecycleEventRow[]>(
    `select wagon_id, event_type, event_date
    from refractory_wagon_lifecycle_events
    where wagon_id in (${placeholders})
    order by wagon_id, event_date, source_report_date,
      source_shift_number, event_type, position`,
    wagonIds,
  );
  for (const row of rows) {
    const current = lifecycle.get(row.wagon_id) ?? {
      firingDates: [],
      sortingDate: null,
    };
    const eventDate = formatOptionalCalendarDate(row.event_date)!;
    if (row.event_type === "firing") {
      current.firingDates.push(eventDate);
    } else {
      current.sortingDate = eventDate;
    }
    lifecycle.set(row.wagon_id, current);
  }
  return lifecycle;
}

function readOptionalCount(value: number | string | null) {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatOptionalCalendarDate(value: Date | string | null) {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function isDuplicateEntryError(error: unknown) {
  return error instanceof Error &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY";
}
