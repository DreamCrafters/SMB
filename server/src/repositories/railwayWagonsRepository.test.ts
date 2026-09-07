import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { railwayWagonStageFields } from "../contracts/railwayWagons.js";
import type { RailwayWagonStageField } from "../contracts/railwayWagons.js";
import {
  RailwayWagonStageNotAvailableError,
  createRailwayWagonsRepository,
} from "./railwayWagonsRepository.js";

test("a new order is stamped as ordered and stores its cargo lines in order", async () => {
  const queries: Query[] = [];
  const repository = createRailwayWagonsRepository(
    buildPool(queries, () => [[buildOrderRow(["orderedAt"])], []], [
      buildCargoRow("Глина Г-5"),
    ]),
    { createId: buildIdSequence(), now: () => new Date(stamp) },
  );

  await repository.createOrder({
    order: {
      contractReference: "12/2026",
      movementDirection: "На выгрузку",
      destinationStation: "Абагур-Лесной",
      destinationStationRoad: "З-Сиб",
      wagonType: "ПВ (полувагон)",
      cargoLines: [
        buildCargoLine("Глина Г-5"),
        buildCargoLine("Шамот ШБ-5"),
      ],
    },
    actor,
  });

  const insertOrder = queries.find(({ sql }) =>
    /insert into railway_wagon_orders/u.test(sql));
  assert.equal(insertOrder?.parameters?.[0], "id-1");
  assert.equal(insertOrder?.parameters?.[6], stamp);

  const insertCargo = queries.find(({ sql }) =>
    /insert into railway_wagon_cargo_lines/u.test(sql));
  // Порядок строк груза держит `row_order`, а не порядок выборки.
  assert.equal(insertCargo?.parameters?.[2], 0);
  assert.equal(insertCargo?.parameters?.[3], "Глина Г-5");
  assert.equal(insertCargo?.parameters?.[15], 1);
  assert.equal(insertCargo?.parameters?.[16], "Шамот ШБ-5");
});

test("saving cargo lines replaces the previous ones instead of merging", async () => {
  const queries: Query[] = [];
  const repository = createRailwayWagonsRepository(
    buildPool(queries, () => [[buildOrderRow(["orderedAt"])], []], []),
    { createId: buildIdSequence(), now: () => new Date(stamp) },
  );

  await repository.correctOrder({
    orderId: "order-1",
    order: {
      contractReference: "12/2026",
      movementDirection: "На выгрузку",
      destinationStation: "Абагур-Лесной",
      destinationStationRoad: "З-Сиб",
      wagonType: "ПВ (полувагон)",
      cargoLines: [buildCargoLine("Глина Г-5")],
    },
    actor,
  });

  const deleteIndex = queries.findIndex(({ sql }) =>
    /delete from railway_wagon_cargo_lines/u.test(sql));
  const insertIndex = queries.findIndex(({ sql }) =>
    /insert into railway_wagon_cargo_lines/u.test(sql));
  assert.ok(deleteIndex >= 0 && insertIndex > deleteIndex);
});

test("an order cannot be corrected once carriage terms are under way", async () => {
  const repository = createRailwayWagonsRepository(
    buildPool([], () => [[buildOrderRow(["orderedAt", "pricingStartedAt"])], []], []),
    { createId: buildIdSequence(), now: () => new Date(stamp) },
  );

  await assert.rejects(
    () => repository.correctOrder({
      orderId: "order-1",
      order: {
        contractReference: "12/2026",
        movementDirection: "На выгрузку",
        destinationStation: "Абагур-Лесной",
        destinationStationRoad: "З-Сиб",
        wagonType: "ПВ (полувагон)",
        cargoLines: [buildCargoLine("Глина Г-5")],
      },
      actor,
    }),
    RailwayWagonStageNotAvailableError,
  );
});

test("a stage that another position fills is refused", async () => {
  const repository = createRailwayWagonsRepository(
    buildPool([], () => [[buildOrderRow(["orderedAt"])], []], []),
    { createId: buildIdSequence(), now: () => new Date(stamp) },
  );

  await assert.rejects(
    () => repository.applyStage({
      orderId: "order-1",
      stageId: "carriage_terms",
      roles: ["sales"],
      fields: {},
      actor,
    }),
    RailwayWagonStageNotAvailableError,
  );
});

test("a stage whose predecessor is missing is refused under the row lock", async () => {
  const queries: Query[] = [];
  const repository = createRailwayWagonsRepository(
    buildPool(queries, () => [[buildOrderRow(["orderedAt"])], []], []),
    { createId: buildIdSequence(), now: () => new Date(stamp) },
  );

  await assert.rejects(
    () => repository.applyStage({
      orderId: "order-1",
      stageId: "logistics_approval",
      roles: ["logistics"],
      fields: {},
      actor,
    }),
    RailwayWagonStageNotAvailableError,
  );
  assert.ok(queries.some(({ sql }) => /for update/u.test(sql)));
});

