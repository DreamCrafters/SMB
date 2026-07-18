import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "./pool.js";

export type DatabaseTransactionRunner = {
  run: <T>(operation: () => Promise<T>) => Promise<T>;
};

export async function runWithDatabaseMutationLock<T>({
  pool,
  lockName,
  operation,
  timeoutSeconds = 30,
}: {
  pool: DatabasePool;
  lockName: string;
  operation: () => Promise<T>;
  timeoutSeconds?: number;
}) {
  const connection = await pool.getConnection();
  let lockAcquired = false;

  try {
    await acquireMutationLock(connection, lockName, timeoutSeconds);
    lockAcquired = true;
    return await operation();
  } finally {
    try {
      if (lockAcquired) {
        await releaseMutationLock(connection, lockName);
      }
    } finally {
      connection.release();
    }
  }
}

export function createDatabaseTransactionContext(
  sourcePool: DatabasePool,
  options: {
    mutationLockName?: string;
    mutationLockTimeoutSeconds?: number;
  } = {},
): {
  pool: DatabasePool;
  transaction: DatabaseTransactionRunner;
} {
  const storage = new AsyncLocalStorage<PoolConnection>();
  const scopedConnectionBySource = new WeakMap<PoolConnection, PoolConnection>();
  const mutationLockName = options.mutationLockName;

  const pool = new Proxy(sourcePool, {
    get(target, property, receiver) {
      const connection = storage.getStore();

      if (connection === undefined) {
        if (property === "query" && mutationLockName !== undefined) {
          return async (...args: unknown[]) => {
            if (isReadOnlyQuery(args[0])) {
              return callQuery(target, args);
            }

            const guardedConnection = await target.getConnection();

            try {
              await acquireMutationLock(
                guardedConnection,
                mutationLockName,
                options.mutationLockTimeoutSeconds,
              );
              return await callQuery(guardedConnection, args);
            } finally {
              try {
                await releaseMutationLock(
                  guardedConnection,
                  mutationLockName,
                );
              } finally {
                guardedConnection.release();
              }
            }
          };
        }

        if (
          property === "getConnection" &&
          mutationLockName !== undefined
        ) {
          return async () => {
            const guardedConnection = await target.getConnection();

            try {
              await acquireMutationLock(
                guardedConnection,
                mutationLockName,
                options.mutationLockTimeoutSeconds,
              );
              return createMutationGuardedConnection(
                guardedConnection,
                mutationLockName,
              );
            } catch (error) {
              guardedConnection.release();
              throw error;
            }
          };
        }

        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      }

      if (property === "query") {
        return connection.query.bind(connection);
      }

      if (property === "getConnection") {
        return async () => readScopedConnection(connection);
      }

      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as DatabasePool;

  function readScopedConnection(connection: PoolConnection) {
    const existing = scopedConnectionBySource.get(connection);

    if (existing !== undefined) {
      return existing;
    }

    const scoped = new Proxy(connection, {
      get(target, property, receiver) {
        if (
          property === "beginTransaction" ||
          property === "commit" ||
          property === "rollback" ||
          property === "release"
        ) {
          return async () => undefined;
        }

        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as PoolConnection;

    scopedConnectionBySource.set(connection, scoped);
    return scoped;
  }

  return {
    pool,
    transaction: {
      async run(operation) {
        if (storage.getStore() !== undefined) {
          return operation();
        }

        const connection = await sourcePool.getConnection();
        let transactionStarted = false;
        let mutationLockAcquired = false;

        try {
          if (mutationLockName !== undefined) {
            await acquireMutationLock(
              connection,
              mutationLockName,
              options.mutationLockTimeoutSeconds,
            );
            mutationLockAcquired = true;
          }

          await connection.beginTransaction();
          transactionStarted = true;
          const result = await storage.run(connection, operation);
          await connection.commit();
          transactionStarted = false;
          return result;
        } catch (error) {
          if (transactionStarted) {
            await connection.rollback();
          }
          throw error;
        } finally {
          try {
            if (mutationLockAcquired && mutationLockName !== undefined) {
              await releaseMutationLock(connection, mutationLockName);
            }
          } finally {
            connection.release();
          }
        }
      },
    },
  };
}

function isReadOnlyQuery(input: unknown) {
  const sql = typeof input === "string"
    ? input
    : input !== null && typeof input === "object" && "sql" in input &&
        typeof input.sql === "string"
    ? input.sql
    : "";

  return /^\s*(?:select|show|describe|desc|explain)\b/iu.test(sql);
}

async function callQuery(target: DatabasePool | PoolConnection, args: unknown[]) {
  const query = target.query as unknown as (...values: unknown[]) => Promise<unknown>;
  return query.apply(target, args);
}

async function acquireMutationLock(
  connection: PoolConnection,
  lockName: string,
  timeoutSeconds = 30,
) {
  const [rows] = await connection.query<RowDataPacket[]>(
    "select get_lock(?, ?) as acquired",
    [lockName, timeoutSeconds],
  );

  if (Number(rows[0]?.acquired) !== 1) {
    throw new Error("Timed out while waiting for the test database mutation lock.");
  }
}

async function releaseMutationLock(
  connection: PoolConnection,
  lockName: string,
) {
  await connection.query("select release_lock(?)", [lockName]);
}

function createMutationGuardedConnection(
  connection: PoolConnection,
  lockName: string,
) {
  let released = false;

  return new Proxy(connection, {
    get(target, property, receiver) {
      if (property === "release") {
        return () => {
          if (released) {
            return;
          }

          released = true;
          void releaseMutationLock(target, lockName)
            .catch(() => undefined)
            .finally(() => target.release());
        };
      }

      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as PoolConnection;
}
