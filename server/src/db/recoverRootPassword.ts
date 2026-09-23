import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";
import { readServerConfig } from "../config/env.js";
import { createDatabasePool } from "./pool.js";
import { createDatabaseTransactionContext } from "./transactionContext.js";
import { testDatabaseMutationLockName } from "./productionSnapshot.js";
import { createAccountsRepository } from "../repositories/accountsRepository.js";
import { createAuditRepository } from "../repositories/auditRepository.js";
import { recoverRootPassword } from "../domain/rootPasswordRecovery.js";

async function main() {
  if (process.argv.includes("--help")) {
    stdout.write("Восстановление пароля существующего корневого аккаунта через консоль сервера.\nЗапуск: npm --workspace server run auth:recover-root\nЛогин и новый пароль запрашиваются интерактивно. Старый пароль не нужен.\n");
    return;
  }
  if (process.argv.length > 2 || !stdin.isTTY || !stdout.isTTY) {
    throw new Error("Используйте интерактивную консоль без аргументов с паролем.");
  }
  // A terminal readline interface switches stdin to raw mode. Its output sink
  // suppresses both password echo and redraws; prompts go to stdout separately.
  const mutedOutput = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const prompt = createInterface({ input: stdin, output: mutedOutput, terminal: true, historySize: 0 });
  const abort = new AbortController();
  prompt.on("SIGINT", () => abort.abort());
  let login: string;
  let password: string;
  try {
    stdout.write("Логин корневого аккаунта (ввод скрыт): ");
    login = await prompt.question("", { signal: abort.signal });
    stdout.write("\nНовый пароль (ввод скрыт): ");
    password = await prompt.question("", { signal: abort.signal });
    stdout.write("\nПовторите новый пароль: ");
    const confirmation = await prompt.question("", { signal: abort.signal });
    if (password !== confirmation) throw new Error("Пароли не совпадают.");
  } finally {
    prompt.close();
    mutedOutput.end();
    stdout.write("\n");
  }
  const config = readServerConfig();
  const pool = createDatabasePool(config.databaseUrl);
  const database = createDatabaseTransactionContext(pool, config.productionSnapshot.enabled
    ? { mutationLockName: testDatabaseMutationLockName } : {});
  try {
    await recoverRootPassword({ login, password }, {
      accounts: createAccountsRepository(database.pool), audit: createAuditRepository(database.pool), transaction: database.transaction,
    });
    stdout.write("Пароль восстановлен. Прежние сессии отозваны. Аккаунт и его права сохранены.\n");
  } finally { await pool.end(); }
}

main().catch(() => {
  // Database errors can contain parameters; never print an exception or a password.
  console.error("Восстановление не выполнено. Проверьте ввод, активность корневого аккаунта, доступ к БД и применение миграции 087. Изменения операции откатываются при ошибке.");
  process.exitCode = 1;
});
