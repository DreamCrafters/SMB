import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import {
  getDispatcherFormDefinition,
  isDispatcherFormId,
  type DispatcherFormField,
} from "../domain/dispatcherForms.js";
import {
  buildDispatcherSubmissionDedupeKey,
  buildDispatcherSubmissionSummary,
  validateDispatcherSubmissionDraft,
  type DispatcherSubmissionPayload,
  type DispatcherSubmissionStatus,
} from "../domain/dispatcherSubmission.js";
import {
  buildDispatcherLegacyValues,
  recordEquipmentReportRevisionForDate,
} from "./dispatcherSubmissionsRepository.js";

export type AdminDatabaseValueFormat =
  | "text"
  | "status"
  | "date"
  | "date_time"
  | "number";

export type AdminDatabaseEditorInputType =
  | "text"
  | "textarea"
  | "select"
  | "number"
  | "date"
  | "month"
  | "datetime-local";

export type AdminDatabaseEditorOption = {
  value: string;
  label: string;
};

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

export type AdminDatabaseEditorField = {
  name: string;
  label: string;
  inputType: AdminDatabaseEditorInputType;
  required: boolean;
  options: AdminDatabaseEditorOption[];
  value: AdminDatabaseCellValue;
};

export type AdminDatabaseRow = {
  primaryKey: Record<string, AdminDatabaseCellValue>;
  values: Record<string, AdminDatabaseCellValue>;
  editorFields: AdminDatabaseEditorField[];
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
  changedByAccountId?: string;
};

export type AdminDatabaseDelete = {
  tableName: string;
  primaryKey: Record<string, AdminDatabaseCellValue>;
};

export type AdminDatabaseRepository = {
  listTables: () => Promise<AdminDatabaseTable[]>;
  listRows: (
    tableName: string,
    options?: { limit?: number; offset?: number },
  ) => Promise<AdminDatabaseTableRows>;
  updateRow: (value: AdminDatabaseUpdate) => Promise<void>;
  deleteRow: (value: AdminDatabaseDelete) => Promise<void>;
  clearTable: (tableName: string) => Promise<number>;
};

type RawDatabaseRow = RowDataPacket & Record<string, unknown>;

type AdminDatabaseViewColumn = AdminDatabaseColumn & {
  selectExpression: string;
  sourceColumn?: string;
  inputType: AdminDatabaseEditorInputType;
  options: readonly AdminDatabaseEditorOption[];
  maxLength?: number;
  writeValue?: (value: string) => unknown;
};

type AdminDatabasePrimaryKey = {
  name: string;
  selectExpression: string;
};

type AdminDatabaseContextColumn = {
  name: string;
  selectExpression: string;
};

type AdminDatabaseView = {
  name: string;
  label: string;
  fromClause: string;
  whereClause?: string;
  orderBy: string;
  columns: AdminDatabaseViewColumn[];
  primaryKey: AdminDatabasePrimaryKey[];
  contextColumns?: AdminDatabaseContextColumn[];
  canDelete: boolean;
  canClear?: boolean;
};

type DispatcherEditorRow = RowDataPacket & {
  business_account_id: string;
  form_id: string;
  payload: unknown;
  summary: string;
  status: string;
  period: string;
};

const identifierPattern = /^[A-Za-z0-9_]+$/;
const primaryKeyAliasPrefix = "__admin_primary_key_";
const contextAliasPrefix = "__admin_context_";
const userStatusOptions = options([
  ["active", "Активен"],
  ["suspended", "Вход отключён"],
]);
const businessStatusOptions = options([
  ["active", "Активен"],
  ["suspended", "Приостановлен"],
  ["archived", "Архивный"],
]);
const submissionStatusOptions = options([
  ["received", "Получено"],
  ["queued", "В очереди"],
  ["accepted", "Принято"],
  ["rejected", "Отклонено"],
]);

