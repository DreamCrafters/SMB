import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "./pool.js";

export type DatabaseTransactionRunner = {
  run: <T>(operation: () => Promise<T>) => Promise<T>;
};

type LocalMutationLockQueue = {
  locked: boolean;
  waiters: LocalMutationLockWaiter[];
};

type LocalMutationLockWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
};

const localMutationLockQueues = new WeakMap<
  DatabasePool,
  Map<string, LocalMutationLockQueue>
>();

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

export async function acquireDatabaseMutationLock({
  pool,
  lockName,
  timeoutSeconds = 30,
  signal,
}: {
  pool: DatabasePool;
  lockName: string;
  timeoutSeconds?: number;
  signal?: AbortSignal;
}) {
  const releaseLocalLock = await acquireLocalMutationLock(
    pool,
    lockName,
    signal,
  );
  let connection: PoolConnection | undefined;
  const abortPendingConnection = () => {
    connection?.destroy();
  };

  try {
    throwIfMutationLockAborted(signal);
    connection = await pool.getConnection();
    throwIfMutationLockAborted(signal);
    signal?.addEventListener("abort", abortPendingConnection, { once: true });
    await acquireMutationLock(connection, lockName, timeoutSeconds);
    throwIfMutationLockAborted(signal);
  } catch (error) {
    signal?.removeEventListener("abort", abortPendingConnection);
    if (signal?.aborted) {
      connection?.destroy();
    } else {
      connection?.release();
    }
    releaseLocalLock();
    if (signal?.aborted) throw createMutationLockAbortError();
    throw error;
  }
  signal?.removeEventListener("abort", abortPendingConnection);
  const lockedConnection = connection;

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await releaseMutationLock(lockedConnection, lockName);
    } finally {
      try {
        lockedConnection.release();
      } finally {
        releaseLocalLock();
      }
    }
  };
}

async function acquireLocalMutationLock(
  pool: DatabasePool,
  lockName: string,
  signal?: AbortSignal,
) {
  throwIfMutationLockAborted(signal);
  let queues = localMutationLockQueues.get(pool);
  if (queues === undefined) {
    queues = new Map();
    localMutationLockQueues.set(pool, queues);
  }
  let queue = queues.get(lockName);
  if (queue === undefined) {
    queue = { locked: false, waiters: [] };
    queues.set(lockName, queue);
  }
  if (queue.locked) {
    let abortWaiter: (() => void) | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        const waiter: LocalMutationLockWaiter = { resolve, reject };
        abortWaiter = () => {
          const index = queue!.waiters.indexOf(waiter);
          if (index >= 0) queue!.waiters.splice(index, 1);
          reject(createMutationLockAbortError());
        };
        queue!.waiters.push(waiter);
        signal?.addEventListener("abort", abortWaiter, { once: true });
        if (signal?.aborted) abortWaiter();
      });
    } finally {
      if (abortWaiter !== undefined) {
        signal?.removeEventListener("abort", abortWaiter);
      }
    }
  } else {
    queue.locked = true;
  }
  if (signal?.aborted) {
    const next = queue.waiters.shift();
    if (next === undefined) {
      queue.locked = false;
      queues.delete(lockName);
      if (queues.size === 0) localMutationLockQueues.delete(pool);
    } else {
      next.resolve();
    }
    throw createMutationLockAbortError();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = queue!.waiters.shift();
    if (next !== undefined) {
      next.resolve();
      return;
    }
    queue!.locked = false;
    queues!.delete(lockName);
    if (queues!.size === 0) localMutationLockQueues.delete(pool);
  };
}

function throwIfMutationLockAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createMutationLockAbortError();
}

function createMutationLockAbortError() {
  const error = new Error("Database mutation lock request was aborted.");
  error.name = "AbortError";
  return error;
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
