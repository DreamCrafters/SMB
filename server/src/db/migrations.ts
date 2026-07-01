import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "./pool.js";

type Migration = {
  id: string;
  statements: string[];
};

const migrations: Migration[] = [
  {
    id: "001_dispatcher_submissions_mysql",
    statements: [
      `
      create table if not exists dispatcher_submissions (
        id char(36) not null primary key,
        business_account_id varchar(120) not null,
        period varchar(7) not null,
        metric_code varchar(80) not null,
        raw_value text not null,
        comment text,
        form_id varchar(80) not null default 'equipment',
        payload json not null,
        summary text not null,
        status varchar(40) not null default 'received',
        submitted_by_account_id varchar(120) not null,
        submitted_at timestamp(3) not null default current_timestamp(3),
        received_at timestamp(3) not null default current_timestamp(3),
        key idx_dispatcher_submissions_received_at (received_at),
        key idx_dispatcher_submissions_business_received_at (
          business_account_id,
          received_at
        ),
        key idx_dispatcher_submissions_form_received_at (form_id, received_at)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
];

type MigrationRow = RowDataPacket & {
  id: string;
};

export async function runMigrations(pool: DatabasePool) {
  await pool.query(`
    create table if not exists schema_migrations (
      id varchar(120) not null primary key,
      applied_at timestamp(3) not null default current_timestamp(3)
    ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
  `);

  for (const migration of migrations) {
    const [applied] = await pool.query<MigrationRow[]>(
      "select id from schema_migrations where id = ?",
      [migration.id],
    );

    if (applied.length > 0) {
      continue;
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      for (const statement of migration.statements) {
        await connection.query(statement);
      }

      await connection.query("insert into schema_migrations (id) values (?)", [
        migration.id,
      ]);

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
