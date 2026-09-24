import assert from "node:assert/strict";
import test from "node:test";
import { runWithAccountPreviewContext, setAccountPreviewActor } from "./accountPreviewContext.js";
import { createAuditRepository } from "../repositories/auditRepository.js";
import type { DatabasePool } from "../db/pool.js";

test("preview audit records the real administrator and isolates concurrent requests", async () => {
  const rows: unknown[][] = [];
  const repository = createAuditRepository({ async query(_sql: string, values: unknown[]) { rows.push(values); return [[], []]; } } as unknown as DatabasePool);
  const actor = (id: string) => ({ userId: id, accountId: `${id}-access`, displayName: id, positionDisplayName: "Сотрудник" });
  await Promise.all(["one", "two"].map(id => runWithAccountPreviewContext(async () => {
    setAccountPreviewActor(actor(`admin-${id}`), actor(`target-${id}`));
    await new Promise(resolve => setTimeout(resolve, id === "one" ? 10 : 1));
    await repository.record({ actor: actor(`target-${id}`), category: "data_change", action: "data.update", summary: id });
  })));
  assert.deepEqual(rows.map(row => row[1]), ["admin-two", "admin-one"]);
  assert.match(String(rows[0][10]), /target-two/u);
  assert.match(String(rows[1][10]), /target-one/u);
  await repository.record({ actor: actor("ordinary"), category: "data_change", action: "data.update", summary: "Обычное действие" });
  assert.equal(rows[2][1], "ordinary");
  assert.equal(rows[2][9], "Обычное действие");
});
