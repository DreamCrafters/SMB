import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  createRailwayReferenceRepository,
  railwayReferenceSearchLimit,
} from "./railwayReferenceRepository.js";

test("station search matches a substring and prefers the prefix", async () => {
  const queries: Query[] = [];
  const repository = createRailwayReferenceRepository(
    buildPool(queries, [{ name: "Абагур-Лесной", road: "З-Сиб" }]),
  );

  assert.deepEqual(await repository.searchStations(" абагур "), [
    { name: "Абагур-Лесной", road: "З-Сиб" },
  ]);
  assert.deepEqual(queries[0]?.parameters, ["%абагур%", "абагур%"]);
  assert.match(
    queries[0]?.sql ?? "",
    new RegExp(`limit ${railwayReferenceSearchLimit}`, "u"),
  );
});

test("an empty query returns nothing instead of the whole reference", async () => {
  const queries: Query[] = [];
  const repository = createRailwayReferenceRepository(buildPool(queries, []));

  assert.deepEqual(await repository.searchStations("   "), []);
  assert.deepEqual(await repository.searchEtsngCodes(""), []);
  assert.equal(queries.length, 0);
});

test("wildcards typed by the user are escaped, not treated as a pattern", async () => {
  const queries: Query[] = [];
  const repository = createRailwayReferenceRepository(buildPool(queries, []));

  await repository.searchStations("100%_!");

  assert.deepEqual(queries[0]?.parameters, ["%100!%!_!!%", "100!%!_!!%"]);
  assert.match(queries[0]?.sql ?? "", /escape '!'/u);
});

test("ETSNG search looks at both the code and the name", async () => {
  const queries: Query[] = [];
  const repository = createRailwayReferenceRepository(
    buildPool(queries, [{ code: "01000", name: "Зерновые культуры" }]),
  );

  assert.deepEqual(await repository.searchEtsngCodes("зерн"), [
    { code: "01000", name: "Зерновые культуры" },
  ]);
  assert.match(queries[0]?.sql ?? "", /code like \? escape '!' or name like \?/u);
});

test("resolving codes returns a lookup keyed by the code", async () => {
  const repository = createRailwayReferenceRepository(
    buildPool([], [{ code: "01000", name: "Зерновые культуры" }]),
  );

  const resolved = await repository.resolveEtsngCodes(["01000"]);
  assert.deepEqual(resolved.get("01000"), {
    code: "01000",
    name: "Зерновые культуры",
  });
});

test("resolving nothing does not reach the database", async () => {
  const queries: Query[] = [];
  const repository = createRailwayReferenceRepository(buildPool(queries, []));

  assert.equal((await repository.resolveEtsngCodes([])).size, 0);
  assert.equal((await repository.resolveSecuringMethods([])).size, 0);
  assert.equal(queries.length, 0);
});

type Query = { sql: string; parameters?: unknown[] };

function buildPool(queries: Query[], rows: unknown[]) {
  return {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [rows, []];
    },
  } as unknown as DatabasePool;
}
