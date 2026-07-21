export type ProductionBrandLabelInput = {
  label: string;
  normalizedLabel: string;
};

export type ProductionBrandLabelInputResult =
  | { ok: true; value: ProductionBrandLabelInput }
  | { ok: false; errors: string[] };

const productionBrandLabelMaxLength = 120;

export function normalizeProductionBrandLabelInput(
  label: unknown,
): ProductionBrandLabelInputResult {
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
      label: normalizedWhitespace,
      normalizedLabel: normalizedWhitespace.toLocaleLowerCase("ru-RU"),
    },
  };
}

export function normalizeProductionBrandLookupLabel(label: string) {
  return label.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}
