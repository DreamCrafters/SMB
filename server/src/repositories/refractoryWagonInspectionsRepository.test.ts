import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  createRefractoryWagonInspectionsRepository,
  RefractoryWagonInspectionNotAllowedError,
} from "./refractoryWagonInspectionsRepository.js";

function buildPool(
  wagon: {
    post_firing_condition: string | null;
    service_approval_date: string | null;
  } | undefined,
  sortingDate: string | null,
  queries: Array<{ sql: string; parameters?: unknown[] }> = [],
) {
  return {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/from refractory_wagons/u.test(sql)) {
        return [wagon === undefined
          ? []
          : [{ id: "wagon-17", wagon_number: "В-17", ...wagon }], []];
      }
      if (/from refractory_wagon_lifecycle_events/u.test(sql)) {
        return [[{ sorting_date: sortingDate }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
}

const inspectedBy = {
  inspectedByUserId: "refractory-user",
  inspectedByAccountId: "refractory-account",
  inspectedByDisplayName: "Мастер ОЦ",
};

test("wagon inspection stores the verdict and writes it into the wagon", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = buildPool(
    { post_firing_condition: null, service_approval_date: null },
    "2026-08-11",
    queries,
  );
  const repository = createRefractoryWagonInspectionsRepository(pool, {
    createId: () => "inspection-1",
    now: () => new Date("2026-08-12T09:00:00.000Z"),
  });

  const saved = await repository.create({
    inspection: {
      wagonId: "wagon-17",
      condition: "Можно эксплуатировать",
      approvalDate: "2026-08-12",
    },
    ...inspectedBy,
  });

  assert.deepEqual(saved, {
    id: "inspection-1",
    wagonId: "wagon-17",
    wagonNumber: "В-17",
    sortingDate: "2026-08-11",
    condition: "Можно эксплуатировать",
    approvalDate: "2026-08-12",
    inspectedByDisplayName: "Мастер ОЦ",
    createdAt: "2026-08-12T09:00:00.000Z",
  });
  assert.match(queries[0]?.sql ?? "", /for update/u);
  assert.match(
    queries[2]?.sql ?? "",
    /insert into refractory_wagon_inspections/u,
  );
  assert.match(queries[3]?.sql ?? "", /update refractory_wagons/u);
  assert.deepEqual(queries[3]?.parameters, [
    "Можно эксплуатировать",
    "2026-08-12",
    "wagon-17",
  ]);
});

test("wagon inspection reopens after a new sorting and returns a repaired wagon", async () => {
  const repeatedCycle = createRefractoryWagonInspectionsRepository(
    buildPool(
      {
        post_firing_condition: "Можно эксплуатировать",
        service_approval_date: "2026-07-30",
      },
      "2026-08-11",
    ),
  );
  assert.ok(await repeatedCycle.create({
    inspection: {
      wagonId: "wagon-17",
      condition: "Можно эксплуатировать",
      approvalDate: "2026-08-12",
    },
    ...inspectedBy,
  }));

  const repairedWagon = createRefractoryWagonInspectionsRepository(
    buildPool(
      {
        post_firing_condition: "В ремонт",
        service_approval_date: "2026-08-11",
      },
      "2026-08-11",
    ),
  );
  assert.ok(await repairedWagon.create({
    inspection: {
      wagonId: "wagon-17",
      condition: "Можно эксплуатировать",
      approvalDate: "2026-08-12",
    },
    ...inspectedBy,
  }));
});

test("wagon inspection rejects wagons that are not awaiting it", async () => {
  const notSorted = createRefractoryWagonInspectionsRepository(
    buildPool(
      { post_firing_condition: null, service_approval_date: null },
      null,
    ),
  );
  await assert.rejects(
    () => notSorted.create({
      inspection: {
        wagonId: "wagon-17",
        condition: "Можно эксплуатировать",
        approvalDate: "2026-08-12",
      },
      ...inspectedBy,
    }),
    RefractoryWagonInspectionNotAllowedError,
  );

  const alreadyApproved = createRefractoryWagonInspectionsRepository(
    buildPool(
      {
        post_firing_condition: "Можно эксплуатировать",
        service_approval_date: "2026-08-12",
      },
      "2026-08-11",
    ),
  );
  await assert.rejects(
    () => alreadyApproved.create({
      inspection: {
        wagonId: "wagon-17",
        condition: "Можно эксплуатировать",
        approvalDate: "2026-08-12",
      },
      ...inspectedBy,
    }),
    RefractoryWagonInspectionNotAllowedError,
  );
});

test("wagon inspection reports a missing wagon", async () => {
  const repository = createRefractoryWagonInspectionsRepository(
    buildPool(undefined, null),
  );

  assert.equal(
    await repository.create({
      inspection: {
        wagonId: "missing-wagon",
        condition: "В ремонт",
        approvalDate: "2026-08-12",
      },
      ...inspectedBy,
    }),
    undefined,
  );
});
