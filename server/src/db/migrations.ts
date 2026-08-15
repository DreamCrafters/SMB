import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "./pool.js";

type Migration = {
  id: string;
  statements: string[];
};

/**
 * One-time snapshot of `Номенклатура!A2:A` read on 2026-08-07 for task 65.
 * Runtime brand reads no longer depend on Google Sheets after this migration.
 */
export const initialProductBrandNames = [
  "Пропант",
  "Пропант алюмосиликатный (обжиг + затарка) ф 12/18, т",
  "Пропант неконд",
  "ГАС-порошок",
  "Глина молотая ПГА",
  "Глина молотая ПГБ, т",
  "Мертель МШ-28 (подряд) ШГР-28, т",
  "Мертель МШ-28 (ШГР-28), т",
  "Мертель МШ-31 (подряд) ШГР-28, т",
  "Мертель МШ-32\\2 (фасовка 25 кг), т",
  "Мертель МШ-36 (подряд) ШГР-28, т",
  "ММЛ-65",
  "МШ-32\\2",
  "Огнеупорная смесь (фасовка 25 кг) т, т",
  "Огнеупорная смесь (фасовка 25 кг), шт",
  "Пыль ШБКТ, т",
  "Шамот молотый ПШБМ, т",
  "ШБКТ",
  "ШБО-69",
  "ШКИ",
  "ШКИ-66",
  "ШКИ-69",
  "МЛС 62 №5 (вес 1.29), т",
  "ТР-50, ША-101",
  "Ш-5",
  "Ш-8",
  "ША-10",
  "ША-100 (вес 0,95), т",
  "ША-101 (вес 0,84), т",
  "ША-102, т",
  "ША-12",
  "ША-14 (вес 1,12), т",
  "ША-15",
  "ША-17 (вес 1,28), т",
  "ША-19 А, т",
  "ША-21 (вес 1,45), т",
  "ША-22",
  "ША-23",
  "ША-25",
  "ША-27 (вес 1,25), т",
  "ША-29 (вес 1,16), т",
  "ША-33 (вес 1,37), т",
  "ША-34 (вес 1,18), т",
  "ША-35",
  "ША-4",
  "ША-44",
  "ША-45",
  "ША-47",
  "ША-49 (вес 1,36), т",
  "ША-5",
  "ША-50 (вес 1,37), т",
  "ША-52",
  "ША-6",
  "ША-60 (вес 1,41), т",
  "ША-68 (вес 1,44), т",
  "ША-7 (вес 1,28), т",
  "ША-70, т",
  "ША-8",
  "ША-82",
  "ША-84",
  "ША-86",
  "ША-87",
  "ША-9",
  "ША-94",
  "ШАК-5",
  "ШБ-10 (вес 1,31), т",
  "ШБ-22",
  "ШБ-23",
  "ШБ-25",
  "ШБ-4 (вес 1,29), т",
  "ШБ-44",
  "ШБ-45",
  "ШБ-47",
  "ШБ-49 (вес 1,36), т",
  "ШБ-5",
  "ШБ-5 класс 4",
  "ШБ-52",
  "ШБ-6 (вес 1,24), т",
  "ШБ-68 (вес 1,4), т",
  "ШБ-7 (вес 1,24), т",
  "ШБ-8",
  "ШБ-8 класс 4",
  "ШБ-9",
  "ШБ-94, т",
  "ШВГ-35/1",
  "ШВГ-35/2",
  "ШВГ-35/3",
  "ШЛ-1,3 № 5, т",
  "ШТ-1,3 № 5",
  "ШЦУ-1 (вес 1,36), т",
  "ШЦУ-1 (по ТУ1508), т",
  "ШЦУ-14 (вес 1,35), т",
  "ШЦУ-15 (вес 1,39), т",
  "ШЦУ-17 (вес 1,48), т",
  "ШЦУ-2 (вес 1,20), т",
  "ШЦУ-2 (по ТУ1508), т",
  "ШЦУ-20 (вес 1,28), т",
  "ШЦУ-3",
  "ШЦУ-3 (по ТУ1508), т",
  "ШЦУ-4",
  "ШЦУ-4 (по ТУ1508)",
  "ШЦУ-5",
  "ШЦУ-5 (по ТУ1508)",
  "ШЦУ-9 (вес 1,42), т",
  "ГМГ-2, т",
  "ЗША-4 кл (0-5), т",
  "ЗША-5 кл (0-3), т",
  "ЗШБ 4 кл., т",
  "ЗШБ 5 кл., т",
  "ПК-5, т",
  "ПК-8, т",
  "ПМВ-69 - 3 мм, т",
  "СШБЖ-35, т",
  "СШБЖ-60, т",
  "шб-5б\\к",
  "ШГР-28",
  "ШГР-К",
  "ШБ-8 б.к.",
  "ШТ-1.3 √5",
] as const;

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
  {
    id: "013_protect_used_account_positions",
    statements: [
      `
      alter table account_accesses
        add constraint fk_account_accesses_position
        foreign key (position_code) references account_positions(id)
        on update restrict on delete restrict;
      `,
    ],
  },
  {
    id: "014_dispatcher_spreadsheet_import_source",
    statements: [
      `
      alter table dispatcher_submissions
        add column import_source_key varchar(512) null after dedupe_key,
        add unique key uniq_dispatcher_submissions_import_source (
          import_source_key
        );
      `,
    ],
  },
  {
    id: "015_user_audit_events",
    statements: [
      `
      create table if not exists user_audit_events (
        id char(36) not null primary key,
        actor_user_id varchar(120) not null,
        actor_account_id varchar(120) not null,
        actor_login varchar(190) null,
        actor_display_name varchar(255) not null,
        actor_position_display_name varchar(255) not null,
        category varchar(40) not null,
        action varchar(80) not null,
        outcome varchar(20) not null default 'success',
        summary varchar(500) not null,
        details json not null,
        business_account_id varchar(120) null,
        target_type varchar(80) null,
        target_id varchar(190) null,
        occurred_at timestamp(3) not null default current_timestamp(3),
        key idx_user_audit_occurred (occurred_at),
        key idx_user_audit_actor_occurred (actor_account_id, occurred_at),
        key idx_user_audit_category_occurred (category, occurred_at)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      update account_positions
      set navigation_items = case
            when json_contains(navigation_items, json_quote('admin.user_actions'))
              then navigation_items
            else json_array_append(navigation_items, '$', 'admin.user_actions')
          end,
          capabilities = case
            when json_contains(capabilities, json_quote('platform.view_audit'))
              then capabilities
            else json_array_append(capabilities, '$', 'platform.view_audit')
          end
      where id = 'administrator';
      `,
    ],
  },
  {
    id: "016_remove_departments",
    statements: [
      `
      update account_accesses
      set is_active = case
            when business_account_id is null then 0
            else is_active
          end,
          scope_kind = 'business',
          department_id = null
      where scope_kind = 'department'
        or department_id is not null;
      `,
      `
      update account_positions
      set capabilities = json_remove(
        capabilities,
        json_unquote(
          json_search(capabilities, 'one', 'business.view_department_statistics')
        )
      )
      where json_contains(
        capabilities,
        json_quote('business.view_department_statistics')
      );
      `,
      `
      update account_accesses
      set capabilities = json_remove(
        capabilities,
        json_unquote(
          json_search(capabilities, 'one', 'business.view_department_statistics')
        )
      )
      where json_contains(
        capabilities,
        json_quote('business.view_department_statistics')
      );
      `,
      `
      alter table account_accesses
        drop index idx_account_accesses_scope,
        add key idx_account_accesses_scope (
          scope_kind,
          business_account_id
        );
      `,
      `
      alter table account_accesses
        drop column department_id;
      `,
      `
      drop table if exists departments;
      `,
    ],
  },
  {
    id: "017_single_organization_scope",
    statements: [
      `
      alter table dispatcher_submissions
        drop index uniq_dispatcher_submissions_dedupe_key;
      `,
      `
      update dispatcher_submissions as submissions
      join (
        select
          id,
          case
            when row_number() over (
              partition by candidate_key
              order by received_at desc, id desc
            ) = 1 then candidate_key
            else null
          end as next_dedupe_key
        from (
          select
            id,
            received_at,
            case
              when form_id = 'equipment'
                and json_unquote(json_extract(payload, '$.reportDate')) is not null
                and json_unquote(json_extract(payload, '$.reportDate')) <> ''
                and json_unquote(json_extract(payload, '$.equipment')) is not null
                and json_unquote(json_extract(payload, '$.equipment')) <> ''
              then concat(
                'equipment:',
                json_unquote(json_extract(payload, '$.reportDate')),
                ':',
                json_unquote(json_extract(payload, '$.equipment'))
              )
              when dedupe_key like 'dispatcher:%'
              then concat('dispatcher:', substring_index(dedupe_key, ':', -2))
              else null
            end as candidate_key
          from dispatcher_submissions
          where dedupe_key is not null
        ) as candidates
        where candidate_key is not null
      ) as ranked on ranked.id = submissions.id
      set submissions.dedupe_key = ranked.next_dedupe_key;
      `,
      `
      alter table dispatcher_submissions
        add unique key uniq_dispatcher_submissions_dedupe_key (dedupe_key);
      `,
      `
      alter table dispatcher_submissions
        drop index uniq_dispatcher_submissions_import_source;
      `,
      `
      update dispatcher_submissions as submissions
      join (
        select
          id,
          case
            when row_number() over (
              partition by candidate_key
              order by received_at desc, id desc
            ) = 1 then candidate_key
            else null
          end as next_import_source_key
        from (
          select
            id,
            received_at,
            substring(
              import_source_key,
              locate(':', import_source_key) + 1
            ) as candidate_key
          from dispatcher_submissions
          where import_source_key is not null
            and locate(':', import_source_key) > 0
        ) as candidates
      ) as ranked on ranked.id = submissions.id
      set submissions.import_source_key = ranked.next_import_source_key;
      `,
      `
      alter table dispatcher_submissions
        add unique key uniq_dispatcher_submissions_import_source (
          import_source_key
        ),
        drop index idx_dispatcher_submissions_business_received_at,
        drop column business_account_id;
      `,
      `
      alter table dispatcher_equipment_report_revisions
        drop index idx_equipment_report_revisions_business_date,
        drop column business_account_id,
        add key idx_equipment_report_revisions_date_created (
          report_date,
          created_at
        );
      `,
      `
      alter table account_accesses
        drop index idx_account_accesses_scope;
      `,
      `
      update account_accesses
      set scope_kind = case
        when account_type = 'admin' then 'platform'
        else 'organization'
      end;
      `,
      `
      alter table account_accesses
        drop column business_account_id,
        add key idx_account_accesses_scope (scope_kind);
      `,
      `
      update account_positions
      set capabilities = json_remove(
        capabilities,
        json_unquote(
          json_search(capabilities, 'one', 'platform.manage_business_accounts')
        )
      )
      where json_contains(
        capabilities,
        json_quote('platform.manage_business_accounts')
      );
      `,
      `
      update account_accesses
      set capabilities = json_remove(
        capabilities,
        json_unquote(
          json_search(capabilities, 'one', 'platform.manage_business_accounts')
        )
      )
      where json_contains(
        capabilities,
        json_quote('platform.manage_business_accounts')
      );
      `,
      `
      alter table user_audit_events
        drop column business_account_id;
      `,
      `
      drop table if exists business_accounts;
      `,
    ],
  },
  {
    id: "018_production_plan_revisions",
    statements: [
      `
      create table if not exists production_plan_revisions (
        id char(36) not null primary key,
        plan_month char(7) not null,
        monthly_plan bigint unsigned not null,
        working_dates json not null,
        daily_plans json not null,
        created_by_user_id varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_production_plan_revisions_month_created (
          plan_month,
          created_at,
          id
        )
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      insert into account_positions (
        id, display_name, account_type, navigation_items, capabilities, is_protected
      )
      select
        'economist', 'Экономист', 'business_owner',
        json_array('business.production_plan'),
        json_array('business.manage_production_plan'),
        0
      where not exists (
        select 1
        from account_positions
        where lower(trim(display_name)) = 'экономист'
      );
      `,
      `
      update account_positions
      set account_type = 'business_owner',
          navigation_items = case
            when json_contains(
              navigation_items,
              json_quote('business.production_plan')
            ) then navigation_items
            else json_array_append(
              navigation_items,
              '$',
              'business.production_plan'
            )
          end,
          capabilities = case
            when json_contains(
              capabilities,
              json_quote('business.manage_production_plan')
            ) then capabilities
            else json_array_append(
              capabilities,
              '$',
              'business.manage_production_plan'
            )
          end
      where lower(trim(display_name)) = 'экономист';
      `,
      `
      update account_positions
      set capabilities = case
        when json_contains(
          capabilities,
          json_quote('business.manage_production_plan')
        ) then capabilities
        else json_array_append(
          capabilities,
          '$',
          'business.manage_production_plan'
        )
      end
      where id = 'administrator';
      `,
      `
      update account_accesses accesses
      join account_positions positions on positions.id = accesses.position_code
      set accesses.account_type = 'business_owner',
          accesses.scope_kind = 'organization'
      where lower(trim(positions.display_name)) = 'экономист';
      `,
      `
      delete sessions
      from auth_sessions sessions
      join account_accesses accesses on accesses.user_id = sessions.user_id
      join account_positions positions on positions.id = accesses.position_code
      where positions.id = 'administrator'
        or lower(trim(positions.display_name)) = 'экономист';
      `,
    ],
  },
  {
    id: "019_production_category_plans_and_brands",
    statements: [
      `
      alter table production_plan_revisions
        modify column monthly_plan bigint unsigned null,
        modify column daily_plans json null,
        add column monthly_plans json null after plan_month,
        add column category_daily_plans json null after daily_plans;
      `,
      `
      create table production_brand_labels (
        id char(36) not null primary key,
        category varchar(32) not null,
        label varchar(120) not null,
        normalized_label varchar(120) not null,
        created_by_user_id varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        unique key uq_production_brand_labels_category_normalized (
          category,
          normalized_label
        ),
        constraint chk_production_brand_labels_category
          check (category in ('product', 'unformed', 'chamotte'))
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "020_production_plan_month_locks",
    statements: [
      `
      alter table production_plan_revisions
        add column revision_sequence bigint unsigned not null auto_increment,
        add unique key uq_production_plan_revisions_sequence (
          revision_sequence
        ),
        add key idx_production_plan_revisions_month_sequence (
          plan_month,
          revision_sequence
        );
      `,
      `
      create table if not exists production_plan_month_locks (
        plan_month char(7) not null primary key
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "021_refractory_report_revisions",
    statements: [
      `
      create table if not exists refractory_report_keys (
        report_type varchar(32) not null,
        report_date date not null,
        shift_number tinyint unsigned not null,
        primary key (report_type, report_date, shift_number),
        constraint chk_refractory_report_keys_type
          check (report_type in ('cosh', 'equipment', 'firing')),
        constraint chk_refractory_report_keys_shift
          check (shift_number in (1, 2))
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists refractory_report_revisions (
        id char(36) not null primary key,
        report_type varchar(32) not null,
        report_date date not null,
        shift_number tinyint unsigned not null,
        revision_number int unsigned not null,
        status varchar(24) not null,
        payload json not null,
        totals json not null,
        submitted_by_user_id varchar(120) not null,
        submitted_by_account_id varchar(120) not null,
        master_display_name varchar(255) not null,
        submitted_at timestamp(3) not null default current_timestamp(3),
        reviewed_by_user_id varchar(120) null,
        reviewed_by_account_id varchar(120) null,
        reviewer_display_name varchar(255) null,
        reviewed_at timestamp(3) null,
        rejection_comment text null,
        unique key uq_refractory_report_revision (
          report_type,
          report_date,
          shift_number,
          revision_number
        ),
        key idx_refractory_report_pending (status, submitted_at, id),
        key idx_refractory_report_shift (
          report_date,
          shift_number,
          report_type,
          revision_number
        ),
        constraint fk_refractory_report_key
          foreign key (report_type, report_date, shift_number)
          references refractory_report_keys (
            report_type,
            report_date,
            shift_number
          )
          on delete restrict,
        constraint chk_refractory_report_revision_type
          check (report_type in ('cosh', 'equipment', 'firing')),
        constraint chk_refractory_report_revision_shift
          check (shift_number in (1, 2)),
        constraint chk_refractory_report_revision_status
          check (status in ('pending', 'rejected', 'approved'))
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      update account_positions
      set capabilities = case
        when json_contains(
          capabilities,
          json_quote('business.review_refractory_reports')
        ) then capabilities
        else json_array_append(
          capabilities,
          '$',
          'business.review_refractory_reports'
        )
      end
      where json_contains(
        navigation_items,
        json_quote('business.dispatcher_form')
      );
      `,
      `
      update account_accesses
      set capabilities = case
        when json_contains(
          capabilities,
          json_quote('business.review_refractory_reports')
        ) then capabilities
        else json_array_append(
          capabilities,
          '$',
          'business.review_refractory_reports'
        )
      end
      where json_contains(
        navigation_items,
        json_quote('business.dispatcher_form')
      );
      `,
      `
      update account_positions
      set capabilities = case
        when json_contains(
          capabilities,
          json_quote('business.submit_refractory_reports')
        ) then capabilities
        else json_array_append(
          capabilities,
          '$',
          'business.submit_refractory_reports'
        )
      end
      where id = 'administrator';
      `,
      `
      update account_positions
      set capabilities = case
        when json_contains(
          capabilities,
          json_quote('business.review_refractory_reports')
        ) then capabilities
        else json_array_append(
          capabilities,
          '$',
          'business.review_refractory_reports'
        )
      end
      where id = 'administrator';
      `,
      `
      update account_accesses
      set capabilities = case
        when json_contains(
          capabilities,
          json_quote('business.submit_refractory_reports')
        ) then capabilities
        else json_array_append(
          capabilities,
          '$',
          'business.submit_refractory_reports'
        )
      end
      where position_code = 'administrator';
      `,
      `
      update account_accesses
      set capabilities = case
        when json_contains(
          capabilities,
          json_quote('business.review_refractory_reports')
        ) then capabilities
        else json_array_append(
          capabilities,
          '$',
          'business.review_refractory_reports'
        )
      end
      where position_code = 'administrator';
      `,
      `
      delete sessions
      from auth_sessions sessions
      join account_accesses accesses on accesses.user_id = sessions.user_id
      where json_contains(
        accesses.navigation_items,
        json_quote('business.dispatcher_form')
      ) or accesses.position_code = 'administrator';
      `,
    ],
  },
  {
    id: "022_google_sheets_production_brands",
    statements: [
      "drop table if exists production_brand_labels",
    ],
  },
  {
    id: "023_laboratory_results",
    statements: [
      `
      create table if not exists laboratory_results (
        id char(36) not null primary key,
        section varchar(32) not null,
        analysis_date date not null,
        material_label varchar(120) not null,
        product_brand varchar(120) null,
        submitted_by_user_id varchar(120) not null,
        submitted_by_account_id varchar(120) not null,
        laboratory_assistant_display_name varchar(255) not null,
        payload json not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_laboratory_results_section_date (
          section,
          analysis_date,
          created_at
        ),
        key idx_laboratory_results_material_date (
          material_label,
          analysis_date
        ),
        constraint chk_laboratory_results_section
          check (section in ('incoming', 'finished_product')),
        constraint chk_laboratory_results_product_brand
          check (
            (section = 'incoming' and product_brand is null) or
            (section = 'finished_product' and product_brand is not null)
          )
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      insert into account_positions (
        id,
        display_name,
        account_type,
        navigation_items,
        capabilities,
        is_protected
      ) values (
        'laboratory_assistant',
        'Лаборант',
        'business_owner',
        json_array('business.laboratory_results'),
        json_array('business.manage_laboratory_results'),
        1
      ) on duplicate key update id = values(id);
      `,
      `
      update account_positions
      set capabilities = case
        when json_contains(
          capabilities,
          json_quote('business.manage_laboratory_results')
        ) then capabilities
        else json_array_append(
          capabilities,
          '$',
          'business.manage_laboratory_results'
        )
      end
      where id = 'administrator';
      `,
      `
      update account_accesses
      set capabilities = case
        when json_contains(
          capabilities,
          json_quote('business.manage_laboratory_results')
        ) then capabilities
        else json_array_append(
          capabilities,
          '$',
          'business.manage_laboratory_results'
        )
      end
      where position_code = 'administrator';
      `,
      `
      delete sessions
      from auth_sessions sessions
      join account_accesses accesses on accesses.user_id = sessions.user_id
      where accesses.position_code = 'administrator';
      `,
    ],
  },
  {
    id: "024_laboratory_bank_assignments",
    statements: [
      `
      create table if not exists laboratory_bank_assignments (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        bank_number tinyint unsigned not null,
        laboratory_result_id char(36) not null,
        sample_index int unsigned not null,
        sample_identifier varchar(255) not null,
        material_label varchar(120) not null,
        bulk_density decimal(14,6) not null,
        assigned_by_user_id varchar(120) not null,
        assigned_by_account_id varchar(120) not null,
        assigned_by_display_name varchar(255) not null,
        assigned_at timestamp(3) not null default current_timestamp(3),
        unique key uniq_laboratory_bank_assignment_id (id),
        key idx_laboratory_bank_assignment_current (bank_number, sequence_id),
        key idx_laboratory_bank_assignment_result (laboratory_result_id),
        constraint fk_laboratory_bank_assignment_result
          foreign key (laboratory_result_id) references laboratory_results(id)
          on delete restrict,
        constraint chk_laboratory_bank_assignment_number
          check (bank_number in (1, 2, 3)),
        constraint chk_laboratory_bank_assignment_density
          check (bulk_density > 0)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "025_board_assignments",
    statements: [
      `
      create table if not exists board_assignments (
        id varchar(120) not null primary key,
        meeting_date date not null,
        protocol_number varchar(80) not null,
        decision_number varchar(80) not null,
        summary varchar(500) not null,
        details text not null,
        co_executors json not null,
        due_date varchar(255) not null,
        status varchar(32) not null,
        source_material_key varchar(120) null,
        source_material_file_name varchar(255) null,
        created_by_user_id varchar(120) not null,
        created_by_account_id varchar(120) not null,
        created_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        updated_at timestamp(3) not null default current_timestamp(3)
          on update current_timestamp(3),
        key idx_board_assignments_meeting_date (
          meeting_date,
          decision_number
        ),
        key idx_board_assignments_status_updated (
          status,
          updated_at
        ),
        constraint chk_board_assignments_status
          check (
            status in (
              'in_progress',
              'under_review',
              'revision_requested',
              'completed'
            )
          ),
        constraint chk_board_assignments_source_material
          check (
            (source_material_key is null and source_material_file_name is null) or
            (source_material_key is not null and source_material_file_name is not null)
          )
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists board_assignment_comments (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        assignment_id varchar(120) not null,
        author_user_id varchar(120) not null,
        author_account_id varchar(120) not null,
        author_display_name varchar(255) not null,
        comment_text text not null,
        status_after varchar(32) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        unique key uq_board_assignment_comment_id (id),
        key idx_board_assignment_comments_assignment (
          assignment_id,
          sequence_id
        ),
        constraint fk_board_assignment_comment_assignment
          foreign key (assignment_id) references board_assignments(id)
          on delete restrict,
        constraint chk_board_assignment_comment_status
          check (
            status_after in (
              'in_progress',
              'under_review',
              'revision_requested',
              'completed'
            )
          )
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      insert into board_assignments (
        id,
        meeting_date,
        protocol_number,
        decision_number,
        summary,
        details,
        co_executors,
        due_date,
        status,
        source_material_key,
        source_material_file_name,
        created_by_user_id,
        created_by_account_id,
        created_by_display_name
      ) values
        (
          'protocol-369-assignment-1-2',
          '2026-07-10',
          '369',
          '1.2',
          'Внедрить электронный реестр поручений Совета директоров',
          'Обеспечить организационные меры по внедрению Положения, включая ведение реестра поручений Совета директоров в электронной форме и доступ членов Совета директоров к этому реестру.',
          json_array(),
          'Срок протоколом не установлен',
          'in_progress',
          'protocol-369-2026-07-10',
          'Протокол 369 10.07.2026 v2.pdf',
          'system-protocol-import',
          'system-protocol-import',
          'Протокол №369'
        ),
        (
          'protocol-369-assignment-1-3',
          '2026-07-10',
          '369',
          '1.3',
          'Обеспечить своевременную отчётность по поручениям Совета директоров',
          'Обеспечить исполнение требований Положения в части своевременного представления отчётности и исполнения поручений Совета директоров.',
          json_array(),
          'Постоянно',
          'in_progress',
          'protocol-369-2026-07-10',
          'Протокол 369 10.07.2026 v2.pdf',
          'system-protocol-import',
          'system-protocol-import',
          'Протокол №369'
        ),
        (
          'protocol-369-assignment-2-3',
          '2026-07-10',
          '369',
          '2.3',
          'Подготовить анализ причин невыполнения плановых показателей',
          'Представить Совету директоров письменный анализ причин невыполнения плановых показателей с выводами и предложениями по исправлению создавшегося положения.',
          json_array(),
          'До 24.07.2026',
          'in_progress',
          'protocol-369-2026-07-10',
          'Протокол 369 10.07.2026 v2.pdf',
          'system-protocol-import',
          'system-protocol-import',
          'Протокол №369'
        ),
        (
          'protocol-369-assignment-2-4',
          '2026-07-10',
          '369',
          '2.4',
          'Представлять информацию о динамике выполнения бюджета',
          'Обеспечить ежемесячное представление Председателю и всем членам Совета директоров сводной информации о динамике выполнения бюджетных показателей во втором полугодии 2026 года.',
          json_array(),
          'Ежемесячно во втором полугодии 2026 года',
          'in_progress',
          'protocol-369-2026-07-10',
          'Протокол 369 10.07.2026 v2.pdf',
          'system-protocol-import',
          'system-protocol-import',
          'Протокол №369'
        ),
        (
          'protocol-369-assignment-3-2',
          '2026-07-10',
          '369',
          '3.2',
          'Представлять ежемесячный отчёт об исполнении бюджета',
          'Обеспечить представление Совету директоров ежемесячного отчёта о выполнении утверждённого бюджета.',
          json_array(),
          'Ежемесячно',
          'in_progress',
          'protocol-369-2026-07-10',
          'Протокол 369 10.07.2026 v2.pdf',
          'system-protocol-import',
          'system-protocol-import',
          'Протокол №369'
        ),
        (
          'protocol-369-assignment-4-2',
          '2026-07-10',
          '369',
          '4.2',
          'Представить информацию о марках и сортах глины',
          'Представить Совету директоров письменную информацию по маркам и сортам глины, необходимой для применения в производстве продукции во втором полугодии 2026 года и далее.',
          json_array(),
          'До 20.07.2026',
          'in_progress',
          'protocol-369-2026-07-10',
          'Протокол 369 10.07.2026 v2.pdf',
          'system-protocol-import',
          'system-protocol-import',
          'Протокол №369'
        ),
        (
          'protocol-369-assignment-4-4',
          '2026-07-10',
          '369',
          '4.4',
          'Включать ход обеспечения сырьём в ежемесячную отчётность',
          'Включать информацию о ходе исполнения плана мероприятий по обеспечению сырьём в регулярную ежемесячную отчётность Генерального директора перед Советом директоров.',
          json_array(),
          'Ежемесячно',
          'in_progress',
          'protocol-369-2026-07-10',
          'Протокол 369 10.07.2026 v2.pdf',
          'system-protocol-import',
          'system-protocol-import',
          'Протокол №369'
        ),
        (
          'protocol-369-assignment-5-2',
          '2026-07-10',
          '369',
          '5.2',
          'Отчитываться о кадровых мероприятиях',
          'Представлять Совету директоров отчёт о выполнении мероприятий по кадровому обеспечению и повышению эффективности персонала.',
          json_array(),
          'Ежемесячно до конца 2026 года, не позднее 5-го числа следующего месяца',
          'in_progress',
          'protocol-369-2026-07-10',
          'Протокол 369 10.07.2026 v2.pdf',
          'system-protocol-import',
          'system-protocol-import',
          'Протокол №369'
        ),
        (
          'protocol-369-assignment-6-3',
          '2026-07-10',
          '369',
          '6.3',
          'Отчитываться о ремонте и вводе оборудования',
          'Ежемесячно представлять Совету директоров письменный отчёт о ходе реализации плана по ремонтам и вводу оборудования.',
          json_array(),
          'Ежемесячно',
          'in_progress',
          'protocol-369-2026-07-10',
          'Протокол 369 10.07.2026 v2.pdf',
          'system-protocol-import',
          'system-protocol-import',
          'Протокол №369'
        ),
        (
          'protocol-369-assignment-7-2',
          '2026-07-10',
          '369',
          '7.2',
          'Подать заявку на регистрацию товарного знака',
          'Обеспечить подачу заявки на регистрацию товарного знака в патентное бюро в установленном законодательством порядке.',
          json_array(),
          'Срок протоколом не установлен',
          'in_progress',
          'protocol-369-2026-07-10',
          'Протокол 369 10.07.2026 v2.pdf',
          'system-protocol-import',
          'system-protocol-import',
          'Протокол №369'
        ),
        (
          'protocol-369-assignment-8-1',
          '2026-07-10',
          '369',
          '8.1',
          'Найти дополнительные каналы реализации продукции',
          'Провести работу по поиску дополнительных источников реализации продукции в виде заключения договоров с торговыми домами и оптовыми организациями.',
          json_array(),
          'Срок протоколом не установлен',
          'in_progress',
          'protocol-369-2026-07-10',
          'Протокол 369 10.07.2026 v2.pdf',
          'system-protocol-import',
          'system-protocol-import',
          'Протокол №369'
        )
      on duplicate key update id = values(id);
      `,
      `
      insert into user_audit_events (
        id,
        actor_user_id,
        actor_account_id,
        actor_display_name,
        actor_position_display_name,
        category,
        action,
        outcome,
        summary,
        details,
        target_type,
        target_id
      )
      select
        uuid(),
        'system-protocol-import',
        'system-protocol-import',
        'Протокол №369',
        'Системный импорт',
        'data_change',
        'board_assignment.create',
        'success',
        concat(
          'Импортировано поручение Совета директоров: ',
          assignments.summary
        ),
        json_array(
          json_object('label', 'Дата заседания', 'value', assignments.meeting_date),
          json_object('label', 'Протокол', 'value', assignments.protocol_number),
          json_object('label', 'Пункт решения', 'value', assignments.decision_number),
          json_object('label', 'Срок исполнения', 'value', assignments.due_date)
        ),
        'board_assignment',
        assignments.id
      from board_assignments assignments
      where assignments.source_material_key = 'protocol-369-2026-07-10'
        and not exists (
          select 1
          from user_audit_events events
          where events.action = 'board_assignment.create'
            and events.target_type = 'board_assignment'
            and events.target_id = assignments.id
        );
      `,
      `
      insert into account_positions (
        id,
        display_name,
        account_type,
        navigation_items,
        capabilities,
        is_protected
      ) values
        (
          'board_deputy_chair',
          'Заместитель председателя Совета директоров',
          'business_owner',
          json_array(
            'business.overview',
            'business.dispatcher',
            'business.work',
            'business.board_assignments'
          ),
          json_array(
            'business.view_all_statistics',
            'business.view_notifications',
            'business.view_dispatcher_feed',
            'business.submit_forms',
            'business.view_own_submissions',
            'business.view_board_assignments',
            'business.create_board_assignments',
            'business.review_board_assignments'
          ),
          1
        ),
        (
          'board_assignment_reviewer',
          'Член Совета директоров с правом приёмки поручений',
          'business_owner',
          json_array(
            'business.overview',
            'business.dispatcher',
            'business.work',
            'business.board_assignments'
          ),
          json_array(
            'business.view_all_statistics',
            'business.view_notifications',
            'business.view_dispatcher_feed',
            'business.submit_forms',
            'business.view_own_submissions',
            'business.view_board_assignments',
            'business.create_board_assignments',
            'business.review_board_assignments'
          ),
          1
        )
      on duplicate key update id = values(id);
      `,
      `
      update account_positions
      set navigation_items = case
            when json_contains(
              navigation_items,
              json_quote('business.board_assignments')
            ) then navigation_items
            else json_array_append(
              navigation_items,
              '$',
              'business.board_assignments'
            )
          end,
          capabilities = json_array_append(
            capabilities,
            '$',
            'business.view_board_assignments',
            '$',
            'business.create_board_assignments',
            '$',
            'business.review_board_assignments'
          )
      where id = 'board_chair';
      `,
      `
      update account_positions
      set navigation_items = case
            when json_contains(
              navigation_items,
              json_quote('business.board_assignments')
            ) then navigation_items
            else json_array_append(
              navigation_items,
              '$',
              'business.board_assignments'
            )
          end,
          capabilities = json_array_append(
            capabilities,
            '$',
            'business.view_board_assignments',
            '$',
            'business.create_board_assignments'
          )
      where id = 'board_member';
      `,
      `
      update account_positions
      set navigation_items = case
            when json_contains(
              navigation_items,
              json_quote('business.board_assignments')
            ) then navigation_items
            else json_array_append(
              navigation_items,
              '$',
              'business.board_assignments'
            )
          end,
          capabilities = json_array_append(
            capabilities,
            '$',
            'business.view_board_assignments',
            '$',
            'business.execute_board_assignments'
          )
      where id = 'general_director';
      `,
      `
      update account_positions
      set capabilities = json_array_append(
        capabilities,
        '$',
        'business.view_board_assignments'
      )
      where id = 'administrator';
      `,
      `
      update account_accesses accesses
      join account_positions positions on positions.id = accesses.position_code
      set accesses.navigation_items = positions.navigation_items,
          accesses.capabilities = positions.capabilities
      where accesses.position_code in (
        'administrator',
        'board_chair',
        'board_member',
        'general_director',
        'board_deputy_chair',
        'board_assignment_reviewer'
      );
      `,
      `
      delete sessions
      from auth_sessions sessions
      join account_accesses accesses on accesses.user_id = sessions.user_id
      where accesses.position_code in (
        'administrator',
        'board_chair',
        'board_member',
        'general_director',
        'board_deputy_chair',
        'board_assignment_reviewer'
      );
      `,
    ],
  },
  {
    id: "026_board_assignment_schedules",
    statements: [
      `
      alter table board_assignments
        add column recurrence varchar(16) null after due_date,
        add column active_from date null after recurrence,
        add column active_to date null after active_from,
        add column current_occurrence_date date null after active_to;
      `,
      `
      update board_assignments
      set recurrence = case
        when lower(due_date) = 'постоянно'
          or lower(due_date) like '%ежеднев%' then 'daily'
        when lower(due_date) like '%еженедель%' then 'weekly'
        when due_date like '%Ежемесячно%'
          or lower(due_date) like '%ежемесяч%' then 'monthly'
        when lower(due_date) like '%ежегод%' then 'yearly'
        else 'once'
      end;
      `,
      `
      update board_assignments
      set active_from = case id
            when 'protocol-369-assignment-2-3' then '2026-07-24'
            when 'protocol-369-assignment-4-2' then '2026-07-20'
            when 'protocol-369-assignment-5-2' then '2026-08-05'
            else meeting_date
          end,
          active_to = case
            when id = 'protocol-369-assignment-2-3' then '2026-07-24'
            when id = 'protocol-369-assignment-2-4' then '2026-12-31'
            when id = 'protocol-369-assignment-4-2' then '2026-07-20'
            when id = 'protocol-369-assignment-5-2' then '2027-01-05'
            when recurrence = 'once' then meeting_date
            else '2099-12-31'
          end;
      `,
      `
      update board_assignments
      set current_occurrence_date = active_from;
      `,
      `
      alter table board_assignments
        modify recurrence varchar(16) not null,
        modify active_from date not null,
        modify active_to date not null,
        modify current_occurrence_date date not null,
        add key idx_board_assignments_active_occurrence (
          status,
          current_occurrence_date
        ),
        add constraint chk_board_assignments_recurrence
          check (recurrence in ('daily', 'weekly', 'monthly', 'yearly', 'once')),
        add constraint chk_board_assignments_active_range
          check (active_from <= active_to),
        add constraint chk_board_assignments_current_occurrence
          check (current_occurrence_date between active_from and active_to);
      `,
    ],
  },
  {
    id: "027_board_assignment_editing_and_completion_history",
    statements: [
      `
      create table if not exists board_assignment_edit_revisions (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        assignment_id varchar(120) not null,
        before_snapshot json not null,
        after_snapshot json not null,
        edit_comment text not null,
        edited_by_user_id varchar(120) not null,
        edited_by_account_id varchar(120) not null,
        edited_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        unique key uq_board_assignment_edit_revision_id (id),
        key idx_board_assignment_edit_revisions_assignment (
          assignment_id,
          sequence_id
        ),
        constraint fk_board_assignment_edit_revision_assignment
          foreign key (assignment_id) references board_assignments(id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists board_assignment_completion_snapshots (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        assignment_id varchar(120) not null,
        occurrence_date date not null,
        snapshot json not null,
        completed_by_user_id varchar(120) not null,
        completed_by_account_id varchar(120) not null,
        completed_by_display_name varchar(255) not null,
        completed_at timestamp(3) not null default current_timestamp(3),
        unique key uq_board_assignment_completion_id (id),
        unique key uq_board_assignment_completion_occurrence (
          assignment_id,
          occurrence_date
        ),
        key idx_board_assignment_completions_completed (
          completed_at,
          sequence_id
        ),
        constraint fk_board_assignment_completion_assignment
          foreign key (assignment_id) references board_assignments(id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "028_account_position_order",
    statements: [
      `
      alter table account_positions
        add column sort_order int null after is_protected;
      `,
      `
      update account_positions as positions
      join (
        select
          id,
          row_number() over (
            order by is_protected desc, display_name asc, id asc
          ) - 1 as next_sort_order
        from account_positions
      ) as ranked on ranked.id = positions.id
      set positions.sort_order = ranked.next_sort_order;
      `,
      `
      alter table account_positions
        modify sort_order int unsigned not null,
        add key idx_account_positions_sort_order (sort_order);
      `,
    ],
  },
  {
    id: "029_board_assignment_documents",
    statements: [
      `
      create table if not exists board_assignment_documents (
        sequence_id bigint unsigned not null auto_increment primary key,
        id varchar(160) not null,
        assignment_id varchar(120) not null,
        storage_key varchar(120) null,
        file_name varchar(255) not null,
        mime_type varchar(80) not null,
        byte_size int unsigned not null,
        pdf_data mediumblob null,
        uploaded_by_user_id varchar(120) not null,
        uploaded_by_account_id varchar(120) not null,
        uploaded_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        deleted_at timestamp(3) null,
        unique key uq_board_assignment_document_id (id),
        key idx_board_assignment_documents_live (
          assignment_id,
          deleted_at,
          sequence_id
        ),
        constraint fk_board_assignment_document_assignment
          foreign key (assignment_id) references board_assignments(id)
          on delete restrict,
        constraint chk_board_assignment_document_pdf
          check (mime_type = 'application/pdf'),
        constraint chk_board_assignment_document_storage
          check (pdf_data is not null or storage_key is not null)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      insert into board_assignment_documents (
        id,
        assignment_id,
        storage_key,
        file_name,
        mime_type,
        byte_size,
        pdf_data,
        uploaded_by_user_id,
        uploaded_by_account_id,
        uploaded_by_display_name,
        created_at
      )
      select
        concat('legacy-', assignments.id),
        assignments.id,
        assignments.source_material_key,
        assignments.source_material_file_name,
        'application/pdf',
        0,
        null,
        assignments.created_by_user_id,
        assignments.created_by_account_id,
        assignments.created_by_display_name,
        assignments.created_at
      from board_assignments assignments
      where assignments.source_material_key is not null
        and assignments.source_material_file_name is not null
      on duplicate key update id = values(id);
      `,
    ],
  },
  {
    id: "030_rotary_kiln_2_firing_journal",
    statements: [
      `
      create table if not exists rotary_kiln_2_firing_journal (
        id char(36) not null primary key,
        record_date date not null,
        record_time char(5) not null,
        water_absorption decimal(14,4) not null,
        temperature_before_cyclone decimal(14,4) not null,
        temperature_before_filter decimal(14,4) not null,
        temperature_in_field_chamber decimal(14,4) not null,
        temperature_at_rollback decimal(14,4) not null,
        gas_consumption_per_hour decimal(14,4) not null,
        vacuum_value decimal(14,4) not null,
        pressure_value decimal(14,4) not null,
        shift_supervisor varchar(120) not null,
        burner_operator varchar(120) not null,
        laboratory_assistant varchar(120) not null,
        sieve_pass_05 decimal(14,4) not null,
        bulk_density decimal(14,4) not null,
        kiln_load_buckets_per_hour decimal(14,4) not null,
        note text null,
        submitted_by_user_id varchar(120) not null,
        submitted_by_account_id varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_rotary_kiln_2_firing_journal_recorded (
          record_date,
          record_time,
          created_at
        )
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "031_laboratory_sample_registration_journal",
    statements: [
      `
      create table if not exists laboratory_sample_registration_journal (
        id char(36) not null primary key,
        sample_number varchar(120) not null,
        laboratory_sample_code varchar(120) not null,
        sampling_date date not null,
        sampling_laboratory_assistant varchar(120) not null,
        sample_name varchar(120) not null,
        registration_date date not null,
        sampling_location varchar(120) not null,
        al2o3 varchar(120) not null,
        fe2o3 varchar(120) not null,
        sio2 varchar(120) not null,
        cao2 varchar(120) not null,
        p2o5 varchar(120) not null,
        loss_on_ignition varchar(120) not null,
        moisture varchar(120) not null,
        chemical_analysis_date date not null,
        chemical_analysis_laboratory_assistant varchar(120) not null,
        batch_number varchar(120) not null,
        notes text null,
        submitted_by_user_id varchar(120) not null,
        submitted_by_account_id varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_laboratory_sample_registration_recorded (
          registration_date,
          created_at
        ),
        key idx_laboratory_sample_registration_code (
          laboratory_sample_code,
          registration_date
        )
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "032_laboratory_chemical_analysis_journal",
    statements: [
      `
      alter table laboratory_sample_registration_journal
        modify al2o3 varchar(120) null,
        modify fe2o3 varchar(120) null,
        modify sio2 varchar(120) null,
        modify cao2 varchar(120) null,
        modify p2o5 varchar(120) null,
        modify loss_on_ignition varchar(120) null,
        modify moisture varchar(120) null,
        modify chemical_analysis_date date null,
        modify chemical_analysis_laboratory_assistant varchar(120) null,
        modify batch_number varchar(120) null;
      `,
      `
      create table if not exists laboratory_chemical_analysis_journal (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        sample_registration_id char(36) not null,
        chemical_analysis_date date not null,
        chemical_analysis_laboratory_assistant varchar(120) not null,
        batch_number varchar(120) not null,
        al2o3 varchar(120) not null,
        fe2o3 varchar(120) not null,
        sio2 varchar(120) not null,
        cao2 varchar(120) not null,
        p2o5 varchar(120) not null,
        loss_on_ignition varchar(120) not null,
        moisture varchar(120) not null,
        notes text null,
        submitted_by_user_id varchar(120) not null,
        submitted_by_account_id varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        unique key uniq_laboratory_chemical_analysis_id (id),
        key idx_laboratory_chemical_analysis_sample (
          sample_registration_id,
          sequence_id
        ),
        key idx_laboratory_chemical_analysis_recorded (
          chemical_analysis_date,
          created_at
        ),
        constraint fk_laboratory_chemical_analysis_sample
          foreign key (sample_registration_id)
          references laboratory_sample_registration_journal (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "033_optional_laboratory_chemical_analysis_values",
    statements: [
      `
      alter table laboratory_chemical_analysis_journal
        modify chemical_analysis_date date null,
        modify chemical_analysis_laboratory_assistant varchar(120) null,
        modify al2o3 varchar(120) null,
        modify fe2o3 varchar(120) null,
        modify sio2 varchar(120) null,
        modify cao2 varchar(120) null,
        modify p2o5 varchar(120) null,
        modify loss_on_ignition varchar(120) null,
        modify moisture varchar(120) null;
      `,
    ],
  },
  {
    id: "034_rotary_kiln_2_produced_material_bank_density",
    statements: [
      `
      alter table rotary_kiln_2_firing_journal
        add column produced_material varchar(120) null after record_time,
        add key idx_rotary_kiln_2_firing_journal_material (
          produced_material,
          record_date,
          record_time,
          created_at
        );
      `,
      `
      alter table laboratory_bank_assignments
        drop foreign key fk_laboratory_bank_assignment_result;
      `,
      `
      alter table laboratory_bank_assignments
        add column bulk_density_source varchar(40) not null
          default 'laboratory_result' after bulk_density,
        add column bulk_density_sample_count int unsigned null
          after bulk_density_source,
        modify laboratory_result_id char(36) null,
        modify sample_index int unsigned null,
        modify sample_identifier varchar(255) null;
      `,
    ],
  },
  {
    id: "035_protected_admin_accounts",
    statements: [
      `
      alter table app_users
        add column is_admin_protected tinyint(1) not null default 0;
      `,
      `
      update app_users
      set is_admin_protected = 1
      where lower(trim(login)) = 'admin';
      `,
    ],
  },
  {
    id: "036_sample_registration_sampling_location_index",
    statements: [
      `
      alter table laboratory_sample_registration_journal
        add key idx_laboratory_sample_registration_location (
          sampling_location,
          created_at
        );
      `,
    ],
  },
  {
    id: "037_sample_registration_water_absorption",
    statements: [
      `
      alter table laboratory_sample_registration_journal
        add column water_absorption varchar(120) null after sampling_location;
      `,
    ],
  },
  {
    id: "038_laboratory_sample_registration_revisions",
    statements: [
      `
      create table if not exists laboratory_sample_registration_revisions (
        id char(36) not null primary key,
        sample_registration_id char(36) not null,
        before_snapshot json not null,
        after_snapshot json not null,
        corrected_by_user_id varchar(120) not null,
        corrected_by_account_id varchar(120) not null,
        corrected_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_laboratory_sample_registration_revisions_sample (
          sample_registration_id,
          created_at
        ),
        constraint fk_laboratory_sample_registration_revision_sample
          foreign key (sample_registration_id)
          references laboratory_sample_registration_journal (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "039_laboratory_journal_corrections",
    statements: [
      `
      create table if not exists rotary_kiln_2_firing_revisions (
        id char(36) not null primary key,
        firing_record_id char(36) not null,
        before_snapshot json not null,
        after_snapshot json not null,
        corrected_by_user_id varchar(120) not null,
        corrected_by_account_id varchar(120) not null,
        corrected_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_rotary_kiln_2_firing_revisions_record (
          firing_record_id,
          created_at
        ),
        constraint fk_rotary_kiln_2_firing_revision_record
          foreign key (firing_record_id)
          references rotary_kiln_2_firing_journal (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists laboratory_chemical_analysis_revisions (
        id char(36) not null primary key,
        chemical_analysis_id char(36) not null,
        before_snapshot json not null,
        after_snapshot json not null,
        corrected_by_user_id varchar(120) not null,
        corrected_by_account_id varchar(120) not null,
        corrected_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_laboratory_chemical_analysis_revisions_analysis (
          chemical_analysis_id,
          created_at
        ),
        constraint fk_laboratory_chemical_analysis_revision_analysis
          foreign key (chemical_analysis_id)
          references laboratory_chemical_analysis_journal (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "040_optional_chemical_analysis_batch_number",
    statements: [
      `
      alter table laboratory_chemical_analysis_journal
        modify batch_number varchar(120) null;
      `,
    ],
  },
  {
    id: "041_laboratory_chemical_analysis_number",
    statements: [
      `
      alter table laboratory_chemical_analysis_journal
        add column laboratory_analysis_number varchar(120) null
          after sample_registration_id;
      `,
    ],
  },
  {
    id: "042_unshaped_product_sample_journal",
    statements: [
      `
      create table if not exists laboratory_unshaped_product_sample_journal (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        sample_number varchar(120) not null,
        sample_date date not null,
        sampled_by varchar(120) not null,
        batch_number varchar(120) not null,
        sample_code varchar(120) not null,
        product_name varchar(120) not null,
        batch_mass varchar(120) not null,
        chemical_analysis_number varchar(120) null,
        moisture varchar(120) not null,
        grain_composition varchar(120) not null,
        fire_resistance varchar(120) not null,
        suitability varchar(20) not null,
        notes text null,
        submitted_by_user_id varchar(120) not null,
        submitted_by_account_id varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        unique key uq_laboratory_unshaped_product_sample_id (id),
        key idx_laboratory_unshaped_product_sample_date (sample_date, sequence_id),
        key idx_laboratory_unshaped_product_sample_number (sample_number),
        key idx_laboratory_unshaped_product_sample_code (sample_code),
        key idx_laboratory_unshaped_product_sample_product (product_name)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists laboratory_unshaped_product_sample_revisions (
        id char(36) not null primary key,
        unshaped_product_sample_id char(36) not null,
        before_snapshot json not null,
        after_snapshot json not null,
        corrected_by_user_id varchar(120) not null,
        corrected_by_account_id varchar(120) not null,
        corrected_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_laboratory_unshaped_product_sample_revisions_sample (
          unshaped_product_sample_id,
          created_at
        ),
        constraint fk_laboratory_unshaped_product_sample_revision_sample
          foreign key (unshaped_product_sample_id)
          references laboratory_unshaped_product_sample_journal (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "043_chemical_analysis_sample_sources",
    statements: [
      `
      alter table laboratory_chemical_analysis_journal
        drop foreign key fk_laboratory_chemical_analysis_sample,
        modify sample_registration_id char(36) null,
        add column unshaped_product_sample_id char(36) null
          after sample_registration_id,
        add key idx_laboratory_chemical_analysis_unshaped_sample (
          unshaped_product_sample_id,
          sequence_id
        ),
        add constraint fk_laboratory_chemical_analysis_registered_sample
          foreign key (sample_registration_id)
          references laboratory_sample_registration_journal (id)
          on delete restrict,
        add constraint fk_laboratory_chemical_analysis_unshaped_sample
          foreign key (unshaped_product_sample_id)
          references laboratory_unshaped_product_sample_journal (id)
          on delete restrict,
        add constraint chk_laboratory_chemical_analysis_single_sample
          check (
            (sample_registration_id is null) <>
            (unshaped_product_sample_id is null)
          );
      `,
      `
      create table if not exists laboratory_chemical_analysis_sample_claims (
        sample_source varchar(40) not null,
        sample_id char(36) not null,
        chemical_analysis_id char(36) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        primary key (sample_source, sample_id),
        unique key uq_laboratory_chemical_analysis_claim_analysis (
          chemical_analysis_id
        ),
        constraint fk_laboratory_chemical_analysis_claim_analysis
          foreign key (chemical_analysis_id)
          references laboratory_chemical_analysis_journal (id)
          on delete restrict,
        constraint chk_laboratory_chemical_analysis_claim_source
          check (sample_source in ('sample_registration', 'unshaped_product'))
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      insert into laboratory_chemical_analysis_sample_claims (
        sample_source,
        sample_id,
        chemical_analysis_id
      )
      select
        latest_claim.sample_source,
        latest_claim.sample_id,
        latest_claim.chemical_analysis_id
      from (
        select
          'sample_registration' as sample_source,
          analysis.sample_registration_id as sample_id,
          analysis.id as chemical_analysis_id
        from laboratory_chemical_analysis_journal analysis
        join (
          select
            sample_registration_id,
            max(sequence_id) as sequence_id
          from laboratory_chemical_analysis_journal
          where sample_registration_id is not null
          group by sample_registration_id
        ) latest
          on latest.sample_registration_id = analysis.sample_registration_id
          and latest.sequence_id = analysis.sequence_id

        union all

        select
          'unshaped_product' as sample_source,
          analysis.unshaped_product_sample_id as sample_id,
          analysis.id as chemical_analysis_id
        from laboratory_chemical_analysis_journal analysis
        join (
          select
            unshaped_product_sample_id,
            max(sequence_id) as sequence_id
          from laboratory_chemical_analysis_journal
          where unshaped_product_sample_id is not null
          group by unshaped_product_sample_id
        ) latest
          on latest.unshaped_product_sample_id =
            analysis.unshaped_product_sample_id
          and latest.sequence_id = analysis.sequence_id
      ) latest_claim
      on duplicate key update
        chemical_analysis_id = values(chemical_analysis_id);
      `,
    ],
  },
  {
    id: "044_laboratory_raw_material_quality_journal",
    statements: [
      `
      create table if not exists laboratory_raw_material_quality_journal (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        record_date date not null,
        laboratory_assistant varchar(120) not null,
        shift_supervisor varchar(120) not null,
        shift_code varchar(20) not null,
        clay_brand varchar(120) not null,
        clay_moisture varchar(120) not null,
        clay_grain_composition varchar(120) not null,
        disintegrator_number varchar(20) not null,
        temper_moisture varchar(120) not null,
        temper_grain_composition varchar(120) not null,
        temper_sieve_residue_1 varchar(120) not null,
        temper_sieve_residue_2 varchar(120) not null,
        temper_sieve_residue_3 varchar(120) not null,
        temper_sieve_pass_05 varchar(120) not null,
        temper_brand varchar(120) not null,
        temper_bulk_density varchar(120) not null,
        slip_mixer_number varchar(120) not null,
        slip_temperature varchar(120) not null,
        slip_density varchar(120) not null,
        runner_number varchar(120) not null,
        charge_chamotte_percentage varchar(120) not null,
        charge_clay_percentage varchar(120) not null,
        charge_residue_0063 varchar(120) not null,
        charge_moisture varchar(120) not null,
        elutriation_coefficient varchar(120) not null,
        recommendation_recipient varchar(40) not null,
        recommendation_text text not null,
        submitted_by_user_id varchar(120) not null,
        submitted_by_account_id varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        unique key uq_laboratory_raw_material_quality_id (id),
        key idx_laboratory_raw_material_quality_date (record_date, sequence_id),
        key idx_laboratory_raw_material_quality_clay_brand (clay_brand),
        key idx_laboratory_raw_material_quality_temper_brand (temper_brand),
        constraint chk_laboratory_raw_material_quality_shift
          check (shift_code in ('day', 'night')),
        constraint chk_laboratory_raw_material_quality_disintegrator
          check (disintegrator_number in ('1', '2')),
        constraint chk_laboratory_raw_material_quality_recipient
          check (recommendation_recipient in (
            'dryer_operator',
            'runner_operator',
            'slurry_operator',
            'batch_operator'
          ))
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists laboratory_raw_material_quality_revisions (
        id char(36) not null primary key,
        raw_material_quality_id char(36) not null,
        before_snapshot json not null,
        after_snapshot json not null,
        corrected_by_user_id varchar(120) not null,
        corrected_by_account_id varchar(120) not null,
        corrected_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_laboratory_raw_material_quality_revisions_record (
          raw_material_quality_id,
          created_at
        ),
        constraint fk_laboratory_raw_material_quality_revision_record
          foreign key (raw_material_quality_id)
          references laboratory_raw_material_quality_journal (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "045_laboratory_green_product_quality_journal",
    statements: [
      `
      create table if not exists refractory_wagons (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        wagon_number varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        unique key uq_refractory_wagons_id (id),
        unique key uq_refractory_wagons_number (wagon_number)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists laboratory_green_product_quality_journal (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        record_date date not null,
        press_number varchar(20) not null,
        product_brand varchar(160) not null,
        setter_name varchar(120) not null,
        press_operator varchar(120) not null,
        length_first varchar(40) not null,
        length_second varchar(40) not null,
        width_first varchar(40) not null,
        width_second varchar(40) not null,
        height_first varchar(40) not null,
        height_second varchar(40) not null,
        weight_value varchar(40) not null,
        mechanical_strength varchar(40) not null,
        density_value varchar(40) not null,
        press_operator_recommendations text not null,
        submitted_by_user_id varchar(120) not null,
        submitted_by_account_id varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        unique key uq_laboratory_green_product_quality_id (id),
        key idx_laboratory_green_product_quality_date (record_date, sequence_id),
        key idx_laboratory_green_product_quality_brand (product_brand),
        constraint chk_laboratory_green_product_quality_press
          check (press_number in ('1', '2', '3', '4', '5', '6', '7', '8'))
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists laboratory_green_product_quality_wagons (
        green_product_quality_id char(36) not null,
        wagon_id char(36) not null,
        position smallint unsigned not null,
        primary key (green_product_quality_id, wagon_id),
        unique key uq_laboratory_green_product_quality_wagon_position (
          green_product_quality_id,
          position
        ),
        constraint fk_laboratory_green_product_quality_wagon_record
          foreign key (green_product_quality_id)
          references laboratory_green_product_quality_journal (id)
          on delete restrict,
        constraint fk_laboratory_green_product_quality_wagon
          foreign key (wagon_id)
          references refractory_wagons (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists laboratory_green_product_quality_revisions (
        id char(36) not null primary key,
        green_product_quality_id char(36) not null,
        before_snapshot json not null,
        after_snapshot json not null,
        corrected_by_user_id varchar(120) not null,
        corrected_by_account_id varchar(120) not null,
        corrected_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_laboratory_green_product_quality_revisions_record (
          green_product_quality_id,
          created_at
        ),
        constraint fk_laboratory_green_product_quality_revision_record
          foreign key (green_product_quality_id)
          references laboratory_green_product_quality_journal (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "046_refractory_wagon_journal",
    statements: [
      `
      alter table refractory_wagons
        add column loading_date date null after wagon_number,
        add column product_brand varchar(160) null after loading_date,
        add column raw_control_date date null after product_brand,
        add column submitted_by_user_id varchar(120) null after raw_control_date,
        add column submitted_by_account_id varchar(120) null after submitted_by_user_id,
        add key idx_refractory_wagons_loading_date (loading_date, sequence_id),
        add key idx_refractory_wagons_product_brand (product_brand);
      `,
      `
      create table if not exists refractory_wagon_revisions (
        id char(36) not null primary key,
        wagon_id char(36) not null,
        before_snapshot json not null,
        after_snapshot json not null,
        corrected_by_user_id varchar(120) not null,
        corrected_by_account_id varchar(120) not null,
        corrected_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_refractory_wagon_revisions_wagon (wagon_id, created_at),
        constraint fk_refractory_wagon_revision_wagon
          foreign key (wagon_id)
          references refractory_wagons (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "047_refractory_wagon_lifecycle_dates",
    statements: [
      `
      create table if not exists refractory_wagon_lifecycle_events (
        source_report_type varchar(32) not null,
        source_report_date date not null,
        source_shift_number tinyint unsigned not null,
        event_type varchar(16) not null,
        position int unsigned not null,
        wagon_id char(36) not null,
        event_date date not null,
        source_report_id char(36) not null,
        primary key (
          source_report_type,
          source_report_date,
          source_shift_number,
          event_type,
          position
        ),
        key idx_refractory_wagon_lifecycle_wagon (
          wagon_id,
          event_type,
          event_date
        ),
        key idx_refractory_wagon_lifecycle_report (source_report_id),
        constraint chk_refractory_wagon_lifecycle_report_type
          check (source_report_type in ('firing')),
        constraint chk_refractory_wagon_lifecycle_shift
          check (source_shift_number in (1, 2)),
        constraint chk_refractory_wagon_lifecycle_event_type
          check (event_type in ('firing', 'sorting')),
        constraint fk_refractory_wagon_lifecycle_wagon
          foreign key (wagon_id)
          references refractory_wagons (id)
          on delete restrict,
        constraint fk_refractory_wagon_lifecycle_report
          foreign key (source_report_id)
          references refractory_report_revisions (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "048_refractory_wagon_production_crew",
    statements: [
      `
      alter table refractory_wagons
        add column setter_name varchar(120) null after product_brand,
        add column press_operator varchar(120) null after setter_name;
      `,
    ],
  },
  {
    id: "049_optional_rotary_kiln_2_measurements",
    statements: [
      `
      alter table rotary_kiln_2_firing_journal
        modify temperature_in_field_chamber decimal(14,4) null,
        modify sieve_pass_05 decimal(14,4) null,
        modify kiln_load_buckets_per_hour decimal(14,4) null;
      `,
    ],
  },
  {
    id: "050_product_brand_journal",
    statements: [
      `
      create table if not exists product_brands (
        sequence_id bigint unsigned not null auto_increment,
        id char(36) not null primary key,
        name varchar(120) not null,
        normalized_name varchar(120) not null,
        description text null,
        product_class varchar(255) null,
        application_industry varchar(255) null,
        normative_document varchar(255) null,
        geometry varchar(255) null,
        al2o3 varchar(120) null,
        fe2o3 varchar(120) null,
        strength varchar(120) null,
        submitted_by_user_id varchar(120) not null,
        submitted_by_account_id varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        updated_at timestamp(3) not null default current_timestamp(3)
          on update current_timestamp(3),
        unique key uq_product_brands_sequence (sequence_id),
        unique key uq_product_brands_normalized_name (normalized_name),
        key idx_product_brands_name (name)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists product_brand_revisions (
        id char(36) not null primary key,
        product_brand_id char(36) not null,
        before_snapshot json not null,
        after_snapshot json not null,
        corrected_by_user_id varchar(120) not null,
        corrected_by_account_id varchar(120) not null,
        corrected_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_product_brand_revisions_brand (
          product_brand_id,
          created_at
        ),
        constraint fk_product_brand_revision_brand
          foreign key (product_brand_id)
          references product_brands (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      buildInitialProductBrandInsert(),
      `
      insert into user_audit_events (
        id,
        actor_user_id,
        actor_account_id,
        actor_display_name,
        actor_position_display_name,
        category,
        action,
        outcome,
        summary,
        details,
        target_type,
        target_id
      )
      select
        uuid(),
        'system-google-sheets-brand-import',
        'system-google-sheets-brand-import',
        'Импорт номенклатуры',
        'Системный импорт',
        'data_change',
        'production_brand.import',
        'success',
        concat('Импортирована марка «', brands.name, '»'),
        json_array(
          json_object('label', 'Наименование', 'value', brands.name)
        ),
        'production_brand',
        brands.id
      from product_brands brands
      where brands.submitted_by_user_id = 'system-google-sheets-brand-import'
        and not exists (
          select 1
          from user_audit_events events
          where events.action = 'production_brand.import'
            and events.target_type = 'production_brand'
            and events.target_id = brands.id
        );
      `,
    ],
  },
  {
    id: "051_protected_account_positions",
    statements: [
      `
      alter table account_positions
        add column is_admin_protected tinyint(1) not null default 0;
      `,
      `
      update account_positions
      set is_admin_protected = 1
      where id = 'administrator';
      `,
    ],
  },
  {
    id: "052_remove_stale_test_visitor_entry",
    statements: [
      `
      insert into user_audit_events (
        id,
        actor_user_id,
        actor_account_id,
        actor_display_name,
        actor_position_display_name,
        category,
        action,
        outcome,
        summary,
        details,
        target_type,
        target_id
      )
      select
        uuid(),
        'system-task-62-cleanup',
        'system-task-62-cleanup',
        'Очистка тестовых данных',
        'Системная миграция',
        'data_change',
        'data.delete',
        'success',
        'Удалена тестовая запись входа посетителя от 04.08.2026 09:26',
        json_array(
          json_object(
            'label',
            'Дата и время входа',
            'value',
            json_unquote(json_extract(submissions.payload, '$.entryAt'))
          ),
          json_object(
            'label',
            'Причина',
            'value',
            'Тестовая запись по задаче 62'
          )
        ),
        'dispatcher_submission',
        submissions.id
      from dispatcher_submissions submissions
      join (
        select min(candidate.id) as id
        from dispatcher_submissions candidate
        where candidate.form_id = 'visitor'
          and trim(json_unquote(json_extract(candidate.payload, '$.entryAt'))) =
            '04.08.2026 09:26'
          and not exists (
            select 1
            from dispatcher_submissions exits
            where exits.form_id = 'visitor_exit'
              and (
                trim(json_unquote(json_extract(
                  exits.payload,
                  '$.visitorEntryId'
                ))) = candidate.id
                or (
                  (
                    nullif(trim(json_unquote(json_extract(
                      exits.payload,
                      '$.visitorEntryId'
                    ))), '') is null
                    or not exists (
                      select 1
                      from dispatcher_submissions linked_entry
                      where linked_entry.form_id = 'visitor'
                        and linked_entry.id = trim(json_unquote(json_extract(
                          exits.payload,
                          '$.visitorEntryId'
                        )))
                    )
                  )
                  and lower(trim(coalesce(json_unquote(json_extract(
                    exits.payload,
                    '$.fio'
                  )), ''))) = lower(trim(coalesce(json_unquote(json_extract(
                    candidate.payload,
                    '$.fio'
                  )), '')))
                  and lower(trim(coalesce(json_unquote(json_extract(
                    exits.payload,
                    '$.organization'
                  )), ''))) = lower(trim(coalesce(json_unquote(json_extract(
                    candidate.payload,
                    '$.organization'
                  )), '')))
                  and coalesce(
                    str_to_date(
                      json_unquote(json_extract(exits.payload, '$.exitAt')),
                      '%d.%m.%Y %H:%i'
                    ),
                    exits.received_at
                  ) >= coalesce(
                    str_to_date(
                      json_unquote(json_extract(candidate.payload, '$.entryAt')),
                      '%d.%m.%Y %H:%i'
                    ),
                    candidate.received_at
                  )
                )
              )
          )
        having count(*) = 1
      ) exact_match on exact_match.id = submissions.id
      where not exists (
        select 1
        from user_audit_events events
        where events.action = 'data.delete'
          and events.actor_account_id = 'system-task-62-cleanup'
          and events.target_type = 'dispatcher_submission'
          and events.target_id = submissions.id
      );
      `,
      `
      delete submissions
      from dispatcher_submissions submissions
      join user_audit_events events
        on events.target_id = submissions.id
        and events.target_type = 'dispatcher_submission'
        and events.action = 'data.delete'
        and events.actor_account_id = 'system-task-62-cleanup'
        and events.summary =
          'Удалена тестовая запись входа посетителя от 04.08.2026 09:26'
      where submissions.form_id = 'visitor'
        and trim(json_unquote(json_extract(submissions.payload, '$.entryAt'))) =
          '04.08.2026 09:26';
      `,
    ],
  },
  {
    id: "053_product_brand_merge_deletion",
    statements: [
      `
      alter table product_brands
        add column deleted_at timestamp(3) null after updated_at,
        add column merged_into_id char(36) null after deleted_at,
        add key idx_product_brands_active (deleted_at, name),
        add key idx_product_brands_merged_into (merged_into_id);
      `,
    ],
  },
  {
    id: "054_user_notification_settings",
    statements: [
      `
      alter table app_users
        add column email varchar(320) null after display_name,
        add column max_user_id varchar(120) null after email;
      `,
      `
      create table if not exists user_notification_settings (
        user_id char(36) not null,
        notification_type varchar(64) not null,
        admin_enabled tinyint(1) not null default 0,
        email_enabled tinyint(1) not null default 0,
        max_enabled tinyint(1) not null default 0,
        updated_at timestamp(3) not null default current_timestamp(3)
          on update current_timestamp(3),
        primary key (user_id, notification_type),
        key idx_user_notification_delivery (
          notification_type,
          admin_enabled,
          email_enabled,
          max_enabled
        ),
        constraint fk_user_notification_settings_user
          foreign key (user_id) references app_users(id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists auth_session_notification_deliveries (
        session_id char(64) not null,
        delivery_key varchar(64) not null,
        claimed_at timestamp(3) not null default current_timestamp(3),
        primary key (session_id, delivery_key),
        constraint fk_auth_session_notification_deliveries_session
          foreign key (session_id) references auth_sessions(id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      update account_positions
      set navigation_items = case
            when json_contains(
              navigation_items,
              json_quote('business.settings')
            ) then navigation_items
            else json_array_append(
              navigation_items,
              '$',
              'business.settings'
            )
          end,
          capabilities = case
            when json_contains(
              capabilities,
              json_quote('business.manage_notification_settings')
            ) then capabilities
            else json_array_append(
              capabilities,
              '$',
              'business.manage_notification_settings'
            )
          end
      where account_type = 'business_owner';
      `,
      `
      update account_positions
      set navigation_items = case
            when json_contains(navigation_items, json_quote('admin.accounts'))
              then navigation_items
            else json_array_append(navigation_items, '$', 'admin.accounts')
          end,
          capabilities = case
            when json_contains(capabilities, json_quote('platform.manage_users'))
              then capabilities
            else json_array_append(
              capabilities,
              '$',
              'platform.manage_users',
              '$',
              'platform.manage_access'
            )
          end
      where id = 'board_chair';
      `,
      `
      update account_accesses accesses
      join account_positions positions on positions.id = accesses.position_code
      set accesses.navigation_items = positions.navigation_items,
          accesses.capabilities = positions.capabilities
      where json_contains(
        positions.navigation_items,
        json_quote('business.settings')
      ) or positions.id = 'board_chair';
      `,
      `
      delete sessions
      from auth_sessions sessions
      join account_accesses accesses on accesses.user_id = sessions.user_id
      join account_positions positions on positions.id = accesses.position_code
      where json_contains(
        positions.navigation_items,
        json_quote('business.settings')
      ) or positions.id = 'board_chair';
      `,
    ],
  },
  {
    id: "055_optional_notification_settings_navigation",
    statements: [
      `
      update account_positions
      set navigation_items = case
            when json_contains(
              navigation_items,
              json_quote('business.settings')
            ) then json_remove(
              navigation_items,
              json_unquote(json_search(
                navigation_items,
                'one',
                'business.settings'
              ))
            )
            else navigation_items
          end,
          capabilities = case
            when json_contains(
              capabilities,
              json_quote('business.manage_notification_settings')
            ) then json_remove(
              capabilities,
              json_unquote(json_search(
                capabilities,
                'one',
                'business.manage_notification_settings'
              ))
            )
            else capabilities
          end
      where account_type = 'business_owner'
        and (
          json_contains(
            navigation_items,
            json_quote('business.settings')
          )
          or json_contains(
            capabilities,
            json_quote('business.manage_notification_settings')
          )
        );
      `,
      `
      update account_accesses accesses
      join account_positions positions on positions.id = accesses.position_code
      set accesses.navigation_items = positions.navigation_items,
          accesses.capabilities = positions.capabilities
      where positions.account_type = 'business_owner';
      `,
      `
      delete sessions
      from auth_sessions sessions
      join account_accesses accesses on accesses.user_id = sessions.user_id
      join account_positions positions on positions.id = accesses.position_code
      where positions.account_type = 'business_owner';
      `,
    ],
  },
  {
    id: "056_position_admin_rights",
    statements: [
      `
      insert into account_positions (
        id, display_name, account_type, navigation_items, capabilities,
        is_protected, sort_order, is_admin_protected
      )
      select
        'delegated_administrator',
        'Делегированный администратор сайта',
        'business_owner',
        json_array('admin.accounts'),
        json_array('platform.manage_users', 'platform.manage_access'),
        0,
        next_order.sort_order,
        1
      from (
        select coalesce(max(sort_order), 0) + 1 as sort_order
        from account_positions
      ) next_order
      where exists (
        select 1
        from account_accesses accesses
        join app_users users on users.id = accesses.user_id
        where accesses.position_code = 'administrator'
          and lower(trim(users.login)) <> 'admin'
      )
        and not exists (
          select 1 from account_positions existing
          where existing.id = 'delegated_administrator'
        );
      `,
      `
      update account_accesses accesses
      join app_users users on users.id = accesses.user_id
      set accesses.account_type = 'business_owner',
          accesses.position_code = 'delegated_administrator',
          accesses.scope_kind = 'organization',
          accesses.navigation_items = json_array('admin.accounts'),
          accesses.capabilities = json_array(
            'platform.manage_users',
            'platform.manage_access'
          )
      where accesses.position_code = 'administrator'
        and lower(trim(users.login)) <> 'admin';
      `,
      ...[
        "admin.account_preview",
        "admin.database",
        "admin.user_actions",
      ].map((item) => removePositionJsonValue(
        "navigation_items",
        item,
        "account_type <> 'admin'",
      )),
      ...[
        "platform.manage_analytics_database",
        "platform.manage_integrations",
        "platform.view_audit",
        "platform.view_logs",
        "platform.use_debug_tools",
      ].map((capability) => removePositionJsonValue(
        "capabilities",
        capability,
        "account_type <> 'admin'",
      )),
      removePositionJsonValue(
        "navigation_items",
        "admin.accounts",
        "account_type <> 'admin' and is_admin_protected = 0",
      ),
      removePositionJsonValue(
        "capabilities",
        "platform.manage_users",
        "account_type <> 'admin' and is_admin_protected = 0",
      ),
      removePositionJsonValue(
        "capabilities",
        "platform.manage_access",
        "account_type <> 'admin' and is_admin_protected = 0",
      ),
      addPositionJsonValue(
        "navigation_items",
        "admin.accounts",
        "account_type <> 'admin' and is_admin_protected = 1",
      ),
      addPositionJsonValue(
        "capabilities",
        "platform.manage_users",
        "account_type <> 'admin' and is_admin_protected = 1",
      ),
      addPositionJsonValue(
        "capabilities",
        "platform.manage_access",
        "account_type <> 'admin' and is_admin_protected = 1",
      ),
      `
      update account_accesses accesses
      join account_positions positions on positions.id = accesses.position_code
      set accesses.navigation_items = positions.navigation_items,
          accesses.capabilities = positions.capabilities
      where positions.account_type <> 'admin';
      `,
      `
      delete sessions
      from auth_sessions sessions
      join account_accesses accesses on accesses.user_id = sessions.user_id
      join account_positions positions on positions.id = accesses.position_code
      where positions.account_type <> 'admin';
      `,
    ],
  },
  {
    id: "057_notification_permission_user_channels",
    statements: [
      `
      update user_notification_settings
      set admin_enabled = case
            when admin_enabled = 1
              or email_enabled = 1
              or max_enabled = 1
              then 1
            else 0
          end,
          email_enabled = 0,
          max_enabled = 0;
      `,
    ],
  },
  {
    id: "058_navigation_order",
    statements: [
      `
      create table if not exists app_navigation_settings (
        setting_key varchar(80) not null primary key,
        navigation_order json not null,
        updated_at timestamp(3) not null default current_timestamp(3)
          on update current_timestamp(3)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      insert into app_navigation_settings (setting_key, navigation_order)
      values (
        'left_rail',
        json_array(
          'business.overview',
          'business.dispatcher',
          'business.work',
          'business.production_plan',
          'business.refractory_shop',
          'business.laboratory_results',
          'business.laboratory_review',
          'business.board_assignments',
          'business.settings',
          'business.user_actions',
          'business.dispatcher_form',
          'admin.account_preview',
          'admin.accounts',
          'admin.navigation',
          'admin.user_actions',
          'admin.database'
        )
      )
      on duplicate key update setting_key = values(setting_key);
      `,
      addPositionJsonValue(
        "navigation_items",
        "admin.navigation",
        "id = 'administrator'",
      ),
      addPositionJsonValue(
        "capabilities",
        "platform.manage_navigation_order",
        "id = 'administrator'",
      ),
      `
      update account_accesses accesses
      join account_positions positions on positions.id = accesses.position_code
      set accesses.navigation_items = positions.navigation_items,
          accesses.capabilities = positions.capabilities
      where positions.id = 'administrator';
      `,
      `
      delete sessions
      from auth_sessions sessions
      join account_accesses accesses on accesses.user_id = sessions.user_id
      where accesses.position_code = 'administrator';
      `,
    ],
  },
  {
    id: "059_position_notification_permissions",
    statements: [
      `
      create table if not exists position_notification_permissions (
        position_code varchar(120) not null,
        notification_type varchar(64) not null,
        admin_enabled tinyint(1) not null default 0,
        updated_at timestamp(3) not null default current_timestamp(3)
          on update current_timestamp(3),
        primary key (position_code, notification_type),
        key idx_position_notification_permission (
          notification_type,
          admin_enabled
        ),
        constraint fk_position_notification_permissions_position
          foreign key (position_code) references account_positions(id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      insert into position_notification_permissions (
        position_code, notification_type, admin_enabled
      )
      select accesses.position_code, settings.notification_type, 1
      from user_notification_settings settings
      join account_accesses accesses
        on accesses.user_id = settings.user_id and accesses.is_active = 1
      join account_positions positions on positions.id = accesses.position_code
      where settings.admin_enabled = 1
      group by accesses.position_code, settings.notification_type
      on duplicate key update admin_enabled = 1;
      `,
      `
      alter table user_notification_settings
        drop index idx_user_notification_delivery;
      `,
      `
      alter table user_notification_settings drop column admin_enabled;
      `,
      `
      alter table user_notification_settings
        add key idx_user_notification_delivery (
          notification_type,
          email_enabled,
          max_enabled
        );
      `,
      `
      update user_notification_settings settings
      join account_accesses accesses
        on accesses.user_id = settings.user_id and accesses.is_active = 1
      left join position_notification_permissions permissions
        on permissions.position_code = accesses.position_code
        and permissions.notification_type = settings.notification_type
        and permissions.admin_enabled = 1
      set settings.email_enabled = 0, settings.max_enabled = 0
      where permissions.position_code is null
        and (settings.email_enabled = 1 or settings.max_enabled = 1);
      `,
    ],
  },
  {
    id: "060_refractory_wagon_turnover",
    statements: [
      `
      alter table refractory_wagons
        add column press_date date null after product_brand,
        add column piece_count int unsigned null after press_date,
        add column firing_operator varchar(120) null after press_operator,
        add column sorter_name varchar(120) null after firing_operator,
        add column post_firing_condition varchar(255) null after sorter_name,
        add column service_approval_date date null after post_firing_condition;
      `,
    ],
  },
  {
    id: "061_refractory_wagon_inspections",
    statements: [
      `
      create table if not exists refractory_wagon_inspections (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        wagon_id char(36) not null,
        condition_value varchar(64) not null,
        approval_date date not null,
        sorting_date date null,
        inspected_by_user_id varchar(120) not null,
        inspected_by_account_id varchar(120) not null,
        inspected_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        unique key uq_refractory_wagon_inspections_id (id),
        key idx_refractory_wagon_inspections_wagon (wagon_id, sequence_id),
        constraint chk_refractory_wagon_inspection_condition
          check (condition_value in ('Можно эксплуатировать', 'В ремонт')),
        constraint fk_refractory_wagon_inspection_wagon
          foreign key (wagon_id)
          references refractory_wagons (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      alter table laboratory_green_product_quality_journal
        add column press_date date null after product_brand,
        add column loading_date date null after press_operator,
        add column piece_count int unsigned null after loading_date;
      `,
    ],
  },
  {
    id: "062_sample_registration_transmission",
    statements: [
      `
      alter table laboratory_sample_registration_journal
        add column transmit_to_journal varchar(64) null,
        add column transmitted_record_id char(36) null,
        add constraint chk_laboratory_sample_registration_transmit_target
          check (
            transmit_to_journal is null
            or transmit_to_journal in (
              'unshaped_product_sample',
              'formed_product_sample',
              'verification'
            )
          );
      `,
      `
      alter table laboratory_unshaped_product_sample_journal
        add column source_sample_registration_id char(36) null,
        add constraint fk_laboratory_unshaped_product_sample_source
          foreign key (source_sample_registration_id)
          references laboratory_sample_registration_journal (id)
          on delete set null;
      `,
    ],
  },
  {
    id: "063_formed_product_sample_journal",
    statements: [
      `
      create table if not exists laboratory_formed_product_sample_journal (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        sorting_date date not null,
        sample_code varchar(120) not null,
        product_brand varchar(120) not null,
        source_sample_registration_id char(36) null,
        submitted_by_user_id varchar(120) not null,
        submitted_by_account_id varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        unique key uq_laboratory_formed_product_sample_id (id),
        key idx_laboratory_formed_product_sample_date (
          sorting_date,
          sequence_id
        ),
        key idx_laboratory_formed_product_sample_code (sample_code),
        key idx_laboratory_formed_product_sample_brand (product_brand),
        constraint fk_laboratory_formed_product_sample_source
          foreign key (source_sample_registration_id)
          references laboratory_sample_registration_journal (id)
          on delete set null
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists laboratory_formed_product_sample_revisions (
        id char(36) not null primary key,
        formed_product_sample_id char(36) not null,
        before_snapshot json not null,
        after_snapshot json not null,
        corrected_by_user_id varchar(120) not null,
        corrected_by_account_id varchar(120) not null,
        corrected_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_laboratory_formed_product_sample_revisions_sample (
          formed_product_sample_id,
          created_at
        ),
        constraint fk_laboratory_formed_product_sample_revision_sample
          foreign key (formed_product_sample_id)
          references laboratory_formed_product_sample_journal (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "064_verification_journal",
    statements: [
      `
      create table if not exists laboratory_verification_journal (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        verification_date date not null,
        product_name varchar(120) not null,
        sampling_location varchar(120) not null,
        sample_code varchar(120) not null,
        source_sample_registration_id char(36) null,
        submitted_by_user_id varchar(120) not null,
        submitted_by_account_id varchar(120) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        unique key uq_laboratory_verification_id (id),
        key idx_laboratory_verification_date (verification_date, sequence_id),
        key idx_laboratory_verification_code (sample_code),
        key idx_laboratory_verification_product (product_name),
        constraint fk_laboratory_verification_source
          foreign key (source_sample_registration_id)
          references laboratory_sample_registration_journal (id)
          on delete set null
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      create table if not exists laboratory_verification_revisions (
        id char(36) not null primary key,
        verification_id char(36) not null,
        before_snapshot json not null,
        after_snapshot json not null,
        corrected_by_user_id varchar(120) not null,
        corrected_by_account_id varchar(120) not null,
        corrected_by_display_name varchar(255) not null,
        created_at timestamp(3) not null default current_timestamp(3),
        key idx_laboratory_verification_revisions_record (
          verification_id,
          created_at
        ),
        constraint fk_laboratory_verification_revision_record
          foreign key (verification_id)
          references laboratory_verification_journal (id)
          on delete restrict
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
    ],
  },
  {
    id: "065_laboratory_raw_material_quality_measurement_tables",
    statements: [
      `
      alter table laboratory_raw_material_quality_journal
        add column clay_measurements json null,
        add column temper_measurements json null,
        add column slip_measurements json null,
        add column runner_measurements json null;
      `,
      `
      update laboratory_raw_material_quality_journal
      set clay_measurements = json_array(json_object(
        'measurementNumber', 1,
        'clayBrand', clay_brand,
        'disintegratorNumber', disintegrator_number,
        'moisture', clay_moisture,
        'sieveResidue3', null,
        'sievePass05', null
      ))
      where clay_measurements is null;
      `,
      `
      update laboratory_raw_material_quality_journal
      set temper_measurements = json_array(json_object(
        'measurementNumber', 1,
        'temperBrand', temper_brand,
        'ballMillNumber', null,
        'sieveResidue3', temper_sieve_residue_3,
        'sieveResidue2', temper_sieve_residue_2,
        'sieveResidue1', temper_sieve_residue_1,
        'sievePass05', temper_sieve_pass_05
      ))
      where temper_measurements is null;
      `,
      `
      update laboratory_raw_material_quality_journal
      set slip_measurements = json_array(json_object(
        'measurementNumber', 1,
        'mixerNumber', slip_mixer_number,
        'temperature', slip_temperature,
        'density', slip_density
      ))
      where slip_measurements is null;
      `,
      `
      update laboratory_raw_material_quality_journal
      set runner_measurements = json_array(json_object(
        'runnerNumber', runner_number,
        'chamottePercentage', charge_chamotte_percentage,
        'clayPercentage', charge_clay_percentage,
        'residue0063', charge_residue_0063,
        'moisture', charge_moisture,
        'isReserve', false
      ))
      where runner_measurements is null;
      `,
      `
      alter table laboratory_raw_material_quality_journal
        modify column clay_brand varchar(120) null,
        modify column clay_moisture varchar(120) null,
        modify column clay_grain_composition varchar(120) null,
        modify column disintegrator_number varchar(20) null,
        modify column temper_moisture varchar(120) null,
        modify column temper_grain_composition varchar(120) null,
        modify column temper_sieve_residue_1 varchar(120) null,
        modify column temper_sieve_residue_2 varchar(120) null,
        modify column temper_sieve_residue_3 varchar(120) null,
        modify column temper_sieve_pass_05 varchar(120) null,
        modify column temper_brand varchar(120) null,
        modify column temper_bulk_density varchar(120) null,
        modify column slip_mixer_number varchar(120) null,
        modify column slip_temperature varchar(120) null,
        modify column slip_density varchar(120) null,
        modify column runner_number varchar(120) null,
        modify column charge_chamotte_percentage varchar(120) null,
        modify column charge_clay_percentage varchar(120) null,
        modify column charge_residue_0063 varchar(120) null,
        modify column charge_moisture varchar(120) null,
        modify column elutriation_coefficient varchar(120) null,
        modify column recommendation_recipient varchar(40) null,
        modify column recommendation_text text null;
      `,
      `
      alter table laboratory_raw_material_quality_journal
        drop constraint chk_laboratory_raw_material_quality_shift;
      `,
      `
      alter table laboratory_raw_material_quality_journal
        add constraint chk_laboratory_raw_material_quality_shift
          check (shift_code in ('day', 'night', 'day_short'));
      `,
    ],
  },
  {
    id: "066_refractory_wagon_turnover_cycles",
    statements: [
      `
      create table if not exists refractory_wagon_catalog (
        sequence_id bigint unsigned not null auto_increment primary key,
        id char(36) not null,
        wagon_number varchar(120) not null,
        submitted_by_user_id varchar(120) null,
        submitted_by_account_id varchar(120) null,
        created_at timestamp(3) not null default current_timestamp(3),
        unique key uq_refractory_wagon_catalog_id (id),
        unique key uq_refractory_wagon_catalog_number (wagon_number)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
      `,
      `
      insert into refractory_wagon_catalog (
        id, wagon_number, submitted_by_user_id, submitted_by_account_id, created_at
      )
      select id, wagon_number, submitted_by_user_id, submitted_by_account_id, created_at
      from refractory_wagons;
      `,
      `
      alter table refractory_wagons
        add column catalog_wagon_id char(36) null after id;
      `,
      `
      update refractory_wagons set catalog_wagon_id = id
      where catalog_wagon_id is null;
      `,
      `
      alter table refractory_wagons
        modify column catalog_wagon_id char(36) not null,
        drop index uq_refractory_wagons_number,
        add key idx_refractory_wagons_number (wagon_number, sequence_id),
        add key idx_refractory_wagons_catalog_wagon (catalog_wagon_id),
        add constraint fk_refractory_wagons_catalog_wagon
          foreign key (catalog_wagon_id) references refractory_wagon_catalog (id)
            on delete restrict;
      `,
    ],
  },
  {
    id: "067_laboratory_green_product_quality_measurement_table",
    statements: [
      `
      alter table laboratory_green_product_quality_journal
        add column measurements json null;
      `,
      `
      update laboratory_green_product_quality_journal
      set measurements = json_array(json_object(
        'measurementNumber', 1,
        'lengthFirst', length_first,
        'lengthSecond', length_second,
        'widthFirst', width_first,
        'widthSecond', width_second,
        'heightFirst', height_first,
        'heightSecond', height_second,
        'weight', weight_value,
        'mechanicalStrength', mechanical_strength,
        'density', density_value
      ))
      where measurements is null;
      `,
      `
      alter table laboratory_green_product_quality_journal
        modify column length_first varchar(40) null,
        modify column length_second varchar(40) null,
        modify column width_first varchar(40) null,
        modify column width_second varchar(40) null,
        modify column height_first varchar(40) null,
        modify column height_second varchar(40) null,
        modify column weight_value varchar(40) null,
        modify column mechanical_strength varchar(40) null,
        modify column density_value varchar(40) null;
      `,
    ],
  },
  {
    id: "068_overview_visitors_capability",
    statements: [
      `
      update account_positions
      set capabilities = json_array_append(
        capabilities, '$', 'business.view_overview_visitors'
      )
      where json_contains(capabilities, json_quote('business.view_dispatcher_feed'))
        and not json_contains(
          capabilities, json_quote('business.view_overview_visitors')
        );
      `,
      `
      update account_accesses accesses
      join account_positions positions on positions.id = accesses.position_code
      set accesses.capabilities = positions.capabilities
      where json_contains(
        positions.capabilities, json_quote('business.view_overview_visitors')
      );
      `,
      `
      delete sessions
      from auth_sessions sessions
      join account_accesses accesses on accesses.user_id = sessions.user_id
      join account_positions positions on positions.id = accesses.position_code
      where json_contains(
        positions.capabilities, json_quote('business.view_overview_visitors')
      );
      `,
    ],
  },
  {
    id: "069_formed_product_sample_wagon_fields",
    statements: [
      `
      alter table laboratory_formed_product_sample_journal
        drop foreign key if exists fk_laboratory_formed_product_sample_source,
        drop key if exists idx_laboratory_formed_product_sample_code,
        drop column if exists sample_code,
        drop column if exists source_sample_registration_id,
        add column if not exists wagon_number varchar(120) null
          after sorting_date,
        add column if not exists molding_date date null after product_brand,
        add key if not exists idx_laboratory_formed_product_sample_wagon (
          wagon_number
        );
      `,
      `
      update laboratory_sample_registration_journal
      set transmit_to_journal = null
      where transmit_to_journal = 'formed_product_sample';
      `,
      `
      alter table laboratory_sample_registration_journal
        drop constraint if exists
          chk_laboratory_sample_registration_transmit_target;
      `,
      `
      alter table laboratory_sample_registration_journal
        add constraint chk_laboratory_sample_registration_transmit_target
          check (
            transmit_to_journal is null
            or transmit_to_journal in (
              'unshaped_product_sample',
              'verification'
            )
          );
      `,
    ],
  },
  {
    id: "070_formed_product_sample_registration_link",
    statements: [
      `
      alter table laboratory_formed_product_sample_journal
        add column if not exists sample_code varchar(120) null
          after wagon_number,
        add column if not exists source_sample_registration_id char(36) null
          after molding_date;
      `,
      `
      alter table laboratory_formed_product_sample_journal
        drop foreign key if exists fk_laboratory_formed_product_sample_source;
      `,
      `
      alter table laboratory_formed_product_sample_journal
        add constraint fk_laboratory_formed_product_sample_source
          foreign key (source_sample_registration_id)
          references laboratory_sample_registration_journal (id)
          on delete set null;
      `,
      `
      alter table laboratory_sample_registration_journal
        drop constraint if exists
          chk_laboratory_sample_registration_transmit_target;
      `,
      `
      alter table laboratory_sample_registration_journal
        add constraint chk_laboratory_sample_registration_transmit_target
          check (
            transmit_to_journal is null
            or transmit_to_journal in (
              'unshaped_product_sample',
              'formed_product_sample',
              'verification'
            )
          );
      `,
    ],
  },
];

function removePositionJsonValue(
  column: "navigation_items" | "capabilities",
  value: string,
  where: string,
) {
  return `
    update account_positions
    set ${column} = json_remove(
      ${column},
      json_unquote(json_search(${column}, 'one', '${value}'))
    )
    where ${where}
      and json_contains(${column}, json_quote('${value}'));
  `;
}

function addPositionJsonValue(
  column: "navigation_items" | "capabilities",
  value: string,
  where: string,
) {
  return `
    update account_positions
    set ${column} = json_array_append(${column}, '$', '${value}')
    where ${where}
      and not json_contains(${column}, json_quote('${value}'));
  `;
}

function buildInitialProductBrandInsert() {
  const values = initialProductBrandNames.map((name) => `(
    uuid(),
    ${sqlString(name)},
    ${sqlString(normalizeInitialProductBrandName(name))},
    'system-google-sheets-brand-import',
    'system-google-sheets-brand-import'
  )`).join(",\n");

  return `
    insert into product_brands (
      id,
      name,
      normalized_name,
      submitted_by_user_id,
      submitted_by_account_id
    ) values ${values}
    on duplicate key update name = values(name);
  `;
}

function normalizeInitialProductBrandName(name: string) {
  return name.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''").replaceAll("\\", "\\\\")}'`;
}

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
