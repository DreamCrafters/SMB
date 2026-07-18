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

export type ProductionBrandReferenceRewrite = {
  payload: Record<string, unknown>;
  category: ProductionBrandCategory;
  sourceLabel: string;
  targetLabel: string;
  merge: boolean;
};

export type ProductionBrandReferenceRewriteResult = {
  payload: Record<string, unknown>;
  changed: boolean;
  combinedFacts: number;
};

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

export function rewriteProductionBrandReferences({
  payload,
  category,
  sourceLabel,
  targetLabel,
  merge,
}: ProductionBrandReferenceRewrite): ProductionBrandReferenceRewriteResult {
  const sourceKey = normalizeProductionBrandLookupLabel(sourceLabel);
  const targetKey = normalizeProductionBrandLookupLabel(targetLabel);
  const nextPayload = { ...payload };

  if (category === "product") {
    let changed = false;

    for (const fieldName of [
      "formingProductBrand",
      "sortingProductBrand",
      "formingProductBrands",
      "sortingProductBrands",
    ] as const) {
      const label = nextPayload[fieldName];

      if (
        typeof label === "string" &&
        normalizeProductionBrandLookupLabel(label) === sourceKey
      ) {
        nextPayload[fieldName] = targetLabel;
        changed = true;
      }
    }

    return { payload: nextPayload, changed, combinedFacts: 0 };
  }

  const sourceIndexes: number[] = [];
  const targetIndexes: number[] = [];

  for (let index = 1; index <= 50; index += 1) {
    const label = nextPayload[`${category}Brand${index}`];

    if (typeof label !== "string") continue;

    const key = normalizeProductionBrandLookupLabel(label);

    if (key === sourceKey) sourceIndexes.push(index);
    else if (key === targetKey) targetIndexes.push(index);
  }

  if (sourceIndexes.length === 0) {
    return { payload: nextPayload, changed: false, combinedFacts: 0 };
  }

  if (!merge || (targetIndexes.length === 0 && sourceIndexes.length === 1)) {
    for (const index of sourceIndexes) {
      nextPayload[`${category}Brand${index}`] = targetLabel;
    }

    return { payload: nextPayload, changed: true, combinedFacts: 0 };
  }

  const relatedIndexes = [...targetIndexes, ...sourceIndexes];
  const destinationIndex = targetIndexes[0] ?? sourceIndexes[0];
  const factValues = relatedIndexes.flatMap((index) => {
    const value = nextPayload[`${category}Fact${index}`];

    if (value === undefined) return [];
    if (typeof value !== "string") {
      throw new Error("Факт марки содержит некорректное число.");
    }

    return [value];
  });

  nextPayload[`${category}Brand${destinationIndex}`] = targetLabel;

  if (factValues.length === 0) {
    delete nextPayload[`${category}Fact${destinationIndex}`];
  } else {
    nextPayload[`${category}Fact${destinationIndex}`] = addDecimalValues(factValues);
  }

  for (const index of relatedIndexes) {
    if (index === destinationIndex) continue;
    delete nextPayload[`${category}Brand${index}`];
    delete nextPayload[`${category}Fact${index}`];
  }

  return {
    payload: nextPayload,
    changed: true,
    combinedFacts: Math.max(factValues.length - 1, 0),
  };
}

function addDecimalValues(values: string[]) {
  const parts = values.map((value) => {
    const match = /^(\d+)(?:\.(\d+))?$/u.exec(value.trim());

    if (match === null) {
      throw new Error("Факт марки содержит некорректное число.");
    }

    return {
      whole: match[1],
      fraction: match[2] ?? "",
    };
  });
  const scale = Math.max(...parts.map((part) => part.fraction.length));
  const total = parts.reduce(
    (sum, part) =>
      sum + BigInt(`${part.whole}${part.fraction.padEnd(scale, "0")}`),
    0n,
  );

  if (scale === 0) return total.toString();

  const padded = total.toString().padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/u, "");

  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
}
