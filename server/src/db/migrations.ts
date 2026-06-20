import type { PgPool } from "./pool.js";

type Migration = {
  id: string;
  sql: string;
};

const migrations: Migration[] = [
  {
    id: "001_dispatcher_submissions",
    sql: `
      create extension if not exists pgcrypto;

      create table if not exists dispatcher_submissions (
        id uuid primary key default gen_random_uuid(),
        business_account_id text not null,
        period text not null,
        metric_code text not null,
        raw_value text not null,
        comment text,
        status text not null default 'received',
        submitted_by_account_id text not null,
        submitted_at timestamptz not null default now(),
        received_at timestamptz not null default now()
      );

      create index if not exists idx_dispatcher_submissions_received_at
        on dispatcher_submissions (received_at desc);

      create index if not exists idx_dispatcher_submissions_business_received_at
        on dispatcher_submissions (business_account_id, received_at desc);
    `,
  },
  {
    id: "002_dispatcher_submission_forms",
    sql: `
      alter table dispatcher_submissions
        add column if not exists form_id text not null default 'equipment',
        add column if not exists payload jsonb not null default '{}'::jsonb,
        add column if not exists summary text not null default '';

      update dispatcher_submissions
      set
        payload = jsonb_build_object(
          'period', period,
          'metricCode', metric_code,
          'rawValue', raw_value,
          'comment', coalesce(comment, '')
        ),
        summary = coalesce(
          nullif(concat_ws(' · ', metric_code, raw_value), ''),
          'Запись без краткого описания'
        )
      where payload = '{}'::jsonb
        or summary = '';

      update dispatcher_submissions
      set summary = 'Запись без краткого описания'
      where summary = '';

      create index if not exists idx_dispatcher_submissions_form_received_at
        on dispatcher_submissions (form_id, received_at desc);
    `,
  },
];

export async function runMigrations(pool: PgPool) {
  await pool.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  for (const migration of migrations) {
    const applied = await pool.query<{ id: string }>(
      "select id from schema_migrations where id = $1",
      [migration.id],
    );

    if (applied.rowCount !== null && applied.rowCount > 0) {
      continue;
    }

    await pool.query("begin");

    try {
      await pool.query(migration.sql);
      await pool.query("insert into schema_migrations (id) values ($1)", [
        migration.id,
      ]);
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }
}
