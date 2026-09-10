import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import {
  findRailwayWagonStage,
  isRailwayWagonDecisionStage,
  isRailwayWagonStageAvailable,
  railwayWagonStageFields,
  type RailwayWagonCargoLine,
  type RailwayWagonDecision,
  type RailwayWagonOrder,
  type RailwayWagonRole,
  type RailwayWagonStageField,
} from "../contracts/railwayWagons.js";
import type {
  RailwayWagonOrderSubmission,
} from "../domain/railwayWagons.js";
import type { DatabasePool } from "../db/pool.js";

export class RailwayWagonOrderNotFoundError extends Error {
  constructor() {
    super("Заявка на вагон не найдена.");
    this.name = "RailwayWagonOrderNotFoundError";
  }
}

export class RailwayWagonStageNotAvailableError extends Error {
  constructor(message = "Этап ещё не открыт или уже пройден.") {
    super(message);
    this.name = "RailwayWagonStageNotAvailableError";
  }
}

export type RailwayWagonActor = {
  userId: string;
  accountId: string;
  displayName: string | null;
};

/** Поля, которые может записать этап; их набор проверяет валидатор этапа. */
export type RailwayWagonStageFieldValues = Partial<
  Pick<
    RailwayWagonOrder,
    | "rentCost"
    | "tariffCost"
    | "demurragePenalty"
    | "carrier"
    | "wagonNumber"
    | "expectedArrivalDate"
    | "currentLocation"
  >
>;

export type ApplyRailwayWagonStageInput = {
  orderId: string;
  stageId: string;
  roles: readonly RailwayWagonRole[];
  fields: RailwayWagonStageFieldValues;
  /** Есть только у этапов согласования: они решаются двумя кнопками. */
  decision?: RailwayWagonDecision;
  declineComment?: string | null;
  actor: RailwayWagonActor;
};

export type ApplyRailwayWagonStageResult = {
  before: RailwayWagonOrder;
  record: RailwayWagonOrder;
  /** Перевыставленная заявка появляется только на этапе брака. */
  replacement?: RailwayWagonOrder;
};

export type RailwayWagonsRepository = {
  list: () => Promise<RailwayWagonOrder[]>;
  read: (orderId: string) => Promise<RailwayWagonOrder | undefined>;
  listCarrierOptions: () => Promise<string[]>;
  createOrder: (input: {
    order: RailwayWagonOrderSubmission;
    actor: RailwayWagonActor;
  }) => Promise<RailwayWagonOrder>;
  correctOrder: (input: {
    orderId: string;
    order: RailwayWagonOrderSubmission;
    actor: RailwayWagonActor;
  }) => Promise<{ before: RailwayWagonOrder; record: RailwayWagonOrder }>;
  applyStage: (
    input: ApplyRailwayWagonStageInput,
  ) => Promise<ApplyRailwayWagonStageResult>;
};

type OrderRow = {
  id: string;
  contract_reference: string;
  movement_direction: string;
  destination_station: string;
  destination_station_road: string | null;
  wagon_type: string;
  rent_cost: string | number | null;
  tariff_cost: string | number | null;
  demurrage_penalty: string | null;
  carrier: string | null;
  wagon_number: string | null;
  expected_arrival_date: Date | string | null;
  current_location: string | null;
  decline_comment: string | null;
  decline_stage_id: string | null;
  replaced_by_order_id: string | null;
  created_at: Date | string;
} & Record<StageColumn, Date | string | null> & RowDataPacket;

type CargoRow = {
  order_id: string;
  cargo_name: string;
  etsng_code: string | null;
  etsng_name: string | null;
  pallet_count: number | null;
  pallet_weight: string | number | null;
  pallet_width: string | number | null;
  pallet_height: string | number | null;
  pallet_length: string | number | null;
  securing_method: string | null;
  securing_weight: string | number | null;
} & RowDataPacket;

type CarrierRow = { carrier: string } & RowDataPacket;

type StageColumn = (typeof stageColumns)[RailwayWagonStageField];

/** Метки этапов контракта и колонки таблицы совпадают один в один. */
const stageColumns = {
  orderedAt: "ordered_at",
  pricingStartedAt: "pricing_started_at",
  logisticsApprovedAt: "logistics_approved_at",
  managerApprovedAt: "manager_approved_at",
  specificationSignedAt: "specification_signed_at",
  enRouteAt: "en_route_at",
  atLoadingStationAt: "at_loading_station_at",
  rejectedAt: "rejected_at",
  atShipperTrackAt: "at_shipper_track_at",
  atLoadingAt: "at_loading_at",
  loadedAt: "loaded_at",
  acceptedForCarriageAt: "accepted_for_carriage_at",
  deliveredAt: "delivered_at",
  unloadedAt: "unloaded_at",
  releasedAt: "released_at",
} as const satisfies Record<RailwayWagonStageField, string>;

