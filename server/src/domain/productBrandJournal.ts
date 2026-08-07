import {
  productBrandFields,
  type ProductBrandSubmission,
} from "../contracts/productBrands.js";
import { normalizeProductionBrandLabelInput } from "./productionBrand.js";

export type ValidatedProductBrandSubmission = ProductBrandSubmission & {
  normalizedName: string;
};

export type ProductBrandSubmissionValidation =
  | { ok: true; value: ValidatedProductBrandSubmission }
  | { ok: false; errors: string[] };

export function validateProductBrandSubmission(
  payload: unknown,
): ProductBrandSubmissionValidation {
  if (!isRecord(payload) || Array.isArray(payload)) {
    return { ok: false, errors: ["Передайте данные марки."] };
  }

  const allowedFields = new Set(productBrandFields.map((field) => field.id));
  if (Object.keys(payload).some((field) => !allowedFields.has(
    field as (typeof productBrandFields)[number]["id"],
  ))) {
    return { ok: false, errors: ["Запрос содержит неизвестные поля."] };
  }

  const name = normalizeProductionBrandLabelInput(payload.name);
  if (!name.ok) {
    return { ok: false, errors: ["Введите наименование марки."] };
  }

  const values = {} as ProductBrandSubmission;
  const errors: string[] = [];

  for (const field of productBrandFields) {
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
