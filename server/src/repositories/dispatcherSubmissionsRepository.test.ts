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
        business_account_id: "business-main",
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
      businessAccountId: "business-main",
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
    String(queryValues[0]?.[9]),
    /^dispatcher:business-main:incident_close:[a-f0-9]{64}$/u,
  );
});
