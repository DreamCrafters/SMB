/**
 * Момент времени для параметра SQL в колонку DATETIME/TIMESTAMP.
 *
 * Строка `toISOString()` (`2026-10-08T02:45:58.658Z`) проходит только в
 * нестрогом `sql_mode`: строгий режим MariaDB/MySQL отвергает суффикс `Z`.
 * Сессии backend-а работают в UTC (`time_zone = '+00:00'`), поэтому значение
 * передаётся в UTC без зоны: `2026-10-08 02:45:58.658`.
 */
export function toSqlDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date for an SQL DATETIME value.");
  }
  return date.toISOString().replace("T", " ").replace("Z", "");
}
