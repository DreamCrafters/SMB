import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";

export type AdminDatabaseValueFormat =
  | "text"
  | "status"
  | "date"
  | "date_time"
  | "number";

export type AdminDatabaseColumn = {
  name: string;
  label: string;
  format: AdminDatabaseValueFormat;
  editable: boolean;
  multiline: boolean;
  nullable: boolean;
};

export type AdminDatabaseTable = {
  name: string;
  label: string;
  rowCount: number | null;
  columns: AdminDatabaseColumn[];
  primaryKey: string[];
  canDelete: boolean;
  canClear: boolean;
};

export type AdminDatabaseCellValue = string | null;

export type AdminDatabaseRow = {
  primaryKey: Record<string, AdminDatabaseCellValue>;
  values: Record<string, AdminDatabaseCellValue>;
};

export type AdminDatabaseTableRows = {
  table: AdminDatabaseTable;
  rows: AdminDatabaseRow[];
  limit: number;
  offset: number;
};

export type AdminDatabaseUpdate = {
  tableName: string;
  primaryKey: Record<string, AdminDatabaseCellValue>;
  values: Record<string, AdminDatabaseCellValue>;
};

export type AdminDatabaseDelete = {
  tableName: string;
  primaryKey: Record<string, AdminDatabaseCellValue>;
};

export type AdminDatabaseRepository = {
  listTables: () => Promise<AdminDatabaseTable[]>;
  listRows: (
    tableName: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ) => Promise<AdminDatabaseTableRows>;
  updateRow: (value: AdminDatabaseUpdate) => Promise<void>;
  deleteRow: (value: AdminDatabaseDelete) => Promise<void>;
  clearTable: (tableName: string) => Promise<number>;
};

type TableRow = RowDataPacket & {
  table_name: string;
  table_rows: number | string | null;
};

type RawDatabaseRow = RowDataPacket & Record<string, unknown>;

type AdminDatabaseViewColumn = AdminDatabaseColumn & {
  selectExpression: string;
  sourceColumn?: string;
  dataType: "text" | "json";
};

type AdminDatabasePrimaryKey = {
  name: string;
  selectExpression: string;
};

type AdminDatabaseView = {
  name: string;
  label: string;
  fromClause: string;
  orderBy: string;
  columns: AdminDatabaseViewColumn[];
  primaryKey: AdminDatabasePrimaryKey[];
  canDelete: boolean;
  canClear?: boolean;
};

const identifierPattern = /^[A-Za-z0-9_]+$/;
const primaryKeyAliasPrefix = "__admin_primary_key_";

