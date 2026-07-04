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
  {
    id: "002_equipment_submission_dedupe_key",
    statements: [
      `
      alter table dispatcher_submissions
        add column dedupe_key varchar(512) null after summary;
      `,
      `
      update dispatcher_submissions as submission
      join (
        select
          id,
          case
            when row_number() over (
              partition by
                business_account_id,
                json_unquote(json_extract(payload, '$.reportDate')),
                json_unquote(json_extract(payload, '$.equipment'))
              order by received_at desc, id desc
            ) = 1
            then concat(
              'equipment:',
              business_account_id,
              ':',
              json_unquote(json_extract(payload, '$.reportDate')),
              ':',
              json_unquote(json_extract(payload, '$.equipment'))
            )
            else null
          end as next_dedupe_key
        from dispatcher_submissions
        where form_id = 'equipment'
          and json_unquote(json_extract(payload, '$.reportDate')) is not null
          and json_unquote(json_extract(payload, '$.reportDate')) <> ''
          and json_unquote(json_extract(payload, '$.equipment')) is not null
          and json_unquote(json_extract(payload, '$.equipment')) <> ''
      ) as ranked on ranked.id = submission.id
      set submission.dedupe_key = ranked.next_dedupe_key;
      `,
      `
      alter table dispatcher_submissions
        add unique key uniq_dispatcher_submissions_dedupe_key (dedupe_key);
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