// Only user-facing, safely editable projections belong here. Authentication
// internals and append-only history stay in the database but are not shown.
const databaseViews: AdminDatabaseView[] = [
  {
    name: "app_users",
    label: "Пользователи",
    fromClause: "app_users users",
    whereClause: "users.status <> 'archived'",
    orderBy: "users.display_name asc, users.login asc",
    columns: [
      viewColumn("display_name", "Имя", "users.display_name", {
        editable: true,
        sourceColumn: "display_name",
        maxLength: 255,
      }),
      viewColumn("login", "Логин", "users.login", {
        editable: true,
        sourceColumn: "login",
        maxLength: 190,
      }),
      viewColumn("status", "Статус", "users.status", {
        editable: true,
        sourceColumn: "status",
        format: "status",
        inputType: "select",
        options: userStatusOptions,
      }),
      viewColumn("created_at", "Создан", "users.created_at", { format: "date_time" }),
      viewColumn("updated_at", "Изменён", "users.updated_at", { format: "date_time" }),
    ],
    primaryKey: [{ name: "id", selectExpression: "users.id" }],
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
        maxLength: 255,
      }),
      viewColumn("status", "Статус", "businesses.status", {
        editable: true,
        sourceColumn: "status",
        format: "status",
        inputType: "select",
        options: businessStatusOptions,
      }),
      viewColumn("created_at", "Создан", "businesses.created_at", { format: "date_time" }),
      viewColumn("updated_at", "Изменён", "businesses.updated_at", { format: "date_time" }),
    ],
    primaryKey: [{ name: "id", selectExpression: "businesses.id" }],
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
      viewColumn("form", "Раздел", dispatcherFormLabelExpression("submissions.form_id")),
      viewColumn("event_date", "Дата события", dispatcherEventDateExpression(), { format: "date" }),
      viewColumn("summary", "Краткое описание", "submissions.summary", { multiline: true }),
      viewColumn("status", "Статус", "submissions.status", {
        editable: true,
        sourceColumn: "status",
        format: "status",
        inputType: "select",
        options: submissionStatusOptions,
      }),
      viewColumn(
        "source",
        "Источник",
        "case when submissions.import_source_key is null then 'Форма' else 'Импорт' end",
      ),
      viewColumn("submitted_by", "Отправитель", "users.display_name", { nullable: true }),
      viewColumn("position", "Должность", "positions.display_name", { nullable: true }),
      viewColumn("submitted_at", "Отправлено", "submissions.submitted_at", { format: "date_time" }),
      viewColumn("received_at", "Получено", "submissions.received_at", { format: "date_time" }),
    ],
    primaryKey: [{ name: "id", selectExpression: "submissions.id" }],
    contextColumns: [
      { name: "form_id", selectExpression: "submissions.form_id" },
      { name: "payload", selectExpression: "submissions.payload" },
      { name: "status", selectExpression: "submissions.status" },
    ],
    canDelete: false,
    canClear: false,
  },
];

const databaseViewByName = new Map(databaseViews.map((view) => [view.name, view]));

