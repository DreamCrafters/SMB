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

export function mergeDispatcherProductionBrandReferences(
  payload: Record<string, string>,
  sourceLabel: string,
  replacementLabel: string,
) {
  const sourceKey = normalizeProductionBrandLookupLabel(sourceLabel);
  const replacementKey = normalizeProductionBrandLookupLabel(replacementLabel);
  const nextPayload = { ...payload };
  let changed = false;

  for (const fieldName of ["formingProductBrand", "sortingProductBrand"] as const) {
    const label = nextPayload[fieldName];
    if (label !== undefined && normalizeProductionBrandLookupLabel(label) === sourceKey) {
      nextPayload[fieldName] = replacementLabel;
      changed = true;
    }
  }

  for (const prefix of ["forming", "sorting", "unformed", "chamotte"] as const) {
    const matchingIndexes: number[] = [];
    const replacementIndexes: number[] = [];

    for (let index = 1; index <= 50; index += 1) {
      const label = nextPayload[`${prefix}Brand${index}`];
      if (label === undefined) continue;
      const key = normalizeProductionBrandLookupLabel(label);
      if (key === sourceKey) matchingIndexes.push(index);
      if (key === replacementKey) replacementIndexes.push(index);
    }

    if (matchingIndexes.length === 0) continue;
    changed = true;
    const combinedIndexes = [...new Set([
      ...replacementIndexes,
      ...matchingIndexes,
    ])].sort((left, right) => left - right);
    const destinationIndex = replacementIndexes[0] ?? matchingIndexes[0];

    if (combinedIndexes.length === 1) {
      nextPayload[`${prefix}Brand${destinationIndex}`] = replacementLabel;
      continue;
    }

    const facts = combinedIndexes.flatMap((index) => {
      const value = nextPayload[`${prefix}Fact${index}`];
      return value === undefined ? [] : [value];
    });
    nextPayload[`${prefix}Brand${destinationIndex}`] = replacementLabel;
    if (facts.length > 0) {
      nextPayload[`${prefix}Fact${destinationIndex}`] = addDecimalStrings(facts);
    }
    for (const index of combinedIndexes) {
      if (index === destinationIndex) continue;
      delete nextPayload[`${prefix}Brand${index}`];
      delete nextPayload[`${prefix}Fact${index}`];
    }
  }

  return { payload: nextPayload, changed };
}

export function mergeRefractoryReportBrandReferences(
  reportType: string,
  payload: unknown,
  sourceLabel: string,
  replacementLabel: string,
) {
  if (!isRecord(payload)) return { payload, changed: false };

  if (reportType === "cosh" && Array.isArray(payload.chamotteOutputRows)) {
    const sourceKey = normalizeProductionBrandLookupLabel(sourceLabel);
    const replacementKey = normalizeProductionBrandLookupLabel(replacementLabel);
    const rows = payload.chamotteOutputRows.filter(isRecord);
    const affectedRows = rows.filter((row) => {
      const label = row.productBrand;
      return typeof label === "string" &&
        [sourceKey, replacementKey].includes(normalizeProductionBrandLookupLabel(label));
    });
    const hasSource = affectedRows.some((row) =>
      typeof row.productBrand === "string" &&
      normalizeProductionBrandLookupLabel(row.productBrand) === sourceKey
    );

    if (hasSource) {
      const destination = affectedRows.find((row) =>
        typeof row.productBrand === "string" &&
        normalizeProductionBrandLookupLabel(row.productBrand) === replacementKey
      ) ?? affectedRows[0];
      const combinedQuantity = addDecimalStrings(affectedRows.flatMap((row) =>
        typeof row.quantityTons === "number" || typeof row.quantityTons === "string"
          ? [String(row.quantityTons)]
          : []
      ));
      const nextDestination = {
        ...destination,
        productBrand: replacementLabel,
        ...(combinedQuantity === "" ? {} : { quantityTons: Number(combinedQuantity) }),
      };
      const affected = new Set(affectedRows);
      const nextRows = rows.flatMap((row) => {
        if (!affected.has(row)) return [row];
        return row === destination ? [nextDestination] : [];
      });
      return {
        payload: { ...payload, chamotteOutputRows: nextRows },
        changed: true,
      };
    }
  }

  return replaceNestedProductBrand(payload, sourceLabel, replacementLabel);
}

function replaceNestedProductBrand(
  value: unknown,
  sourceLabel: string,
  replacementLabel: string,
): { payload: unknown; changed: boolean } {
  const sourceKey = normalizeProductionBrandLookupLabel(sourceLabel);
  let changed = false;

  function visit(current: unknown): unknown {
    if (Array.isArray(current)) return current.map(visit);
    if (!isRecord(current)) return current;
    return Object.fromEntries(Object.entries(current).map(([key, nested]) => {
      if (
        key === "productBrand" &&
        typeof nested === "string" &&
        normalizeProductionBrandLookupLabel(nested) === sourceKey
      ) {
        changed = true;
        return [key, replacementLabel];
      }
      return [key, visit(nested)];
    }));
  }

  return { payload: visit(value), changed };
}

function addDecimalStrings(values: string[]) {
  if (values.length === 0) return "";
  const parsed = values.map((value) => /^(-?)(\d+)(?:\.(\d+))?$/u.exec(value.trim()));
  if (parsed.some((value) => value === null)) {
    return String(values.reduce((total, value) => total + Number(value), 0));
  }
  const scale = Math.max(...parsed.map((value) => value?.[3]?.length ?? 0));
  const total = parsed.reduce((sum, value) => {
    const fraction = value?.[3] ?? "";
    const scaled = BigInt(`${value?.[2] ?? "0"}${fraction.padEnd(scale, "0")}`);
    return sum + (value?.[1] === "-" ? -scaled : scaled);
  }, 0n);
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, "0");
  const integer = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/u, "");
  return `${negative ? "-" : ""}${integer}${fraction === "" ? "" : `.${fraction}`}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
