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
  {
    id: "003_equipment_report_revisions",
    statements: [
      `
      create table if not exists dispatcher_equipment_report_revisions (
        id char(36) not null primary key,
        business_account_id varchar(120) not null,
        report_date varchar(20) not null,
        revision_status varchar(40) not null,
        payload json not null,
        submitted_by_account_id varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_equipment_report_revisions_business_date (
          business_account_id,
          report_date,
          created_at
        )
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "004_auth_users_sessions_accesses",
    statements: [
      `
      create table if not exists business_accounts (
        id varchar(120) not null primary key,
        display_name varchar(255) not null,
        status varchar(40) not null default 'active',
        created_at timestamp(3) not null default current_timestamp(3),
        updated_at timestamp(3) not null default current_timestamp(3)
          on update current_timestamp(3)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists departments (
        id varchar(120) not null primary key,
        business_account_id varchar(120) not null,
        display_name varchar(255) not null,
        structure_mode varchar(40) not null default 'current',
        parent_department_id varchar(120) null,
        created_at timestamp(3) not null default current_timestamp(3),
        updated_at timestamp(3) not null default current_timestamp(3)
          on update current_timestamp(3),
        key idx_departments_business (business_account_id)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists app_users (
        id char(36) not null primary key,
        login varchar(190) not null,
        display_name varchar(255) not null,
        status varchar(40) not null default 'active',
        created_at timestamp(3) not null default current_timestamp(3),
        updated_at timestamp(3) not null default current_timestamp(3)
          on update current_timestamp(3),
        unique key uniq_app_users_login (login)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists auth_password_credentials (
        user_id char(36) not null primary key,
        password_hash varchar(512) not null,
        password_updated_at timestamp(3) not null default current_timestamp(3)
          on update current_timestamp(3)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists account_accesses (
        id char(36) not null primary key,
        user_id char(36) not null,
        account_type varchar(40) not null,
        display_name varchar(255) not null,
        scope_kind varchar(40) not null,
        business_account_id varchar(120) null,
        department_id varchar(120) null,
        capabilities json not null,
        is_active tinyint(1) not null default 1,
        created_at timestamp(3) not null default current_timestamp(3),
        updated_at timestamp(3) not null default current_timestamp(3)
          on update current_timestamp(3),
        key idx_account_accesses_user (user_id),
        key idx_account_accesses_scope (
          scope_kind,
          business_account_id,
          department_id
        )
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists auth_sessions (
        id char(64) not null primary key,
        user_id char(36) not null,
        access_id char(36) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        last_seen_at timestamp(3) null,
        expires_at timestamp(3) not null,
        key idx_auth_sessions_user (user_id),
        key idx_auth_sessions_expires_at (expires_at)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "005_account_positions_and_navigation",
    statements: [
      `
      alter table account_accesses
        add column position_code varchar(60) null after account_type,
        add column navigation_items json null after capabilities;
      `,
      `
      update account_accesses
      set position_code = case account_type
        when 'admin' then 'administrator'
        when 'business_owner' then 'business_owner'
        when 'dispatcher' then 'dispatcher'
        else 'worker'
      end,
      navigation_items = case account_type
        when 'admin' then json_array(
          'admin.account_preview', 'admin.accounts', 'admin.database'
        )
        when 'business_owner' then json_array(
          'business.overview', 'business.dispatcher'
        )
        when 'dispatcher' then json_array('business.dispatcher_form')
        else json_array('business.work')
      end
      where position_code is null or navigation_items is null;
      `,
      `
      alter table account_accesses
        modify position_code varchar(60) not null,
        modify navigation_items json not null;
      `,
    ],
  },
  {
    id: "006_account_access_levels",
    statements: [
      `
      create table if not exists account_access_levels (
        id varchar(120) not null primary key,
        display_name varchar(255) not null,
        position_code varchar(60) not null,
        account_type varchar(40) not null,
        navigation_items json not null,
        capabilities json not null,
        is_system tinyint(1) not null default 0,
        created_at timestamp(3) not null default current_timestamp(3),
        updated_at timestamp(3) not null default current_timestamp(3)
          on update current_timestamp(3),
        unique key uniq_access_level_position_name (position_code, display_name)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      insert into account_access_levels (
        id, display_name, position_code, account_type,
        navigation_items, capabilities, is_system
      ) values
        ('system-administrator', 'Полный доступ', 'administrator', 'admin',
          json_array('admin.account_preview', 'admin.accounts', 'admin.database'),
          json_array(
            'platform.manage_business_accounts', 'business.view_all_statistics',
            'business.view_department_statistics', 'business.view_notifications',
            'business.submit_forms', 'business.submit_dispatcher_forms',
            'business.view_dispatcher_feed', 'business.view_own_submissions',
            'platform.manage_users', 'platform.manage_access',
            'platform.manage_analytics_database'
          ), 1),
        ('system-business-owner', 'Полный доступ', 'business_owner', 'business_owner',
          json_array('business.overview', 'business.dispatcher'),
          json_array(
            'business.view_all_statistics', 'business.view_department_statistics',
            'business.view_notifications', 'business.view_dispatcher_feed'
          ), 1),
        ('system-board-chair', 'Полный доступ', 'board_chair', 'business_owner',
          json_array('business.overview', 'business.dispatcher'),
          json_array(
            'business.view_all_statistics', 'business.view_department_statistics',
            'business.view_notifications', 'business.view_dispatcher_feed'
          ), 1),
        ('system-board-member', 'Полный доступ', 'board_member', 'business_owner',
          json_array('business.overview', 'business.dispatcher'),
          json_array(
            'business.view_all_statistics', 'business.view_department_statistics',
            'business.view_notifications', 'business.view_dispatcher_feed'
          ), 1),
        ('system-general-director', 'Полный доступ', 'general_director', 'business_owner',
          json_array('business.overview', 'business.dispatcher'),
          json_array(
            'business.view_all_statistics', 'business.view_department_statistics',
            'business.view_notifications', 'business.view_dispatcher_feed'
          ), 1),
        ('system-worker', 'Полный доступ', 'worker', 'worker',
          json_array('business.work'),
          json_array(
            'business.submit_forms', 'business.view_notifications',
            'business.view_own_submissions'
          ), 1),
        ('system-dispatcher', 'Полный доступ', 'dispatcher', 'dispatcher',
          json_array('business.dispatcher_form'),
          json_array(
            'business.submit_dispatcher_forms', 'business.view_dispatcher_feed'
          ), 1)
      on duplicate key update id = values(id);
      `,
      `
      alter table account_accesses
        add column access_level_id varchar(120) null after navigation_items,
        add key idx_account_accesses_access_level (access_level_id);
      `,
    ],
  },
  {
    id: "007_expand_non_admin_access_catalog",
    statements: [
      `
      update account_access_levels
      set navigation_items = json_array(
        'business.overview', 'business.dispatcher',
        'business.work', 'business.dispatcher_form'
      ),
      capabilities = json_array(
        'business.view_all_statistics', 'business.view_department_statistics',
        'business.view_notifications', 'business.view_dispatcher_feed',
        'business.submit_forms', 'business.view_own_submissions',
        'business.submit_dispatcher_forms'
      )
      where is_system = 1 and account_type <> 'admin';
      `,
      `
      update account_accesses accesses
      join account_access_levels levels on levels.id = accesses.access_level_id
      set accesses.navigation_items = levels.navigation_items,
        accesses.capabilities = levels.capabilities
      where levels.is_system = 1 and levels.account_type <> 'admin';
      `,
    ],
  },
  {
    id: "008_remove_system_full_access_levels",
    statements: [
      `
      update account_accesses accesses
      join account_access_levels levels on levels.id = accesses.access_level_id
      set accesses.access_level_id = null
      where levels.is_system = 1;
      `,
      `
      delete from account_access_levels
      where is_system = 1;
      `,
    ],
  },
  {
    id: "009_remove_account_access_levels",
    statements: [
      `
      update account_accesses
      set access_level_id = null
      where access_level_id is not null;
      `,
      `
      alter table account_accesses
        drop index idx_account_accesses_access_level;
      `,
      `
      alter table account_accesses
        drop column access_level_id;
      `,
      `
      drop table if exists account_access_levels;
      `,
    ],
  },
  {
    id: "010_dynamic_account_positions",
    statements: [
      `
      alter table account_accesses
        modify position_code varchar(120) not null;
      `,
      `
      create table if not exists account_positions (
        id varchar(120) not null primary key,
        display_name varchar(255) not null,
        account_type varchar(40) not null,
        navigation_items json not null,
        capabilities json not null,
        is_protected tinyint(1) not null default 0,
        created_at timestamp(3) not null default current_timestamp(3),
        updated_at timestamp(3) not null default current_timestamp(3)
          on update current_timestamp(3),
        unique key uniq_account_positions_name (display_name)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      insert into account_positions (
        id, display_name, account_type, navigation_items, capabilities, is_protected
      ) values
        ('administrator', 'Администратор', 'admin',
          json_array('admin.account_preview', 'admin.accounts', 'admin.database'),
          json_array(
            'platform.manage_business_accounts', 'platform.manage_users',
            'platform.manage_access', 'platform.manage_analytics_database',
            'business.view_all_statistics', 'business.view_department_statistics',
            'business.view_notifications', 'business.submit_forms',
            'business.submit_dispatcher_forms', 'business.view_dispatcher_feed',
            'business.view_own_submissions'
          ), 1),
        ('business_owner', 'Владелец бизнеса', 'business_owner',
          json_array('business.overview', 'business.dispatcher', 'business.work'),
          json_array('business.view_all_statistics', 'business.view_department_statistics', 'business.view_notifications', 'business.view_dispatcher_feed', 'business.submit_forms', 'business.view_own_submissions'), 0),
        ('board_chair', 'Председатель совета директоров', 'business_owner',
          json_array('business.overview', 'business.dispatcher', 'business.work'),
          json_array('business.view_all_statistics', 'business.view_department_statistics', 'business.view_notifications', 'business.view_dispatcher_feed', 'business.submit_forms', 'business.view_own_submissions'), 0),
        ('board_member', 'Член совета директоров', 'business_owner',
          json_array('business.overview', 'business.dispatcher', 'business.work'),
          json_array('business.view_all_statistics', 'business.view_department_statistics', 'business.view_notifications', 'business.view_dispatcher_feed', 'business.submit_forms', 'business.view_own_submissions'), 0),
        ('general_director', 'Генеральный директор', 'business_owner',
          json_array('business.overview', 'business.dispatcher', 'business.work'),
          json_array('business.view_all_statistics', 'business.view_department_statistics', 'business.view_notifications', 'business.view_dispatcher_feed', 'business.submit_forms', 'business.view_own_submissions'), 0),
        ('worker', 'Работник', 'worker',
          json_array(), json_array(), 0),
        ('dispatcher', 'Диспетчер', 'dispatcher',
          json_array('business.dispatcher_form'),
          json_array('business.submit_dispatcher_forms', 'business.view_dispatcher_feed'), 0)
      on duplicate key update id = values(id);
      `,
    ],
  },
  {
    id: "011_empty_worker_workspace",
    statements: [
      `
      update account_positions
      set navigation_items = json_array(),
          capabilities = json_array()
      where account_type = 'worker';
      `,
    ],
  },
  {
    id: "012_split_manager_dispatcher_access",
    statements: [
      `
      update account_positions
      set navigation_items = case
            when json_contains(navigation_items, json_quote('business.dispatcher_form'))
              then json_remove(
                navigation_items,
                json_unquote(json_search(navigation_items, 'one', 'business.dispatcher_form'))
              )
            else navigation_items
          end,
          capabilities = case
            when json_contains(capabilities, json_quote('business.submit_dispatcher_forms'))
              then json_remove(
                capabilities,
                json_unquote(json_search(capabilities, 'one', 'business.submit_dispatcher_forms'))
              )
            else capabilities
          end
      where account_type = 'business_owner';
      `,
      `
      update account_positions
      set navigation_items = json_array('business.dispatcher_form'),
          capabilities = json_array(
            'business.submit_dispatcher_forms',
            'business.view_dispatcher_feed'
          )
      where account_type = 'dispatcher';
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
