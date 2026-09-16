import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseCsvRows } from "../integrations/googleSheetsReference.js";
import { directorAssignmentSourceId, previewDirectorAssignmentImport } from "../integrations/directorAssignmentsImport.js";
import { readServerConfig } from "../config/env.js";
import { createDatabasePool } from "./pool.js";
import { createDatabaseTransactionContext, runWithDatabaseMutationLock } from "./transactionContext.js";
import { testDatabaseMutationLockName } from "./productionSnapshot.js";
import { createDirectorAssignmentsRepository } from "../repositories/directorAssignmentsRepository.js";
import { createAuditRepository } from "../repositories/auditRepository.js";

const executeFile = promisify(execFile);
async function readRows(id: string, gid: string, query: Record<string, string>) {
  const params = new URLSearchParams({ tqx: "out:csv", gid, ...query });
  const { stdout } = await executeFile("curl", ["--fail", "--silent", "--show-error", "--location", "--max-time", "30", `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${params}`], { maxBuffer: 4_000_000 });
  return parseCsvRows(stdout);
}

async function main() {
  const rows = await readRows(directorAssignmentSourceId, "0", { tq: "select A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S where C is not null limit 1000" });
  if (rows.length >= 1001) throw new Error("Import source limit reached.");
  const preview = previewDirectorAssignmentImport(rows, new Date().toISOString());
  console.log(JSON.stringify({ assignments: preview.records.length, completed: preview.records.filter(record => record.status === "completed").length, warnings: preview.warnings }, null, 2));
  if (!process.argv.includes("--apply")) return;
  if (preview.warnings.length && !process.argv.includes("--allow-incomplete")) {
    throw new Error("Unresolved source data requires --allow-incomplete after review.");
  }
  const config = readServerConfig();
  const pool = createDatabasePool(config.databaseUrl);
  const database = createDatabaseTransactionContext(pool);
  const repository = createDirectorAssignmentsRepository(database.pool);
  const audit = createAuditRepository(database.pool);
  try {
    const apply = () => database.transaction.run(async () => {
      let imported = 0;
      for (const record of preview.records) {
        if (await repository.read(record.id, true)) continue;
        await repository.create(record);
        if (record.status === "completed") await repository.addCompletion(record);
        imported++;
      }
      await audit.record({ actor: { userId: "system-task-113", accountId: "system-task-113", displayName: "Перенос поручений", positionDisplayName: "Администратор" }, category: "administration", action: "data.import", targetType: "database_section", targetId: "director_assignments", summary: `Перенесено поручений генерального директора: ${imported}.` });
      console.log(JSON.stringify({ environment: config.appEnv, imported, skipped: preview.records.length - imported }));
    });
    if (config.productionSnapshot.enabled) await runWithDatabaseMutationLock({ pool, lockName: testDatabaseMutationLockName, operation: apply });
    else await apply();
  } finally { await pool.end(); }
}

main().catch(() => {
  // Driver errors may contain SQL parameters; do not emit private source data.
  console.error("Перенос не выполнен. Проверьте предупреждения, параметры запуска, доступность источников и применение миграции 085.");
  process.exitCode = 1;
});
