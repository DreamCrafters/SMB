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
