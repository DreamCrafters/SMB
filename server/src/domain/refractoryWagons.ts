import type { RefractoryWagonSubmission } from "../contracts/refractoryWagons.js";

export type RefractoryWagonValidation =
  | { ok: true; value: RefractoryWagonSubmission }
  | { ok: false; errors: string[] };

const maxWagonNumberLength = 120;
const maxProductBrandLength = 160;
const maxEmployeeNameLength = 120;
const maxWagonConditionLength = 255;
const maxPieceCount = 1_000_000;

export function validateRefractoryWagonSubmission(
  input: unknown,
): RefractoryWagonValidation {
  if (!isRecord(input)) {
    return { ok: false, errors: ["Передайте данные вагона."] };
  }

  const number = readText(input.number, maxWagonNumberLength);
  const loadingDate = readCalendarDate(input.loadingDate);
  const productBrand = readText(input.productBrand, maxProductBrandLength);
  const pressDate = readNullableCalendarDate(input.pressDate);
  const pieceCount = readNullableCount(input.pieceCount);
  const setter = readNullableText(input.setter, maxEmployeeNameLength);
  const pressOperator = readNullableText(input.pressOperator, maxEmployeeNameLength);
  const firingOperator = readNullableText(
    input.firingOperator,
    maxEmployeeNameLength,
  );
  const sorter = readNullableText(input.sorter, maxEmployeeNameLength);
  const postFiringCondition = readNullableText(
    input.postFiringCondition,
    maxWagonConditionLength,
  );
  const serviceApprovalDate = readNullableCalendarDate(input.serviceApprovalDate);
  const errors: string[] = [];

  if (number === undefined) errors.push("Проверьте поле «№ вагона».");
  if (loadingDate === undefined) errors.push("Проверьте поле «Дата садки».");
  if (productBrand === undefined) errors.push("Проверьте поле «Марка».");
  if (pressDate === undefined) errors.push("Проверьте поле «Дата пресса».");
  if (pieceCount === undefined) errors.push("Проверьте поле «Кол-во шт.».");
  if (setter === undefined) errors.push("Проверьте поле «Садчик».");
  if (pressOperator === undefined) errors.push("Проверьте поле «Прессовщик».");
  if (firingOperator === undefined) errors.push("Проверьте поле «Обжигальщик».");
  if (sorter === undefined) errors.push("Проверьте поле «Сортировщик».");
  if (postFiringCondition === undefined) {
    errors.push("Проверьте поле «Состояние вагона после обжига».");
  }
  if (serviceApprovalDate === undefined) {
    errors.push("Проверьте поле «Дата одобрения на продолжение эксплуатации».");
  }

  return errors.length > 0
    ? { ok: false, errors }
    : {
        ok: true,
        value: {
          number: number!,
          loadingDate: loadingDate!,
          productBrand: productBrand!,
          pressDate: pressDate!,
          pieceCount: pieceCount!,
          setter: setter!,
          pressOperator: pressOperator!,
          firingOperator: firingOperator!,
          sorter: sorter!,
          postFiringCondition: postFiringCondition!,
          serviceApprovalDate: serviceApprovalDate!,
        },
      };
}

function readText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : undefined;
}

function readNullableText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length === 0) return null;
  return normalized.length <= maxLength ? normalized : undefined;
}

function readNullableCount(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length === 0) return null;
    if (!/^\d+$/u.test(normalized)) return undefined;
    const parsed = Number(normalized);
    return parsed <= maxPieceCount ? parsed : undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value >= 0 && value <= maxPieceCount ? value : undefined;
}

function readCalendarDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return undefined;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ? value
    : undefined;
}

function readNullableCalendarDate(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim().length === 0) return null;
  return readCalendarDate(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
