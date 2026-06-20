export const decimalNumberInputPattern = "[0-9]+([.][0-9]*)?";
export const decimalNumberInputTitle =
  "Введите целое или дробное число. Запятая автоматически заменяется на точку.";

export function normalizeDecimalNumberInput(value: string) {
  let result = "";
  let hasDecimalSeparator = false;

  for (const character of value.replace(/,/g, ".")) {
    if (character >= "0" && character <= "9") {
      result += character;
      continue;
    }

    if (character === "." && !hasDecimalSeparator) {
      hasDecimalSeparator = true;
      result += result.length === 0 ? "0." : ".";
    }
  }

  return result;
}

export function normalizeDecimalNumberForPayload(value: string) {
  if (!/\d/.test(value)) {
    return undefined;
  }

  const normalized = normalizeDecimalNumberInput(value);
  const finalized = normalized.endsWith(".")
    ? normalized.slice(0, -1)
    : normalized;

  return finalized.length > 0 ? finalized : undefined;
}