const stageFieldColumns = {
  rentCost: "rent_cost",
  tariffCost: "tariff_cost",
  demurragePenalty: "demurrage_penalty",
  carrier: "carrier",
  wagonNumber: "wagon_number",
  expectedArrivalDate: "expected_arrival_date",
  currentLocation: "current_location",
} as const satisfies Record<keyof RailwayWagonStageFieldValues, string>;

const orderColumns = `
  id,
  contract_reference,
  movement_direction,
  destination_station,
  destination_station_road,
  wagon_type,
  rent_cost,
  tariff_cost,
  demurrage_penalty,
  carrier,
  wagon_number,
  expected_arrival_date,
  current_location,
  decline_comment,
  decline_stage_id,
  replaced_by_order_id,
  ${Object.values(stageColumns).join(",\n  ")},
  created_at
`;

/** Столько строк груза уходит в базу одним `insert`. */
const cargoInsertChunkSize = 100;

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

export function createRailwayWagonsRepository(
  pool: DatabasePool,
  { createId = randomUUID, now = () => new Date() }: RepositoryOptions = {},
): RailwayWagonsRepository {
  async function loadOrders(orderIds?: readonly string[]) {
    const filter = orderIds === undefined
      ? ""
      : `where id in (${orderIds.map(() => "?").join(", ")})`;

    const [rows] = await pool.query<OrderRow[]>(
      `select ${orderColumns}
      from railway_wagon_orders
      ${filter}
      order by sequence_id desc`,
      orderIds === undefined ? [] : [...orderIds],
    );

    if (rows.length === 0) return [];

    const cargoLines = await loadCargoLines(rows.map((row) => row.id));

    return rows.map((row) => mapOrderRow(row, cargoLines.get(row.id) ?? []));
  }

  async function loadCargoLines(orderIds: readonly string[]) {
    const grouped = new Map<string, RailwayWagonCargoLine[]>();
    if (orderIds.length === 0) return grouped;

    const [rows] = await pool.query<CargoRow[]>(
      `select
        order_id,
        cargo_name,
        etsng_code,
        etsng_name,
        pallet_count,
        pallet_weight,
        pallet_width,
        pallet_height,
        pallet_length,
        securing_method,
        securing_weight
      from railway_wagon_cargo_lines
      where order_id in (${orderIds.map(() => "?").join(", ")})
      order by order_id asc, row_order asc`,
      [...orderIds],
    );

    for (const row of rows) {
      const lines = grouped.get(row.order_id) ?? [];
      lines.push(mapCargoRow(row));
      grouped.set(row.order_id, lines);
    }

    return grouped;
  }

  async function requireOrder(orderId: string) {
    const [order] = await loadOrders([orderId]);
    if (order === undefined) throw new RailwayWagonOrderNotFoundError();
    return order;
  }

  async function replaceCargoLines(
    orderId: string,
    cargoLines: readonly RailwayWagonCargoLine[],
  ) {
    await pool.query(
      `delete from railway_wagon_cargo_lines where order_id = ?`,
      [orderId],
    );

    for (
      let offset = 0;
      offset < cargoLines.length;
      offset += cargoInsertChunkSize
    ) {
      const chunk = cargoLines.slice(offset, offset + cargoInsertChunkSize);

      await pool.query(
        `insert into railway_wagon_cargo_lines (
          id,
          order_id,
          row_order,
          cargo_name,
          etsng_code,
          etsng_name,
          pallet_count,
          pallet_weight,
          pallet_width,
          pallet_height,
          pallet_length,
          securing_method,
          securing_weight
        ) values ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
        chunk.flatMap((line, index) => [
          createId(),
          orderId,
          offset + index,
          line.cargoName,
          line.etsngCode,
          line.etsngName,
          line.palletCount,
          line.palletWeight,
          line.palletWidth,
          line.palletHeight,
          line.palletLength,
          line.securingMethod,
          line.securingWeight,
        ]),
      );
    }
  }

  async function insertOrder(input: {
    order: RailwayWagonOrderSubmission;
    actor: RailwayWagonActor;
    orderedAt: string;
  }) {
    const orderId = createId();

    await pool.query(
      `insert into railway_wagon_orders (
        id,
        contract_reference,
        movement_direction,
        destination_station,
        destination_station_road,
        wagon_type,
        ordered_at,
        submitted_by_user_id,
        submitted_by_account_id
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        input.order.contractReference,
        input.order.movementDirection,
        input.order.destinationStation,
        input.order.destinationStationRoad,
        input.order.wagonType,
        input.orderedAt,
        input.actor.userId,
        input.actor.accountId,
      ],
    );

    await replaceCargoLines(orderId, input.order.cargoLines);

    return orderId;
  }

  async function recordRevision(input: {
    orderId: string;
    stageId: string;
    before: RailwayWagonOrder | null;
    after: RailwayWagonOrder;
    actor: RailwayWagonActor;
  }) {
    await pool.query(
      `insert into railway_wagon_revisions (
        id,
        order_id,
        stage_id,
        before_snapshot,
        after_snapshot,
        submitted_by_user_id,
        submitted_by_account_id,
        submitted_by_display_name,
        created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        createId(),
        input.orderId,
        input.stageId,
        input.before === null ? null : JSON.stringify(input.before),
        JSON.stringify(input.after),
        input.actor.userId,
        input.actor.accountId,
        input.actor.displayName,
        now().toISOString(),
      ],
    );
  }

  return {
    async list() {
      return loadOrders();
    },

    async read(orderId) {
      const [order] = await loadOrders([orderId]);
      return order;
    },

    /** Перевозчики копятся из уже отправленных заявок, отдельного справочника нет. */
    async listCarrierOptions() {
      const [rows] = await pool.query<CarrierRow[]>(
        `select trim(carrier) as carrier
        from railway_wagon_orders
        where carrier is not null and trim(carrier) <> ''
        group by carrier
        order by max(sequence_id) desc, carrier asc`,
      );

      return rows.map((row) => row.carrier);
    },

    async createOrder({ order, actor }) {
      const orderId = await insertOrder({
        order,
        actor,
        orderedAt: now().toISOString(),
      });
      const record = await requireOrder(orderId);

      await recordRevision({
        orderId,
        stageId: "order",
        before: null,
        after: record,
        actor,
      });

      return record;
    },

    /**
     * Заявку правит только менеджер и только пока сотрудник по работе с РЖД не
     * взял её в работу: дальше цена и согласования уже опираются на груз.
     */
    async correctOrder({ orderId, order, actor }) {
      const before = await requireOrder(orderId);

      if (before.pricingStartedAt !== null) {
        throw new RailwayWagonStageNotAvailableError(
          "Заявку нельзя править после того, как по ней начато согласование условий.",
        );
      }

      await pool.query(
        `update railway_wagon_orders
        set contract_reference = ?,
          movement_direction = ?,
          destination_station = ?,
          destination_station_road = ?,
          wagon_type = ?
        where id = ?`,
        [
          order.contractReference,
          order.movementDirection,
          order.destinationStation,
          order.destinationStationRoad,
          order.wagonType,
          orderId,
        ],
      );
      await replaceCargoLines(orderId, order.cargoLines);

      const record = await requireOrder(orderId);
      await recordRevision({
        orderId,
        stageId: "order_correction",
        before,
        after: record,
        actor,
      });

      return { before, record };
    },

    /**
     * Порядок этапов проверяется ещё раз здесь, под `for update`: список в
     * браузере мог устареть, а два редактора одного вагона — обычное дело.
     */
    async applyStage({
      orderId,
      stageId,
      roles,
      fields,
      decision,
      declineComment = null,
      actor,
    }) {
      const stage = findRailwayWagonStage(stageId);
      if (stage === undefined) {
        throw new RailwayWagonStageNotAvailableError("Неизвестный этап вагона.");
      }

      if (!stage.editors.some((editor) => roles.includes(editor))) {
        throw new RailwayWagonStageNotAvailableError(
          "Этот этап заполняет другая должность.",
        );
      }

      if (isRailwayWagonDecisionStage(stage) !== (decision !== undefined)) {
        throw new RailwayWagonStageNotAvailableError(
          isRailwayWagonDecisionStage(stage)
            ? "Этап согласования решается кнопками «Одобрить» и «Отклонить»."
            : "Этот этап решением не закрывается.",
        );
      }

      await pool.query(
        `select id from railway_wagon_orders where id = ? limit 1 for update`,
        [orderId],
      );

      const before = await requireOrder(orderId);

      if (!isRailwayWagonStageAvailable(before, stage)) {
        throw new RailwayWagonStageNotAvailableError();
      }

      const assignments: string[] = [];
      const parameters: unknown[] = [];

      for (const [field, column] of Object.entries(stageFieldColumns)) {
        const value = fields[field as keyof RailwayWagonStageFieldValues];
        if (value === undefined) continue;
        assignments.push(`${column} = ?`);
        parameters.push(value);
      }

      /**
       * Отклонение не ставит свою метку, а снимает перечисленные контрактом:
       * заявка возвращается на тот шаг, где условия ещё можно переписать, и
       * получает причину возврата. Одобрение причину снимает — колонка
       * отвечает на вопрос «почему заявка вернулась», а история решений лежит
       * в ревизиях.
       */
      if (decision === "decline") {
        for (const field of stage.declines ?? []) {
          assignments.push(`${stageColumns[field]} = null`);
        }
        assignments.push("decline_comment = ?", "decline_stage_id = ?");
        parameters.push(declineComment, stage.id);
      } else {
        if (stage.stamps !== null) {
          assignments.push(`${stageColumns[stage.stamps]} = ?`);
          parameters.push(now().toISOString());
        }
        if (decision === "approve") {
          assignments.push("decline_comment = null", "decline_stage_id = null");
        }
      }

      if (assignments.length > 0) {
        await pool.query(
          `update railway_wagon_orders set ${assignments.join(", ")} where id = ?`,
          [...parameters, orderId],
        );
      }

      let replacement: RailwayWagonOrder | undefined;

      if (stage.stamps === "rejectedAt") {
        replacement = await reissueOrder(before, actor);
        await pool.query(
          `update railway_wagon_orders set replaced_by_order_id = ? where id = ?`,
          [replacement.id, orderId],
        );
      }

      const record = await requireOrder(orderId);
      await recordRevision({ orderId, stageId, before, after: record, actor });

      return { before, record, replacement };
    },
  };

  /**
   * Забракованный на промежуточной станции вагон перевыставляется новой
   * заявкой: содержимое переносится целиком, номер вагона остаётся пустым, а
   * статус снова становится «Заказан». Станция назначения в перечне
   * техзадания не названа, но без неё заявка неработоспособна, поэтому
   * переносится вместе с остальным содержимым.
   */
  async function reissueOrder(
    source: RailwayWagonOrder,
    actor: RailwayWagonActor,
  ) {
    const orderId = await insertOrder({
      order: {
        contractReference: source.contractReference,
        movementDirection: source.movementDirection,
        destinationStation: source.destinationStation,
        destinationStationRoad: source.destinationStationRoad,
        wagonType: source.wagonType,
        cargoLines: source.cargoLines,
      },
      actor,
      orderedAt: now().toISOString(),
    });
    const record = await requireOrder(orderId);

    await recordRevision({
      orderId,
      stageId: "reissue",
      before: null,
      after: record,
      actor,
    });

    return record;
  }
}

function mapOrderRow(
  row: OrderRow,
  cargoLines: RailwayWagonCargoLine[],
): RailwayWagonOrder {
  const stages = Object.fromEntries(
    railwayWagonStageFields.map((field) => [
      field,
      toOptionalIsoString(row[stageColumns[field]]),
    ]),
  ) as Record<RailwayWagonStageField, string | null>;

  return {
    id: row.id,
    contractReference: row.contract_reference,
    movementDirection: row.movement_direction as RailwayWagonOrder["movementDirection"],
    destinationStation: row.destination_station,
    destinationStationRoad: row.destination_station_road,
    wagonType: row.wagon_type as RailwayWagonOrder["wagonType"],
    rentCost: toOptionalNumber(row.rent_cost),
    tariffCost: toOptionalNumber(row.tariff_cost),
    demurragePenalty: row.demurrage_penalty,
    carrier: row.carrier,
    wagonNumber: row.wagon_number,
    expectedArrivalDate: toOptionalCalendarDate(row.expected_arrival_date),
    currentLocation: row.current_location,
    declineComment: row.decline_comment,
    declineStageId: row.decline_stage_id,
    replacedByOrderId: row.replaced_by_order_id,
    cargoLines,
    createdAt: toIsoString(row.created_at),
    ...stages,
  };
}

function mapCargoRow(row: CargoRow): RailwayWagonCargoLine {
  return {
    cargoName: row.cargo_name,
    etsngCode: row.etsng_code,
    etsngName: row.etsng_name,
    palletCount: row.pallet_count,
    palletWeight: toOptionalNumber(row.pallet_weight),
    palletWidth: toOptionalNumber(row.pallet_width),
    palletHeight: toOptionalNumber(row.pallet_height),
    palletLength: toOptionalNumber(row.pallet_length),
    securingMethod: row.securing_method,
    securingWeight: toOptionalNumber(row.securing_weight),
  };
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toOptionalIsoString(value: Date | string | null) {
  return value === null ? null : toIsoString(value);
}

function toOptionalCalendarDate(value: Date | string | null) {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function toOptionalNumber(value: string | number | null) {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
