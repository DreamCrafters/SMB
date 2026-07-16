import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolConnection } from "mysql2/promise";
import type { DatabasePool } from "./pool.js";

export type DatabaseTransactionRunner = {
  run: <T>(operation: () => Promise<T>) => Promise<T>;
};

export function createDatabaseTransactionContext(sourcePool: DatabasePool): {
  pool: DatabasePool;
  transaction: DatabaseTransactionRunner;
} {
  const storage = new AsyncLocalStorage<PoolConnection>();
  const scopedConnectionBySource = new WeakMap<PoolConnection, PoolConnection>();

  const pool = new Proxy(sourcePool, {
    get(target, property, receiver) {
      const connection = storage.getStore();

      if (connection === undefined) {
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

        try {
          await connection.beginTransaction();
          const result = await storage.run(connection, operation);
          await connection.commit();
          return result;
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      },
    },
  };
}
