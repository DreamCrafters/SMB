import type { AccountsRepository, ResetPasswordInput } from "../repositories/accountsRepository.js";
import type { AuditRepository } from "../repositories/auditRepository.js";
import type { DatabaseTransactionRunner } from "../db/transactionContext.js";

/** Server-console authority only. This operation must never be exposed as an unauthenticated HTTP route. */
export async function recoverRootPassword(input: ResetPasswordInput, dependencies: {
  accounts: Pick<AccountsRepository, "recoverRootPassword">;
  audit: Pick<AuditRepository, "record">;
  transaction: DatabaseTransactionRunner;
}) {
  const login = input.login.trim();
  if (!login || login.length > 190 || input.password.length < 8 || input.password.length > 1024) {
    throw new Error("Укажите логин и пароль длиной от 8 до 1024 символов.");
  }
  await dependencies.transaction.run(async () => {
    const userId = await dependencies.accounts.recoverRootPassword({ login, password: input.password });
    if (userId === undefined) {
      throw new Error("Действующий корневой аккаунт не найден.");
    }
    await dependencies.audit.record({
      actor: { userId: "system-server-console", accountId: "system-server-console", displayName: "Консоль сервера", positionDisplayName: "Восстановление доступа" },
      category: "administration", action: "admin.account_password_reset",
      summary: "Пароль корневого администратора восстановлен через консоль сервера; прежние сессии отозваны.",
      targetType: "user_account", targetId: userId,
    });
  });
}
