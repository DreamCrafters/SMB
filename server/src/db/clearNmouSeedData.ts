import { readServerConfig } from "../config/env.js";
import { createDatabasePool } from "./pool.js";
import { createDatabaseTransactionContext, runWithDatabaseMutationLock } from "./transactionContext.js";
import { testDatabaseMutationLockName } from "./productionSnapshot.js";
import { createAuditRepository } from "../repositories/auditRepository.js";
import { clearNmouSeedData, countNmouSeedData, formatNmouSeedCounts, NmouSeedCleanupRefusedError } from "./nmouSeedData.js";

/** Задача 147: a new organization's instance drops the NMOU data imported by early migrations. */
const actor = { userId: "system-server-console", accountId: "system-server-console", displayName: "Консоль сервера", positionDisplayName: "Новый экземпляр" };

async function main() {
  const config = readServerConfig();
  const pool = createDatabasePool(config.databaseUrl);
  const database = createDatabaseTransactionContext(pool);
  const audit = createAuditRepository(database.pool);
  try {
    if (!process.argv.includes("--apply")) {
      console.log(JSON.stringify({ environment: config.appEnv, wouldDelete: await countNmouSeedData(database.pool) }));
      return;
    }
    const apply = () => database.transaction.run(async () => {
      const deleted = await clearNmouSeedData(database.pool);
      // A repeated run deletes nothing and leaves the journal as it was.
      if (Object.values(deleted).some((total) => total > 0)) {
        await audit.record({
          actor, category: "administration", action: "data.clear", targetType: "database_section", targetId: "nmou_seed_data",
          summary: `Удалены данные НМОУ, внесённые миграциями: ${formatNmouSeedCounts(deleted)}.`,
        });
      }
      console.log(JSON.stringify({ environment: config.appEnv, deleted }));
    });
    if (config.productionSnapshot.enabled) await runWithDatabaseMutationLock({ pool, lockName: testDatabaseMutationLockName, operation: apply });
    else await apply();
  } finally { await pool.end(); }
}

main().catch((error: unknown) => {
  console.error(error instanceof NmouSeedCleanupRefusedError
    ? error.message
    : "Очистка не выполнена: проверьте применение миграций и доступность БД. Изменения откатились.");
  process.exitCode = 1;
});
