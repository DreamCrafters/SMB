import type { RefractoryWagonSubmission } from "../contracts/refractoryWagons.js";

export type RefractoryWagonValidation =
  | { ok: true; value: RefractoryWagonSubmission }
  | { ok: false; errors: string[] };

const maxWagonNumberLength = 120;
const maxProductBrandLength = 160;
const maxEmployeeNameLength = 120;

export function validateRefractoryWagonSubmission(
  input: unknown,
): RefractoryWagonValidation {
  if (!isRecord(input)) {
    return { ok: false, errors: ["Передайте данные вагона."] };
  }

  const number = readText(input.number, maxWagonNumberLength);
  const loadingDate = readCalendarDate(input.loadingDate);
  const productBrand = readText(input.productBrand, maxProductBrandLength);
  const setter = readNullableText(input.setter, maxEmployeeNameLength);
  const pressOperator = readNullableText(input.pressOperator, maxEmployeeNameLength);
  const errors: string[] = [];

  if (number === undefined) errors.push("Проверьте поле «№ вагона».");
  if (loadingDate === undefined) errors.push("Проверьте поле «Дата садки».");
  if (productBrand === undefined) errors.push("Проверьте поле «Марка».");
  if (setter === undefined) errors.push("Проверьте поле «Садчик».");
  if (pressOperator === undefined) errors.push("Проверьте поле «Прессовщик».");

  return errors.length > 0
    ? { ok: false, errors }
    : {
        ok: true,
        value: {
          number: number!,
          loadingDate: loadingDate!,
          productBrand: productBrand!,
          setter: setter!,
          pressOperator: pressOperator!,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
