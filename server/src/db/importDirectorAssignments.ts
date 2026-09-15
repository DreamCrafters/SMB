import { readDirectorAssignmentAccess } from "../contracts/directorAssignments.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseCsvRows } from "../integrations/googleSheetsReference.js";
import { directorAssignmentSourceId, previewDirectorAssignmentImport } from "../integrations/directorAssignmentsImport.js";
import { readServerConfig } from "../config/env.js";
import { createDatabasePool } from "./pool.js";
import { createDatabaseTransactionContext, runWithDatabaseMutationLock } from "./transactionContext.js";
import { testDatabaseMutationLockName } from "./productionSnapshot.js";
import { createDirectorAssignmentsRepository } from "../repositories/directorAssignmentsRepository.js";
import { createAccountsRepository } from "../repositories/accountsRepository.js";
import { createAuditRepository } from "../repositories/auditRepository.js";
import { resolveCapabilitiesForPosition } from "../domain/accountAccessConfiguration.js";

const executeFile = promisify(execFile);
const referenceId = "1JYz_03AW4j9VXNfdNSBFfdFyxq0Dun_0QnYGvVesGyg";
async function readRows(id: string, gid: string, query: Record<string, string>) {
  const params = new URLSearchParams({ tqx: "out:csv", gid, ...query });
  const { stdout } = await executeFile("curl", ["--fail", "--silent", "--show-error", "--location", "--max-time", "30", `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${params}`], { maxBuffer: 4_000_000 });
  return parseCsvRows(stdout);
}

async function main() {
  const [rows, people] = await Promise.all([
    readRows(directorAssignmentSourceId, "0", { tq: "select A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S where C is not null limit 1000" }),
    readRows(directorAssignmentSourceId, "1655557103", { range: "B1:D1000" }),
  ]);
  if (rows.length >= 1001 || people.length >= 1000) throw new Error("Import source limit reached.");
  const preview = previewDirectorAssignmentImport(rows, people, new Date().toISOString());
  console.log(JSON.stringify({ assignments: preview.records.length, completed: preview.records.filter(record => record.status === "completed").length, personnel: preview.employees.length, warnings: preview.warnings }, null, 2));
  if (!process.argv.includes("--apply")) return;
  if (preview.warnings.length && !process.argv.includes("--allow-incomplete")) {
    throw new Error("Unresolved source data requires --allow-incomplete after review.");
  }
  const config = readServerConfig();
  const pool = createDatabasePool(config.databaseUrl);
  const database = createDatabaseTransactionContext(pool);
  const repository = createDirectorAssignmentsRepository(database.pool);
  const accounts = createAccountsRepository(database.pool);
  const audit = createAuditRepository(database.pool);
  // Credentials stay in memory and are never printed, written to assets, or included in audit.
  const credentials = await readRows(referenceId, "2084585512", { range: "A47:D48", headers: "0" });
  if (credentials.length !== 2 || credentials.some(row => row.length !== 4 || row.some(value => !value.trim()))) throw new Error("Personnel account source is incomplete.");
  try {
    const apply = () => database.transaction.run(async () => {
      for (const employee of preview.employees) {
        if (!await repository.readEmployee(employee.id, true)) await repository.saveEmployee(employee, true);
      }
      let imported = 0;
      for (const record of preview.records) {
        if (await repository.read(record.id, true)) continue;
        await repository.create(record);
        if (record.status === "completed") await repository.addCompletion(record);
        imported++;
      }
      const positions = await accounts.listPositions();
      const existingAccounts = await accounts.listAccounts();
      for (const [displayName, positionName, login, password] of credentials) {
        let position = positions.find(item => item.displayName === positionName);
        if (!position) {
          position = await accounts.createPosition({ displayName: positionName, navigationItems: ["business.personnel"], capabilities: ["business.manage_personnel"] });
          positions.push(position);
        } else if (!position.navigationItems.includes("business.personnel")) {
          const navigationItems = [...new Set([...position.navigationItems, "business.personnel" as const])];
          position = await accounts.updatePosition({ id: position.id, displayName: position.displayName, navigationItems,
            capabilities: resolveCapabilitiesForPosition(position.id, navigationItems, position.boardAssignmentAccess, position.hasAdminRights, position.showOverviewVisitors, position.capabilities.includes("business.review_raw_material_warehouse"), position.railwayWagonAccess, readDirectorAssignmentAccess(position.capabilities, position.navigationItems)),
          }, true) ?? position;
        }
        if (!existingAccounts.some(account => account.login.toLocaleLowerCase("ru-RU") === login.toLocaleLowerCase("ru-RU"))) {
          await accounts.createAccount({ login, password, displayName, accountType: position.accountType, position: position.id, navigationItems: position.navigationItems, capabilities: position.capabilities });
        }
      }
      await audit.record({ actor: { userId: "system-task-113", accountId: "system-task-113", displayName: "Перенос поручений", positionDisplayName: "Администратор" }, category: "administration", action: "data.import", targetType: "database_section", targetId: "director_assignments", summary: `Перенесено поручений генерального директора: ${imported}. Настроены кадровые должности и аккаунты.` });
      console.log(JSON.stringify({ environment: config.appEnv, imported, skipped: preview.records.length - imported }));
    });
    if (config.productionSnapshot.enabled) await runWithDatabaseMutationLock({ pool, lockName: testDatabaseMutationLockName, operation: apply });
    else await apply();
  } finally { await pool.end(); }
}

main().catch(() => {
  // Driver errors may contain SQL parameters; never emit them from a provisioning command.
  console.error("Перенос не выполнен. Проверьте предупреждения, параметры запуска, доступность источников и применение миграции 085.");
  process.exitCode = 1;
});