const databaseViews: AdminDatabaseView[] = [
  {
    name: "account_accesses",
    label: "Доступы пользователей",
    fromClause: `
      account_accesses accesses
      left join app_users users on users.id = accesses.user_id
      left join account_positions positions on positions.id = accesses.position_code
      left join business_accounts businesses
        on businesses.id = accesses.business_account_id
      left join departments on departments.id = accesses.department_id
    `,
    orderBy: "users.display_name asc, positions.display_name asc, accesses.created_at asc",
    columns: [
      viewColumn("user_display_name", "Пользователь", "users.display_name"),
      viewColumn("login", "Логин", "users.login"),
      viewColumn("position", "Должность", "positions.display_name"),
      viewColumn(
        "workspace",
        "Кабинет",
        accountTypeLabelExpression("accesses.account_type"),
      ),
      viewColumn(
        "scope",
        "Область доступа",
        scopeLabelExpression("accesses.scope_kind"),
      ),
      viewColumn("business", "Бизнес", "businesses.display_name"),
      viewColumn("department", "Подразделение", "departments.display_name"),
      viewColumn(
        "access_status",
        "Доступ",
        "case when accesses.is_active = 1 then 'active' else 'disabled' end",
        { format: "status" },
      ),
      viewColumn("created_at", "Создан", "accesses.created_at", {
        format: "date_time",
      }),
      viewColumn("updated_at", "Изменён", "accesses.updated_at", {
        format: "date_time",
      }),
    ],
    primaryKey: [],
    canDelete: false,
  },
  {
    name: "account_positions",
    label: "Должности",
    fromClause: "account_positions positions",
    orderBy: "positions.display_name asc",
    columns: [
      viewColumn("display_name", "Должность", "positions.display_name"),
      viewColumn(
        "workspace",
        "Базовый кабинет",
        accountTypeLabelExpression("positions.account_type"),
      ),
      viewColumn("navigation", "Доступные вкладки", navigationLabelExpression()),
      viewColumn(
        "position_kind",
        "Тип",
        "case when positions.is_protected = 1 then 'Системная' else 'Пользовательская' end",
      ),
      viewColumn("created_at", "Создана", "positions.created_at", {
        format: "date_time",
      }),
      viewColumn("updated_at", "Изменена", "positions.updated_at", {
        format: "date_time",
      }),
    ],
    primaryKey: [],
    canDelete: false,
  },
  {
    name: "app_users",
    label: "Пользователи",
    fromClause: "app_users users",
    orderBy: "users.display_name asc, users.login asc",
    columns: [
      viewColumn("display_name", "Имя", "users.display_name"),
      viewColumn("login", "Логин", "users.login"),
      viewColumn("status", "Статус", "users.status", { format: "status" }),
      viewColumn("created_at", "Создан", "users.created_at", {
        format: "date_time",
      }),
      viewColumn("updated_at", "Изменён", "users.updated_at", {
        format: "date_time",
      }),
    ],
    primaryKey: [],
    canDelete: false,
  },
  {
    name: "auth_password_credentials",
    label: "Пароли пользователей",
    fromClause: `
      auth_password_credentials credentials
      inner join app_users users on users.id = credentials.user_id
    `,
    orderBy: "users.display_name asc, users.login asc",
    columns: [
      viewColumn("user_display_name", "Пользователь", "users.display_name"),
      viewColumn("login", "Логин", "users.login"),
      viewColumn(
        "password_updated_at",
        "Пароль обновлён",
        "credentials.password_updated_at",
        { format: "date_time" },
      ),
    ],
    primaryKey: [],
    canDelete: false,
  },
  {
    name: "auth_sessions",
    label: "Активные сессии",
    fromClause: `
      auth_sessions sessions
      inner join app_users users on users.id = sessions.user_id
      inner join account_accesses accesses on accesses.id = sessions.access_id
      left join account_positions positions on positions.id = accesses.position_code
    `,
    orderBy: "sessions.last_seen_at desc, sessions.created_at desc",
    columns: [
      viewColumn("user_display_name", "Пользователь", "users.display_name"),
      viewColumn("login", "Логин", "users.login"),
      viewColumn("position", "Должность", "positions.display_name"),
      viewColumn("created_at", "Создана", "sessions.created_at", {
        format: "date_time",
      }),
      viewColumn("last_seen_at", "Последняя активность", "sessions.last_seen_at", {
        format: "date_time",
        nullable: true,
      }),
      viewColumn("expires_at", "Истекает", "sessions.expires_at", {
        format: "date_time",
      }),
      viewColumn(
        "session_status",
        "Состояние",
        "case when sessions.expires_at > current_timestamp(3) then 'active' else 'expired' end",
        { format: "status" },
      ),
    ],
    primaryKey: [],
    canDelete: false,
  },
  {
    name: "business_accounts",
    label: "Бизнесы",
    fromClause: "business_accounts businesses",
    orderBy: "businesses.display_name asc",
    columns: [
      viewColumn("display_name", "Название", "businesses.display_name", {
        editable: true,
        sourceColumn: "display_name",
      }),
      viewColumn("status", "Статус", "businesses.status", {
        editable: true,
        sourceColumn: "status",
        format: "status",
      }),
      viewColumn("created_at", "Создан", "businesses.created_at", {
        format: "date_time",
      }),
      viewColumn("updated_at", "Изменён", "businesses.updated_at", {
        format: "date_time",
      }),
    ],
    primaryKey: [{ name: "id", selectExpression: "businesses.id" }],
    canDelete: false,
  },
  {
    name: "departments",
    label: "Подразделения",
    fromClause: `
      departments
      inner join business_accounts businesses
        on businesses.id = departments.business_account_id
      left join departments parent on parent.id = departments.parent_department_id
    `,
    orderBy: "businesses.display_name asc, departments.display_name asc",
    columns: [
      viewColumn("display_name", "Подразделение", "departments.display_name", {
        editable: true,
        sourceColumn: "display_name",
      }),
      viewColumn("business", "Бизнес", "businesses.display_name"),
      viewColumn("parent_department", "Родитель", "parent.display_name", {
        nullable: true,
      }),
      viewColumn(
        "structure_mode",
        "Структура",
        "departments.structure_mode",
        {
          editable: true,
          sourceColumn: "structure_mode",
          format: "status",
        },
      ),
      viewColumn("created_at", "Создано", "departments.created_at", {
        format: "date_time",
      }),
      viewColumn("updated_at", "Изменено", "departments.updated_at", {
        format: "date_time",
      }),
    ],
    primaryKey: [{ name: "id", selectExpression: "departments.id" }],
    canDelete: false,
  },
  {
    name: "dispatcher_equipment_report_revisions",
    label: "Изменения отчётов оборудования",
    fromClause: `
      dispatcher_equipment_report_revisions revisions
      left join business_accounts businesses
        on businesses.id = revisions.business_account_id
      left join account_accesses accesses
        on accesses.id = revisions.submitted_by_account_id
      left join app_users users on users.id = accesses.user_id
      left join account_positions positions on positions.id = accesses.position_code
    `,
    orderBy: "revisions.created_at desc",
    columns: [
      viewColumn("business", "Бизнес", "businesses.display_name"),
      viewColumn("report_date", "Дата отчёта", "revisions.report_date", {
        format: "date",
      }),
      viewColumn(
        "revision_status",
        "Изменение",
        "revisions.revision_status",
        { format: "status" },
      ),
      viewColumn(
        "equipment_count",
        "Позиций",
        "json_length(revisions.payload, '$.submissions')",
        { format: "number" },
      ),
      viewColumn("submitted_by", "Автор", "users.display_name"),
      viewColumn("position", "Должность", "positions.display_name"),
      viewColumn("created_at", "Изменено", "revisions.created_at", {
        format: "date_time",
      }),
    ],
    primaryKey: [],
    canDelete: false,
  },
  {
    name: "dispatcher_submissions",
    label: "Диспетчерские записи",
    fromClause: `
      dispatcher_submissions submissions
      left join business_accounts businesses
        on businesses.id = submissions.business_account_id
      left join account_accesses accesses
        on accesses.id = submissions.submitted_by_account_id
      left join app_users users on users.id = accesses.user_id
      left join account_positions positions on positions.id = accesses.position_code
    `,
    orderBy: "submissions.received_at desc, submissions.id desc",
    columns: [
      viewColumn("business", "Бизнес", "businesses.display_name"),
      viewColumn(
        "form",
        "Раздел",
        dispatcherFormLabelExpression("submissions.form_id"),
      ),
      viewColumn("event_date", "Дата события", dispatcherEventDateExpression(), {
        format: "date",
      }),
      viewColumn("summary", "Краткое описание", "submissions.summary", {
        editable: true,
        sourceColumn: "summary",
        multiline: true,
      }),
      viewColumn("comment", "Комментарий", "submissions.comment", {
        editable: true,
        sourceColumn: "comment",
        multiline: true,
        nullable: true,
      }),
      viewColumn("status", "Статус", "submissions.status", {
        editable: true,
        sourceColumn: "status",
        format: "status",
      }),
      viewColumn(
        "source",
        "Источник",
        "case when submissions.import_source_key is null then 'Форма' else 'Импорт' end",
      ),
      viewColumn("submitted_by", "Отправитель", "users.display_name"),
      viewColumn("position", "Должность", "positions.display_name"),
      viewColumn("submitted_at", "Отправлено", "submissions.submitted_at", {
        format: "date_time",
      }),
      viewColumn("received_at", "Получено", "submissions.received_at", {
        format: "date_time",
      }),
    ],
    primaryKey: [{ name: "id", selectExpression: "submissions.id" }],
    canDelete: true,
    canClear: true,
  },
  {
    name: "schema_migrations",
    label: "Версии схемы",
    fromClause: "schema_migrations migrations",
    orderBy: "migrations.applied_at desc, migrations.id desc",
    columns: [
      viewColumn("migration", "Версия", "migrations.id"),
      viewColumn("applied_at", "Применена", "migrations.applied_at", {
        format: "date_time",
      }),
    ],
    primaryKey: [],
    canDelete: false,
  },
];

