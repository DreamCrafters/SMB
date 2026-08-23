import {
  rawMaterialNomenclatureFields,
  type RawMaterialNomenclatureSubmission,
} from "../contracts/rawMaterialNomenclature.js";
import { normalizeProductionBrandLabelInput } from "./productionBrand.js";

export type ValidatedRawMaterialNomenclatureSubmission =
  RawMaterialNomenclatureSubmission & {
    normalizedName: string;
  };

export type RawMaterialNomenclatureValidation =
  | { ok: true; value: ValidatedRawMaterialNomenclatureSubmission }
  | { ok: false; errors: string[] };

/**
 * Доработка задачи 95: сырьё проверяется теми же правилами, что и марка —
 * наименование обязательно и нормализуется одним общим хелпером, остальные
 * характеристики необязательны и ограничены длиной поля.
 */
export function validateRawMaterialNomenclatureSubmission(
  payload: unknown,
): RawMaterialNomenclatureValidation {
  if (!isRecord(payload) || Array.isArray(payload)) {
    return { ok: false, errors: ["Передайте данные сырья."] };
  }

  const allowedFields = new Set(
    rawMaterialNomenclatureFields.map((field) => field.id),
  );
  if (Object.keys(payload).some((field) => !allowedFields.has(
    field as (typeof rawMaterialNomenclatureFields)[number]["id"],
  ))) {
    return { ok: false, errors: ["Запрос содержит неизвестные поля."] };
  }

  const name = normalizeProductionBrandLabelInput(payload.name);
  if (!name.ok) {
    return { ok: false, errors: ["Введите наименование сырья."] };
  }

  const values = {} as RawMaterialNomenclatureSubmission;
  const errors: string[] = [];

  for (const field of rawMaterialNomenclatureFields) {
    if (field.id === "name") {
      values.name = name.value.label;
      continue;
    }

    const rawValue = payload[field.id];
    if (typeof rawValue !== "string") {
      errors.push(`Поле «${field.label}» должно быть строкой.`);
      continue;
    }

    const value = rawValue.trim();
    if (value.length > field.maxLength) {
      errors.push(
        `Поле «${field.label}» должно быть не длиннее ${field.maxLength} символов.`,
      );
      continue;
    }
    values[field.id] = value;
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      ...values,
      normalizedName: name.value.normalizedLabel,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
