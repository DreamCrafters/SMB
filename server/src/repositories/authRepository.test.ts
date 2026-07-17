import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { hashPassword } from "../domain/auth.js";
import { createAuthSessionService } from "./authRepository.js";

test("dispatcher login stores the 07:45 MSK session expiry", async () => {
  const passwordHash = await hashPassword("secret", "test-salt");
  let insertedExpiresAt: Date | undefined;
  const pool = {
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();

      if (normalized.startsWith("select users.id as user_id")) {
        return [[{
          user_id: "dispatcher-user",
          login: "dispatcher",
          user_display_name: "Диспетчер",
          user_status: "active",
          password_hash: passwordHash,
          access_id: "dispatcher-access",
          account_type: "dispatcher",
          position_code: "dispatcher",
          position_display_name: "Диспетчер",
          access_display_name: "Диспетчер",
          scope_kind: "organization",
          capabilities: JSON.stringify(["business.submit_dispatcher_forms"]),
          navigation_items: JSON.stringify(["business.dispatcher_form"]),
          access_created_at: "2026-07-01T00:00:00.000Z",
        }], []];
      }

      if (normalized.startsWith("insert into auth_sessions")) {
        insertedExpiresAt = params?.[3] as Date;
      }

      return [[], []];
    },
  } as unknown as DatabasePool;
  const service = createAuthSessionService(pool, {
    sessionTtlHours: 24,
    now: () => new Date("2026-07-15T04:40:00.000Z"),
  });

  const result = await service.login({ login: "dispatcher", password: "secret" });

  assert.equal(result.ok, true);
  assert.equal(insertedExpiresAt?.toISOString(), "2026-07-15T04:45:00.000Z");
});

test("readSession revokes a legacy dispatcher session after 07:45 MSK", async () => {
  let deletedSessionId: string | undefined;
  const pool = {
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();

      if (normalized.startsWith("select users.id as user_id")) {
        return [[{
          account_type: "dispatcher",
          session_created_at: "2026-07-14T12:00:00.000Z",
          session_expires_at: "2026-07-20T00:00:00.000Z",
        }], []];
      }

      if (normalized.startsWith("delete from auth_sessions")) {
        deletedSessionId = params?.[0] as string;
      }

      return [[], []];
    },
  } as unknown as DatabasePool;
  const service = createAuthSessionService(pool, {
    sessionTtlHours: 24,
    now: () => new Date("2026-07-15T04:45:00.000Z"),
  });

  const session = await service.readSession("legacy-dispatcher-session");

  assert.equal(session, undefined);
  assert.equal(deletedSessionId, "legacy-dispatcher-session");
});