const databaseViewByName = new Map(
  databaseViews.map((view) => [view.name, view]),
);

export function createAdminDatabaseRepository(
  pool: DatabasePool,
): AdminDatabaseRepository {
  async function listTables() {
    const [rows] = await pool.query<TableRow[]>(
      `
        select table_name, table_rows
        from information_schema.tables
        where table_schema = database()
          and table_type = 'BASE TABLE'
          and table_name in (${databaseViews.map(() => "?").join(", ")})
      `,
      databaseViews.map((view) => view.name),
    );
    const rowCountByName = new Map(
      rows.map((row) => [
        row.table_name,
        row.table_rows === null ? null : Number(row.table_rows),
      ]),
    );

    return databaseViews
      .filter((view) => rowCountByName.has(view.name))
      .map((view) => buildPublicTable(view, rowCountByName.get(view.name) ?? null));
  }

  async function listRows(
    tableName: string,
    {
      limit = 100,
      offset = 0,
    }: {
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const view = readView(tableName);
    const table = await readPublicTable(view);
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const safeOffset = Math.max(offset, 0);
    const selectColumns = [
      ...view.primaryKey.map(
        (column) =>
          `${column.selectExpression} as ${quoteIdentifier(primaryKeyAlias(column.name))}`,
      ),
      ...view.columns.map(
        (column) =>
          `${column.selectExpression} as ${quoteIdentifier(column.name)}`,
      ),
    ];
    const [rows] = await pool.query<RawDatabaseRow[]>(
      `
        select ${selectColumns.join(",\n          ")}
        from ${view.fromClause}
        order by ${view.orderBy}
        limit ?
        offset ?
      `,
      [safeLimit, safeOffset],
    );

    return {
      table,
      rows: rows.map((row) => mapDatabaseRow(row, view)),
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  async function updateRow(value: AdminDatabaseUpdate) {
    const view = readView(value.tableName);

    assertPrimaryKey(view, value.primaryKey);

    const columnByName = new Map(
      view.columns.map((column) => [column.name, column]),
    );
    const updateEntries = Object.entries(value.values).filter(([, rawValue]) =>
      rawValue !== undefined,
    );

    if (updateEntries.length === 0) {
      throw new Error("No editable values were provided.");
    }

    const assignments: string[] = [];
    const assignmentValues: unknown[] = [];

    for (const [columnName, rawValue] of updateEntries) {
      const column = columnByName.get(columnName);

      if (!column?.editable || column.sourceColumn === undefined) {
        throw new Error(`Column is not editable: ${columnName}`);
      }

      assignments.push(`${quoteIdentifier(column.sourceColumn)} = ?`);
      assignmentValues.push(normalizeDatabaseValue(rawValue, column));
    }

    await pool.query(
      `
        update ${quoteIdentifier(view.name)}
        set ${assignments.join(", ")}
        where ${buildPrimaryKeyWhereClause(view)}
      `,
      [...assignmentValues, ...readPrimaryKeyValues(view, value.primaryKey)],
    );
  }

  async function deleteRow(value: AdminDatabaseDelete) {
    const view = readView(value.tableName);

    if (!view.canDelete) {
      throw new Error(`Selected table does not allow deletion: ${view.name}`);
    }

    assertPrimaryKey(view, value.primaryKey);

    await pool.query(
      `
        delete from ${quoteIdentifier(view.name)}
        where ${buildPrimaryKeyWhereClause(view)}
        limit 1
      `,
      readPrimaryKeyValues(view, value.primaryKey),
    );
  }

  async function clearTable(tableName: string) {
    const view = readView(tableName);

    if (view.canClear !== true) {
      throw new Error(`Selected table does not allow clearing: ${view.name}`);
    }

    const [result] = await pool.query<ResultSetHeader>(
      `delete from ${quoteIdentifier(view.name)}`,
    );

    return result.affectedRows;
  }

  async function readPublicTable(view: AdminDatabaseView) {
    const [rows] = await pool.query<Array<RowDataPacket & { row_count: number | string }>>(
      `select count(*) as row_count from ${quoteIdentifier(view.name)}`,
    );

    return buildPublicTable(view, Number(rows[0]?.row_count ?? 0));
  }

  return {
    listTables,
    listRows,
    updateRow,
    deleteRow,
    clearTable,
  };
}

function buildPublicTable(view: AdminDatabaseView, rowCount: number | null) {
  return {
    name: view.name,
    label: view.label,
    rowCount,
    columns: view.columns.map(
      ({ name, label, format, editable, multiline, nullable }) => ({
        name,
        label,
        format,
        editable,
        multiline,
        nullable,
      }),
    ),
    primaryKey: view.primaryKey.map((column) => column.name),
    canDelete: view.canDelete,
    canClear: view.canClear === true,
  } satisfies AdminDatabaseTable;
}

function mapDatabaseRow(row: RawDatabaseRow, view: AdminDatabaseView) {
  return {
    primaryKey: Object.fromEntries(
      view.primaryKey.map((column) => [
        column.name,
        serializeDatabaseValue(row[primaryKeyAlias(column.name)]),
      ]),
    ),
    values: Object.fromEntries(
      view.columns.map((column) => [
        column.name,
        serializeDatabaseValue(row[column.name]),
      ]),
    ),
  };
}

function viewColumn(
  name: string,
  label: string,
  selectExpression: string,
  options: Partial<
    Pick<
      AdminDatabaseViewColumn,
      | "format"
      | "editable"
      | "multiline"
      | "nullable"
      | "sourceColumn"
      | "dataType"
    >
  > = {},
): AdminDatabaseViewColumn {
  return {
    name,
    label,
    selectExpression,
    format: options.format ?? "text",
    editable: options.editable ?? false,
    multiline: options.multiline ?? false,
    nullable: options.nullable ?? false,
    sourceColumn: options.sourceColumn,
    dataType: options.dataType ?? "text",
  };
}

function readView(tableName: string) {
  const view = databaseViewByName.get(tableName);

  if (view === undefined) {
    throw new Error("Unknown database view.");
  }

  return view;
}

function serializeDatabaseValue(value: unknown): AdminDatabaseCellValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function normalizeDatabaseValue(
  value: AdminDatabaseCellValue,
  column: AdminDatabaseViewColumn,
) {
  if (value === null) {
    if (!column.nullable) {
      throw new Error(`${column.name} cannot be null.`);
    }

    return null;
  }

  if (column.dataType === "json") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      throw new Error(`${column.name} must contain valid JSON.`);
    }
  }

  return value;
}

function assertPrimaryKey(
  view: AdminDatabaseView,
  primaryKey: Record<string, AdminDatabaseCellValue>,
) {
  if (view.primaryKey.length === 0) {
    throw new Error("Selected table does not allow row mutations.");
  }

  for (const column of view.primaryKey) {
    const value = primaryKey[column.name];

    if (value === undefined || value === null || value.length === 0) {
      throw new Error("Primary key value is missing.");
    }
  }
}

function buildPrimaryKeyWhereClause(view: AdminDatabaseView) {
  return view.primaryKey
    .map((column) => `${quoteIdentifier(column.name)} = ?`)
    .join(" and ");
}

function readPrimaryKeyValues(
  view: AdminDatabaseView,
  primaryKey: Record<string, AdminDatabaseCellValue>,
) {
  return view.primaryKey.map((column) => primaryKey[column.name]);
}

function primaryKeyAlias(columnName: string) {
  return `${primaryKeyAliasPrefix}${columnName}`;
}

function quoteIdentifier(value: string) {
  assertSafeIdentifier(value);

  return `\`${value}\``;
}

function assertSafeIdentifier(value: string) {
  if (!identifierPattern.test(value)) {
    throw new Error("Unsafe database identifier.");
  }
}

function accountTypeLabelExpression(column: string) {
  return `case ${column}
    when 'admin' then 'Администратор'
    when 'business_owner' then 'Руководитель'
    when 'dispatcher' then 'Диспетчер'
    when 'worker' then 'Работник'
    else ${column}
  end`;
}

function scopeLabelExpression(column: string) {
  return `case ${column}
    when 'platform' then 'Вся платформа'
    when 'business' then 'Весь бизнес'
    when 'department' then 'Подразделение'
    else ${column}
  end`;
}

function dispatcherFormLabelExpression(column: string) {
  return `case ${column}
    when 'equipment' then 'Оборудование'
    when 'incident' then 'Открытие инцидента'
    when 'incident_close' then 'Закрытие инцидента'
    when 'visitor_entry' then 'Вход посетителя'
    when 'visitor_exit' then 'Выход посетителя'
    else ${column}
  end`;
}

function dispatcherEventDateExpression() {
  return `coalesce(
    json_unquote(json_extract(submissions.payload, '$.reportDate')),
    json_unquote(json_extract(submissions.payload, '$.datetime')),
    json_unquote(json_extract(submissions.payload, '$.entryDatetime')),
    json_unquote(json_extract(submissions.payload, '$.exitDatetime')),
    submissions.period
  )`;
}

function navigationLabelExpression() {
  return `concat_ws(', ',
    if(json_contains(positions.navigation_items, json_quote('admin.account_preview')), 'Просмотр аккаунта', null),
    if(json_contains(positions.navigation_items, json_quote('admin.accounts')), 'Учётные записи', null),
    if(json_contains(positions.navigation_items, json_quote('admin.database')), 'БД', null),
    if(json_contains(positions.navigation_items, json_quote('admin.user_actions')), 'Действия пользователей', null),
    if(json_contains(positions.navigation_items, json_quote('business.overview')), 'Обзор', null),
    if(json_contains(positions.navigation_items, json_quote('business.dispatcher')), 'Диспетчерская', null),
    if(json_contains(positions.navigation_items, json_quote('business.work')), 'Работа', null),
    if(json_contains(positions.navigation_items, json_quote('business.dispatcher_form')), 'Форма', null)
  )`;
}