test("an open stage writes its fields and stamps the ladder", async () => {
  const queries: Query[] = [];
  const repository = createRailwayWagonsRepository(
    buildPool(queries, () => [[buildOrderRow(["orderedAt"])], []], []),
    { createId: buildIdSequence(), now: () => new Date(stamp) },
  );

  await repository.applyStage({
    orderId: "order-1",
    stageId: "carriage_terms",
    roles: ["carrier"],
    fields: {
      rentCost: 120000,
      tariffCost: 85000,
      demurragePenalty: "3 000 руб.",
      carrier: "ПГК",
    },
    actor,
  });

  const update = queries.find(({ sql }) =>
    /update railway_wagon_orders set/u.test(sql));
  assert.match(update?.sql ?? "", /rent_cost = \?/u);
  assert.match(update?.sql ?? "", /pricing_started_at = \?/u);
  assert.deepEqual(update?.parameters, [
    120000,
    85000,
    "3 000 руб.",
    "ПГК",
    stamp,
    "order-1",
  ]);
});

test("the location stage writes without stamping the ladder", async () => {
  const queries: Query[] = [];
  const repository = createRailwayWagonsRepository(
    buildPool(
      queries,
      () => [[buildOrderRow([
        "orderedAt",
        "pricingStartedAt",
        "logisticsApprovedAt",
        "managerApprovedAt",
        "specificationSignedAt",
        "enRouteAt",
      ])], []],
      [],
    ),
    { createId: buildIdSequence(), now: () => new Date(stamp) },
  );

  await repository.applyStage({
    orderId: "order-1",
    stageId: "location",
    roles: ["carrier"],
    fields: { currentLocation: "Тайга" },
    actor,
  });

  const update = queries.find(({ sql }) =>
    /update railway_wagon_orders set/u.test(sql));
  assert.deepEqual(update?.parameters, ["Тайга", "order-1"]);
});

test("rejecting a wagon reissues the order with its cargo and links both", async () => {
  const queries: Query[] = [];
  const repository = createRailwayWagonsRepository(
    buildPool(
      queries,
      () => [[buildOrderRow([
        "orderedAt",
        "pricingStartedAt",
        "logisticsApprovedAt",
        "managerApprovedAt",
        "specificationSignedAt",
        "enRouteAt",
      ])], []],
      [buildCargoRow("Глина Г-5")],
    ),
    { createId: buildIdSequence(), now: () => new Date(stamp) },
  );

  const result = await repository.applyStage({
    orderId: "order-1",
    stageId: "rejected",
    roles: ["carrier"],
    fields: {},
    actor,
  });

  assert.notEqual(result.replacement, undefined);

  const reissue = queries.find(({ sql }) =>
    /insert into railway_wagon_orders/u.test(sql));
  // Станция назначения переносится вместе с содержимым: без неё заявка
  // неработоспособна, хотя в перечне техзадания её нет.
  assert.equal(reissue?.parameters?.[3], "Абагур-Лесной");
  assert.equal(reissue?.parameters?.[6], stamp);
  assert.ok(
    queries.some(({ sql }) => /set replaced_by_order_id = \?/u.test(sql)),
  );
});

test("carrier options accumulate from the orders themselves", async () => {
  const queries: Query[] = [];
  const repository = createRailwayWagonsRepository(
    {
      async query(sql: string, parameters?: unknown[]) {
        queries.push({ sql, parameters });
        return [[{ carrier: "ПГК" }], []];
      },
    } as unknown as DatabasePool,
  );

  assert.deepEqual(await repository.listCarrierOptions(), ["ПГК"]);
  assert.match(queries[0]?.sql ?? "", /group by carrier/u);
});

type Query = { sql: string; parameters?: unknown[] };

const stamp = "2026-09-07T08:00:00.000Z";

const actor = {
  userId: "user-1",
  accountId: "account-1",
  displayName: "Менеджер",
};

function buildPool(
  queries: Query[],
  respondOrders: () => [unknown[], unknown[]],
  cargoRows: unknown[],
) {
  return {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });

      if (/from railway_wagon_cargo_lines/u.test(sql)) return [cargoRows, []];
      if (/from railway_wagon_orders/u.test(sql)) return respondOrders();

      return [[], []];
    },
  } as unknown as DatabasePool;
}

function buildIdSequence() {
  let counter = 0;
  return () => {
    counter += 1;
    return `id-${counter}`;
  };
}

function buildOrderRow(filled: readonly RailwayWagonStageField[]) {
  const stages = Object.fromEntries(
    railwayWagonStageFields.map((field) => [
      toColumn(field),
      filled.includes(field) ? stamp : null,
    ]),
  );

  return {
    id: "order-1",
    contract_reference: "12/2026",
    movement_direction: "На выгрузку",
    destination_station: "Абагур-Лесной",
    destination_station_road: "З-Сиб",
    wagon_type: "ПВ (полувагон)",
    rent_cost: null,
    tariff_cost: null,
    demurrage_penalty: null,
    carrier: null,
    wagon_number: null,
    expected_arrival_date: null,
    current_location: null,
    replaced_by_order_id: null,
    created_at: stamp,
    ...stages,
  };
}

function buildCargoRow(cargoName: string) {
  return {
    order_id: "order-1",
    cargo_name: cargoName,
    etsng_code: null,
    etsng_name: null,
    pallet_count: null,
    pallet_weight: null,
    pallet_width: null,
    pallet_height: null,
    pallet_length: null,
    securing_method: null,
    securing_weight: null,
  };
}

function buildCargoLine(cargoName: string) {
  return {
    cargoName,
    etsngCode: null,
    etsngName: null,
    palletCount: null,
    palletWeight: null,
    palletWidth: null,
    palletHeight: null,
    palletLength: null,
    securingMethod: null,
    securingWeight: null,
  };
}

function toColumn(field: RailwayWagonStageField) {
  return field.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}
