export const productionBrandCategories = [
  "product",
  "unformed",
  "chamotte",
] as const;

export type ProductionBrandCategory =
  (typeof productionBrandCategories)[number];

export type ProductionBrandLabelInput = {
  category: ProductionBrandCategory;
  label: string;
  normalizedLabel: string;
};

export type ProductionBrandLabelInputResult =
  | { ok: true; value: ProductionBrandLabelInput }
  | { ok: false; errors: string[] };

const productionBrandLabelMaxLength = 120;

export function normalizeProductionBrandLabelInput(
  category: unknown,
  label: unknown,
): ProductionBrandLabelInputResult {
  if (!isProductionBrandCategory(category)) {
    return { ok: false, errors: ["Выберите справочник марок."] };
  }

  if (typeof label !== "string") {
    return { ok: false, errors: ["Введите название марки."] };
  }

  const normalizedWhitespace = label.trim().replace(/\s+/gu, " ");

  if (normalizedWhitespace.length === 0) {
    return { ok: false, errors: ["Введите название марки."] };
  }

  if (normalizedWhitespace.length > productionBrandLabelMaxLength) {
    return {
      ok: false,
      errors: [
        `Название марки должно быть не длиннее ${productionBrandLabelMaxLength} символов.`,
      ],
    };
  }

  return {
    ok: true,
    value: {
      category,
      label: normalizedWhitespace,
      normalizedLabel: normalizedWhitespace.toLocaleLowerCase("ru-RU"),
    },
  };
}

export function isProductionBrandCategory(
  value: unknown,
): value is ProductionBrandCategory {
  return productionBrandCategories.includes(
    value as ProductionBrandCategory,
  );
}

export function normalizeProductionBrandLookupLabel(label: string) {
  return label.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}
