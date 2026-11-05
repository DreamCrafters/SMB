import { readFile } from "node:fs/promises";
import { parseCsvRows } from "../integrations/googleSheetsReference.js";
import {
  applyRefractoryWagonFleetImport,
  countRefractoryWagonFleetChanges,
  previewRefractoryWagonFleetImport,
  refractoryWagonFleetAsOfDate,
} from "../integrations/refractoryWagonFleetImport.js";
import { readServerConfig } from "../config/env.js";
import { createDatabasePool } from "./pool.js";
import { createDatabaseTransactionContext, runWithDatabaseMutationLock } from "./transactionContext.js";
import { testDatabaseMutationLockName } from "./productionSnapshot.js";
import { createAuditRepository } from "../repositories/auditRepository.js";
import { createRefractoryWagonInspectionsRepository } from "../repositories/refractoryWagonInspectionsRepository.js";
import { createRefractoryWagonsRepository } from "../repositories/refractoryWagonsRepository.js";

const sourceFile = new URL(`../../assets/refractory-wagon-fleet/${refractoryWagonFleetAsOfDate}.csv`, import.meta.url);
const actor = { userId: "system-task-143", accountId: "system-task-143", displayName: "Перенос учёта вагонов" };

async function main() {
  const preview = previewRefractoryWagonFleetImport(parseCsvRows(await readFile(sourceFile, "utf8")), refractoryWagonFleetAsOfDate);
  console.log(JSON.stringify({
    asOfDate: refractoryWagonFleetAsOfDate,
    wagons: preview.entries.length,
    notServiceable: preview.entries.filter((entry) => !entry.serviceable).length,
    warnings: preview.warnings,
  }));
  if (preview.warnings.length > 0) throw new Error("The wagon fleet source has invalid rows.");

  const config = readServerConfig();
  const pool = createDatabasePool(config.databaseUrl);
  const database = createDatabaseTransactionContext(pool);
  const wagons = createRefractoryWagonsRepository(database.pool);
  const inspections = createRefractoryWagonInspectionsRepository(database.pool);
  const audit = createAuditRepository(database.pool);
  try {
    if (!process.argv.includes("--apply")) {
      console.log(JSON.stringify({ environment: config.appEnv, ...await countRefractoryWagonFleetChanges(wagons, preview.entries) }));
      return;
    }
    const apply = () => database.transaction.run(async () => {
      const result = await applyRefractoryWagonFleetImport({ wagons, inspections, entries: preview.entries, actor });
      if (result.created + result.updated > 0) {
        await audit.record({ actor: { ...actor, positionDisplayName: "Администратор" }, category: "administration", action: "data.import", targetType: "database_section", targetId: "refractory_wagons", summary: `Перенесён учёт вагонов на ${refractoryWagonFleetAsOfDate}: новых ${result.created}, дополнено ${result.updated}, в ремонте ${result.underRepair}.` });
      }
      console.log(JSON.stringify({ environment: config.appEnv, ...result }));
    });
    if (config.productionSnapshot.enabled) await runWithDatabaseMutationLock({ pool, lockName: testDatabaseMutationLockName, operation: apply });
    else await apply();
  } finally { await pool.end(); }
}

main().catch(() => {
  console.error("Перенос не выполнен. Проверьте предупреждения, применение миграций и доступность БД.");
  process.exitCode = 1;
});
