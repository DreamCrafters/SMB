import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createDispatcherSubmissionsRepository } from "./dispatcherSubmissionsRepository.js";

test("dispatcher submissions repository paginates history", async () => {
  let statement = "";
  let queryValues: unknown[] = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      statement = sql.replace(/\s+/gu, " ").trim();
      queryValues = values ?? [];
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createDispatcherSubmissionsRepository(pool);

  await repository.listLatest({ limit: 50, offset: 75 });

  assert.match(statement, /limit \? offset \?$/u);
  assert.deepEqual(queryValues, [50, 75]);
});

test("dispatcher submissions repository filters production history by payload month", async () => {
  let statement = "";
  let queryValues: unknown[] = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      statement = sql.replace(/\s+/gu, " ").trim();
      queryValues = values ?? [];
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createDispatcherSubmissionsRepository(pool);

  await repository.listLatest({
    formId: "production",
    reportMonth: "2026-07",
    limit: 2_000,
    offset: 0,
  });

  assert.match(statement, /json_extract\(payload, '\$\.reportMonth'\)/u);
  assert.match(statement, /json_extract\(payload, '\$\.reportDate'\)/u);
  assert.deepEqual(queryValues, [
    "production",
    "2026-07",
    "%.07.2026",
    "2026-07-%",
    2_000,
    0,
  ]);
});

test("dispatcher submissions repository finds the latest production report before a date", async () => {
  let statement = "";
  let queryValues: unknown[] = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      statement = sql.replace(/\s+/gu, " ").trim();
      queryValues = values ?? [];
      return [[{
        id: "production-2026-07-20",
        form_id: "production",
        payload: JSON.stringify({ reportDate: "20.07.2026" }),
        summary: "Выработка за 20.07.2026",
        status: "received",
        submitted_by_account_id: "dispatcher-1",
        submitted_at: "2026-07-20T18:00:00.000Z",
        received_at: "2026-07-20T18:00:01.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createDispatcherSubmissionsRepository(pool);

  const found = await repository.findLatestProductionBefore?.("2026-07-23");

  // Цепочка веса по отгрузкам не должна рваться на пропущенном дне, поэтому
  // выборка идёт строго по дате отчёта, а не по предыдущему календарному дню.
  assert.match(statement, /< cast\(\? as date\)/u);
  assert.match(statement, /like '__\.__\.____'/u);
  assert.match(statement, /order by case .* end desc, received_at desc/u);
  assert.match(statement, /limit 1$/u);
  assert.deepEqual(queryValues, ["production", "2026-07-23"]);
  assert.equal(found?.id, "production-2026-07-20");
  assert.equal(found?.payload.reportDate, "20.07.2026");
});

test("dispatcher submissions repository reads only accumulated COSH master names", async () => {
  let statement = "";
  let queryValues: unknown[] = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      statement = sql.replace(/\s+/gu, " ").trim();
      queryValues = values ?? [];
      return [[
        { cosh_master: "Сидоров С.С." },
        { cosh_master: "Петров П.П." },
      ], []];
    },
  } as unknown as DatabasePool;
  const repository = createDispatcherSubmissionsRepository(pool);

  const options = await repository.listProductionCoshMasterOptions?.();

  assert.deepEqual(options, ["Сидоров С.С.", "Петров П.П."]);
  assert.match(statement, /json_extract\(payload, '\$\.coshMaster'\)/u);
  assert.match(statement, /group by cosh_master/u);
  assert.doesNotMatch(statement, /select id,/u);
  assert.deepEqual(queryValues, ["production"]);
});

test("dispatcher submissions repository ignores a duplicate non-equipment row", async () => {
  const statements: string[] = [];
  const queryValues: unknown[][] = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      statements.push(sql.replace(/\s+/gu, " ").trim());
      queryValues.push(values ?? []);

      if (sql.includes("insert ignore")) {
        return [{ affectedRows: 1 }, []];
      }

      return [[{
        id: "incident-id",
        form_id: "incident_close",
        payload: JSON.stringify({
          incidentNumber: "INC-2026-12",
          closureDateTime: "12.06.2026 10:00",
        }),
        summary: "Закрытие инцидента",
        status: "received",
        submitted_by_account_id: "dispatcher-access",
        submitted_at: new Date("2026-06-12T07:00:00.000Z"),
        received_at: new Date("2026-06-12T07:00:00.000Z"),
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createDispatcherSubmissionsRepository(pool);

  await repository.create({
    draft: {
      formId: "incident_close",
      payload: {
        incidentNumber: "INC-2026-12",
        closureDateTime: "12.06.2026 10:00",
      },
    },
    summary: "Закрытие инцидента",
  }, "dispatcher-access");

  assert.match(statements[0] ?? "", /^insert ignore into dispatcher_submissions/u);
  assert.doesNotMatch(statements[0] ?? "", /on duplicate key update/u);
  assert.match(
    String(queryValues[0]?.[8]),
    /^dispatcher:incident_close:[a-f0-9]{64}$/u,
  );
});
