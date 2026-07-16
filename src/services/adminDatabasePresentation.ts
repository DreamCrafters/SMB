import type {
  AdminDatabaseCellValue,
  AdminDatabaseValueFormat,
} from "../contracts/adminDatabase";

const adminDatabaseStatusLabels: Record<string, string> = {
  active: "Активен",
  suspended: "Вход отключён",
  archived: "Архивный",
  disabled: "Отключён",
  expired: "Истекла",
  received: "Получено",
  queued: "В очереди",
  accepted: "Принято",
  rejected: "Отклонено",
  updated: "Изменено",
  created: "Создано",
  current: "Текущая",
  classic: "Классическая",
};

export function formatAdminDatabaseCellValue(
  value: AdminDatabaseCellValue | undefined,
  format: AdminDatabaseValueFormat,
) {
  if (value === null || value === undefined) {
    return "—";
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length === 0) {
    return "—";
  }

  if (format === "status") {
    return adminDatabaseStatusLabels[normalized] ?? normalized;
  }

  if (format === "date_time") {
    const date = new Date(normalized);

    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
    }
  }

  if (format === "date") {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(normalized);

    if (dateOnlyMatch !== null) {
      return `${dateOnlyMatch[3]}.${dateOnlyMatch[2]}.${dateOnlyMatch[1]}`;
    }
  }

  return normalized.length > 180
    ? `${normalized.slice(0, 177)}...`
    : normalized;
}

export function hasAdminDatabaseRowActions(table: {
  primaryKey: string[];
  canDelete: boolean;
  columns: Array<{ editable: boolean }>;
}) {
  return (
    table.primaryKey.length > 0 &&
    (table.canDelete || table.columns.some((column) => column.editable))
  );
}