export function createAdminDatabaseRepository(pool: DatabasePool): AdminDatabaseRepository {
  async function listTables() {
    return Promise.all(databaseViews.map((view) => readPublicTable(view)));
  }

  async function listRows(
    tableName: string,
    { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {},
  ) {
    const view = readView(tableName);
    const table = await readPublicTable(view);
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const safeOffset = Math.max(offset, 0);
    const selectColumns = [
      ...view.primaryKey.map(
        (column) => `${column.selectExpression} as ${quoteIdentifier(primaryKeyAlias(column.name))}`,
      ),
      ...view.columns.map(
        (column) => `${column.selectExpression} as ${quoteIdentifier(column.name)}`,
      ),
      ...(view.contextColumns ?? []).map(
        (column) => `${column.selectExpression} as ${quoteIdentifier(contextAlias(column.name))}`,
      ),
    ];
    const [rows] = await pool.query<RawDatabaseRow[]>(
      `
        select ${selectColumns.join(",\n          ")}
        from ${view.fromClause}
        ${view.whereClause === undefined ? "" : `where ${view.whereClause}`}
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

    if (view.name === "dispatcher_submissions") {
      await updateDispatcherSubmission(pool, value);
      return;
    }

    if (view.name === "app_users") {
      await assertUserIsEditable(pool, value.primaryKey.id);
    }

    const columnByName = new Map(view.columns.map((column) => [column.name, column]));
    const updateEntries = Object.entries(value.values).filter(([, rawValue]) => rawValue !== undefined);

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
      `update ${quoteIdentifier(view.name)}
       set ${assignments.join(", ")}
       where ${buildPrimaryKeyWhereClause(view)}`,
      [...assignmentValues, ...readPrimaryKeyValues(view, value.primaryKey)],
    );

    const id = value.primaryKey.id;

    if (typeof id === "string" && view.name === "app_users") {
      await pool.query("delete from auth_sessions where user_id = ?", [id]);
    }

    if (
      typeof id === "string" &&
      view.name === "business_accounts" &&
      value.values.status !== undefined
    ) {
      await pool.query(
        `delete sessions from auth_sessions sessions
         join account_accesses accesses on accesses.user_id = sessions.user_id
         where accesses.business_account_id = ?`,
        [id],
      );
    }
  }

  async function deleteRow(value: AdminDatabaseDelete) {
    const view = readView(value.tableName);

    if (!view.canDelete) {
      throw new Error(`Selected table does not allow deletion: ${view.name}`);
    }

    assertPrimaryKey(view, value.primaryKey);
    await pool.query(
      `delete from ${quoteIdentifier(view.name)}
       where ${buildPrimaryKeyWhereClause(view)}
       limit 1`,
      readPrimaryKeyValues(view, value.primaryKey),
    );
  }

  async function clearTable(tableName: string) {
    const view = readView(tableName);

    if (view.canClear !== true) {
      throw new Error(`Selected table does not allow clearing: ${view.name}`);
    }

    const [result] = await pool.query<ResultSetHeader>(`delete from ${quoteIdentifier(view.name)}`);
    return result.affectedRows;
  }

  async function readPublicTable(view: AdminDatabaseView) {
    const [rows] = await pool.query<Array<RowDataPacket & { row_count: number | string }>>(
      `select count(*) as row_count from ${view.fromClause}
       ${view.whereClause === undefined ? "" : `where ${view.whereClause}`}`,
    );

    return buildPublicTable(view, Number(rows[0]?.row_count ?? 0));
  }

  return { listTables, listRows, updateRow, deleteRow, clearTable };
}

async function assertUserIsEditable(
  pool: DatabasePool,
  id: AdminDatabaseCellValue | undefined,
) {
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Primary key value is missing.");
  }

  const [rows] = await pool.query<Array<RowDataPacket & { status: string }>>(
    "select status from app_users where id = ? limit 1 for update",
    [id],
  );
  const status = rows[0]?.status;

  if (status === undefined) {
    throw new Error("User was not found.");
  }

  if (status === "archived") {
    throw new Error("Archived user cannot be changed from the database editor.");
  }
}

async function updateDispatcherSubmission(
  pool: DatabasePool,
  value: AdminDatabaseUpdate,
) {
  const id = value.primaryKey.id;

  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Primary key value is missing.");
  }

  const [rows] = await pool.query<DispatcherEditorRow[]>(
    `select business_account_id, form_id, payload, summary, status, period
     from dispatcher_submissions
     where id = ?
     limit 1`,
    [id],
  );
  const current = rows[0];

  if (current === undefined) {
    throw new Error("Dispatcher submission was not found.");
  }

  const form = isDispatcherFormId(current.form_id)
    ? getDispatcherFormDefinition(current.form_id)
    : undefined;
  const existingPayload = readDispatcherPayload(current.payload);
  const allowedPayloadNames = new Set(
    form?.fields
      .filter((field) => isEditableDispatcherPayloadField(form.id, field.name))
      .map((field) => `payload.${field.name}`) ?? [],
  );

  if (form?.id === "visitor_exit") {
    allowedPayloadNames.add("payload.fio");
    allowedPayloadNames.add("payload.organization");
    allowedPayloadNames.add("payload.note");
  }

  const entries = Object.entries(value.values).filter(([, rawValue]) => rawValue !== undefined);

  if (entries.length === 0) {
    throw new Error("No editable values were provided.");
  }

  for (const [name] of entries) {
    if (name !== "status" && !allowedPayloadNames.has(name)) {
      throw new Error(`Column is not editable: ${name}`);
    }
  }

  const requestedStatus = value.values.status;
  const status = requestedStatus === undefined
    ? readSubmissionStatus(current.status)
    : readOptionValue(requestedStatus, submissionStatusOptions, "status");
  const hasPayloadChanges = entries.some(([name]) => name.startsWith("payload."));
  let nextPayload = { ...existingPayload };

  if (hasPayloadChanges) {
    if (form === undefined) {
      throw new Error("Stored dispatcher form is not editable.");
    }

    const editablePayload = Object.fromEntries(
      form.fields.flatMap((field) => {
        const raw = value.values[`payload.${field.name}`];
        const currentValue = toDispatcherEditorValue(existingPayload[field.name], field);
        const nextValue = raw === undefined ? currentValue : raw;

        return typeof nextValue === "string" && nextValue.trim().length > 0
          ? [[field.name, nextValue] as const]
          : [];
      }),
    );
    const validation = validateDispatcherSubmissionDraft({
      businessAccountId: current.business_account_id,
      formId: form.id,
      payload: editablePayload,
    });

    if (!validation.ok) {
      throw new Error(validation.errors.join(" "));
    }

    for (const field of form.fields) {
      delete nextPayload[field.name];
    }

    nextPayload = { ...nextPayload, ...validation.value.draft.payload };

    if (form.id === "visitor" && existingPayload.entryAt !== undefined) {
      nextPayload.entryAt = existingPayload.entryAt;
    }

    if (form.id === "visitor_exit" && existingPayload.exitAt !== undefined) {
      nextPayload.exitAt = existingPayload.exitAt;
    }

    if (form.id === "visitor_exit") {
      for (const name of ["fio", "organization", "note"] as const) {
        const raw = value.values[`payload.${name}`];

        if (raw === undefined) continue;
        if (raw === null || raw.trim().length === 0) delete nextPayload[name];
        else if (raw.trim().length > (name === "note" ? 2_000 : 240)) {
          throw new Error(`${name} is too long.`);
        } else nextPayload[name] = raw.trim();
      }

      if ((nextPayload.fio ?? "").trim().length === 0) {
        throw new Error("fio is required.");
      }
    }
  }

  const summary = form === undefined
    ? current.summary
    : buildDispatcherSubmissionSummary(form, nextPayload);
  const dedupeKey = isDispatcherFormId(current.form_id)
    ? buildDispatcherSubmissionDedupeKey({
        businessAccountId: current.business_account_id,
        formId: current.form_id,
        payload: nextPayload,
      })
    : null;
  const legacy = buildDispatcherLegacyValues(
    nextPayload,
    current.form_id,
    summary,
    current.period,
  );

  await pool.query(
    `update dispatcher_submissions
     set period = ?, metric_code = ?, raw_value = ?, comment = ?,
       payload = ?, summary = ?, dedupe_key = ?, status = ?
     where id = ?`,
    [
      legacy.period,
      legacy.metricCode,
      legacy.rawValue,
      legacy.comment,
      JSON.stringify(nextPayload),
      summary,
      dedupeKey,
      status,
      id,
    ],
  );

  if (form?.id === "equipment" && hasPayloadChanges) {
    const reportDate = nextPayload.reportDate?.trim();
    const submittedByAccountId = value.changedByAccountId?.trim();

    if (reportDate === undefined || reportDate.length === 0) {
      throw new Error("Equipment report date is missing.");
    }
    if (submittedByAccountId === undefined || submittedByAccountId.length === 0) {
      throw new Error("Equipment report editor account is missing.");
    }

    await recordEquipmentReportRevisionForDate(pool, {
      businessAccountId: current.business_account_id,
      reportDate,
      submittedByAccountId,
    });
  }
}

function buildPublicTable(view: AdminDatabaseView, rowCount: number | null) {
  return {
    name: view.name,
    label: view.label,
    rowCount,
    columns: view.columns.map(
      ({ name, label, format, editable, multiline, nullable }) => ({
        name, label, format, editable, multiline, nullable,
      }),
    ),
    primaryKey: view.primaryKey.map((column) => column.name),
    canDelete: view.canDelete,
    canClear: view.canClear === true,
  } satisfies AdminDatabaseTable;
}

function mapDatabaseRow(row: RawDatabaseRow, view: AdminDatabaseView): AdminDatabaseRow {
  return {
    primaryKey: Object.fromEntries(
      view.primaryKey.map((column) => [
        column.name,
        serializeDatabaseValue(row[primaryKeyAlias(column.name)]),
      ]),
    ),
    values: Object.fromEntries(
      view.columns.map((column) => [column.name, serializeDatabaseValue(row[column.name])]),
    ),
    editorFields: view.name === "dispatcher_submissions"
      ? buildDispatcherEditorFields(row)
      : view.columns
          .filter((column) => column.editable)
          .map((column) => ({
            name: column.name,
            label: column.label,
            inputType: column.inputType,
            required: !column.nullable,
            options: [...column.options],
            value: serializeDatabaseValue(row[column.name]),
          })),
  };
}

function buildDispatcherEditorFields(row: RawDatabaseRow): AdminDatabaseEditorField[] {
  const formIdValue = row[contextAlias("form_id")];
  const formId = isDispatcherFormId(formIdValue) ? formIdValue : undefined;
  const form = formId === undefined ? undefined : getDispatcherFormDefinition(formId);
  const payload = readDispatcherPayload(row[contextAlias("payload")]);
  const fields = form?.id === "visitor_exit"
    ? [
        dispatcherEditorField("fio", "ФИО посетителя", "text", true, payload.fio),
        dispatcherEditorField("organization", "Организация", "text", false, payload.organization),
        dispatcherEditorField("note", "Примечание", "textarea", false, payload.note),
      ]
    : (form?.fields ?? [])
      .filter((field) => isEditableDispatcherPayloadField(form?.id, field.name))
      .map((field) => ({
        name: `payload.${field.name}`,
        label: field.label,
        inputType: toAdminEditorInputType(field),
        required: field.required,
        options: (field.options ?? []).map((item) => ({ value: item, label: item })),
        value: toDispatcherEditorValue(payload[field.name], field),
      }));

  return [
    ...fields,
    {
      name: "status",
      label: "Статус записи",
      inputType: "select",
      required: true,
      options: [...submissionStatusOptions],
      value: serializeDatabaseValue(row[contextAlias("status")]),
    },
  ];
}

function isEditableDispatcherPayloadField(
  formId: string | undefined,
  fieldName: string,
) {
  if (formId === "equipment") {
    return fieldName !== "reportDate" && fieldName !== "equipment";
  }

  if (formId === "incident_close") {
    return fieldName !== "incidentNumber";
  }

  return formId !== "visitor_exit" || fieldName !== "visitorEntryId";
}

function dispatcherEditorField(
  name: string,
  label: string,
  inputType: AdminDatabaseEditorInputType,
  required: boolean,
  value: string | undefined,
): AdminDatabaseEditorField {
  return {
    name: `payload.${name}`,
    label,
    inputType,
    required,
    options: [],
    value: value ?? null,
  };
}

function viewColumn(
  name: string,
  label: string,
  selectExpression: string,
  optionsValue: Partial<Pick<
    AdminDatabaseViewColumn,
    | "format"
    | "editable"
    | "multiline"
    | "nullable"
    | "sourceColumn"
    | "inputType"
    | "options"
    | "maxLength"
    | "writeValue"
  >> = {},
): AdminDatabaseViewColumn {
  return {
    name,
    label,
    selectExpression,
    format: optionsValue.format ?? "text",
    editable: optionsValue.editable ?? false,
    multiline: optionsValue.multiline ?? false,
    nullable: optionsValue.nullable ?? false,
    sourceColumn: optionsValue.sourceColumn,
    inputType: optionsValue.inputType ?? (optionsValue.multiline ? "textarea" : "text"),
    options: optionsValue.options ?? [],
    maxLength: optionsValue.maxLength,
    writeValue: optionsValue.writeValue,
  };
}

function readView(tableName: string) {
  const view = databaseViewByName.get(tableName);
  if (view === undefined) throw new Error("Unknown database view.");
  return view;
}

function serializeDatabaseValue(value: unknown): AdminDatabaseCellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeDatabaseValue(
  value: AdminDatabaseCellValue,
  column: AdminDatabaseViewColumn,
) {
  if (value === null || value.trim().length === 0) {
    if (!column.nullable) throw new Error(`${column.name} cannot be empty.`);
    return null;
  }

  const normalized = value.trim();
  if (column.maxLength !== undefined && normalized.length > column.maxLength) {
    throw new Error(`${column.name} is too long.`);
  }
  if (column.options.length > 0) {
    readOptionValue(normalized, column.options, column.name);
  }

  return column.writeValue?.(normalized) ?? normalized;
}

function readOptionValue(
  value: AdminDatabaseCellValue,
  allowed: readonly AdminDatabaseEditorOption[],
  name: string,
) {
  if (typeof value !== "string" || !allowed.some((option) => option.value === value)) {
    throw new Error(`${name} has an unsupported value.`);
  }
  return value;
}

function assertPrimaryKey(
  view: AdminDatabaseView,
  primaryKey: Record<string, AdminDatabaseCellValue>,
) {
  if (view.primaryKey.length === 0) throw new Error("Selected table does not allow row mutations.");
  for (const column of view.primaryKey) {
    const value = primaryKey[column.name];
    if (value === undefined || value === null || value.length === 0) {
      throw new Error("Primary key value is missing.");
    }
  }
}

function buildPrimaryKeyWhereClause(view: AdminDatabaseView) {
  return view.primaryKey.map((column) => `${quoteIdentifier(column.name)} = ?`).join(" and ");
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

function contextAlias(columnName: string) {
  return `${contextAliasPrefix}${columnName}`;
}

function quoteIdentifier(value: string) {
  if (!identifierPattern.test(value)) throw new Error("Unsafe database identifier.");
  return `\`${value}\``;
}

function options(values: ReadonlyArray<readonly [string, string]>): AdminDatabaseEditorOption[] {
  return values.map(([value, label]) => ({ value, label }));
}

function readDispatcherPayload(value: unknown): DispatcherSubmissionPayload {
  if (typeof value === "string") {
    try {
      return readDispatcherPayload(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function toAdminEditorInputType(field: DispatcherFormField): AdminDatabaseEditorInputType {
  if (field.type === "integer") return "number";
  return field.type;
}

function toDispatcherEditorValue(
  value: string | undefined,
  field: DispatcherFormField,
): AdminDatabaseCellValue {
  if (value === undefined) return null;
  if (field.type === "date") return toIsoDate(value);
  if (field.type === "datetime-local") return toIsoDateTime(value);
  return value;
}

function toIsoDate(value: string) {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  return parts === null ? value : `${parts[3]}-${parts[2]}-${parts[1]}`;
}

function toIsoDateTime(value: string) {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/.exec(value);
  return parts === null ? value : `${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}:${parts[5]}`;
}

function readSubmissionStatus(value: string): DispatcherSubmissionStatus {
  return readOptionValue(value, submissionStatusOptions, "status") as DispatcherSubmissionStatus;
}

function dispatcherFormLabelExpression(column: string) {
  return `case ${column}
    when 'equipment' then 'Оборудование'
    when 'incident' then 'Открытие инцидента'
    when 'incident_close' then 'Закрытие инцидента'
    when 'visitor' then 'Вход посетителя'
    when 'visitor_exit' then 'Выход посетителя'
    else ${column}
  end`;
}

function dispatcherEventDateExpression() {
  return `coalesce(
    json_unquote(json_extract(submissions.payload, '$.reportDate')),
    json_unquote(json_extract(submissions.payload, '$.datetime')),
    json_unquote(json_extract(submissions.payload, '$.entryAt')),
    json_unquote(json_extract(submissions.payload, '$.exitAt')),
    submissions.period
  )`;
}
