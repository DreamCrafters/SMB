import assert from "node:assert/strict";
import test from "node:test";
import { recoverRootPassword } from "./rootPasswordRecovery.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { createAccountsRepository } from "../repositories/accountsRepository.js";
import { createDatabaseTransactionContext } from "../db/transactionContext.js";
import type { DatabasePool } from "../db/pool.js";
import type { AuditEventDraft } from "./audit.js";

async function fixture({ root = true, status = "active", failAudit = false } = {}) {
  let credential = await hashPassword("forgotten-old-password");
  let sessions = ["previous-session"];
  let snapshot: { credential: string; sessions: string[] };
  const writes: string[] = [];
  const events: AuditEventDraft[] = [];
  const user = { id: "root-user", login: root ? "renamed-supervisor" : "admin", status, is_root_admin: root ? 1 : 0, is_admin_protected: root ? 1 : 0 };
  const connection = {
    async beginTransaction() { snapshot = { credential, sessions: [...sessions] }; },
    async commit() {},
    async rollback() { credential = snapshot.credential; sessions = snapshot.sessions; },
    release() {},
    async query(sql: string, parameters: unknown[] = []) {
      const normalized = sql.replace(/\s+/gu, " ").trim();
      if (normalized.startsWith("select users.id, users.status")) return [parameters[0] === user.login ? [user] : [], []];
      if (normalized.startsWith("select")) return [[], []];
      writes.push(normalized);
      if (normalized.startsWith("insert into auth_password_credentials")) credential = String(parameters[1]);
      else if (normalized.startsWith("delete from auth_sessions")) sessions = [];
      else throw new Error("Unexpected mutation");
      return [[], []];
    },
  };
  const source = { async getConnection() { return connection; } } as unknown as DatabasePool;
  const database = createDatabaseTransactionContext(source);
  const accounts = createAccountsRepository(database.pool);
  return {
    user, writes, events, accounts, credentials: () => credential, sessions: () => sessions,
    dependencies: { accounts, transaction: database.transaction, audit: { async record(event: AuditEventDraft) { if (failAudit) throw new Error("audit unavailable"); events.push(event); } } },
  };
}

test("server-console recovery accepts a renamed root without the old password and revokes all sessions", async () => {
  const state = await fixture();
  const before = structuredClone(state.user);
  await recoverRootPassword({ login: state.user.login, password: "new-recovery-password" }, state.dependencies);
  assert.equal(await verifyPassword("new-recovery-password", state.credentials()), true);
  assert.equal(await verifyPassword("forgotten-old-password", state.credentials()), false);
  assert.deepEqual(state.sessions(), []);
  assert.deepEqual(state.user, before);
  assert.equal(state.writes.length, 2);
  assert.equal(state.events[0]?.action, "admin.account_password_reset");
  assert.equal(state.events[0]?.targetId, state.user.id);
  assert.equal(state.events[0]?.actor.displayName, "Консоль сервера");
  assert.equal(JSON.stringify(state.events).includes("new-recovery-password"), false);
});

for (const options of [{ root: false }, { status: "archived" }, { status: "suspended" }]) {
  test(`recovery rejects ${JSON.stringify(options)} without creating accounts or granting access`, async () => {
    const state = await fixture(options);
    const before = state.credentials();
    await assert.rejects(recoverRootPassword({ login: state.user.login, password: "new-recovery-password" }, state.dependencies), /не найден/u);
    assert.equal(state.credentials(), before);
    assert.deepEqual(state.sessions(), ["previous-session"]);
    assert.deepEqual(state.writes, []);
    assert.deepEqual(state.events, []);
  });
}

test("failed recovery audit rolls back both the new password and session revocation", async () => {
  const state = await fixture({ failAudit: true });
  const before = state.credentials();
  await assert.rejects(recoverRootPassword({ login: state.user.login, password: "new-recovery-password" }, state.dependencies), /audit/u);
  assert.equal(state.credentials(), before);
  assert.deepEqual(state.sessions(), ["previous-session"]);
});

test("recovery validates input before touching storage and rejects missing accounts", async () => {
  const state = await fixture();
  for (const input of [{ login: "", password: "new-recovery-password" }, { login: state.user.login, password: "short" }, { login: state.user.login, password: "a".repeat(1025) }]) {
    await assert.rejects(recoverRootPassword(input, state.dependencies), /от 8 до 1024/u);
  }
  await assert.rejects(recoverRootPassword({ login: "absent", password: "new-recovery-password" }, state.dependencies), /не найден/u);
  assert.deepEqual(state.writes, []);
});


test("recovery accepts a root renamed to the maximum login length supported by the database editor", async () => {
  const state = await fixture();
  state.user.login = "r".repeat(190);
  await recoverRootPassword({ login: state.user.login, password: "new-recovery-password" }, state.dependencies);
  assert.equal(await verifyPassword("new-recovery-password", state.credentials()), true);
  assert.equal(state.events[0]?.targetId, state.user.id);
});
