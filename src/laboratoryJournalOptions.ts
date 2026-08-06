export function mergeLaboratoryJournalOptions(
  current: readonly string[],
  additions: readonly string[],
) {
  const options = [...current];
  const keys = new Set(options.map(normalizeLaboratoryJournalOptionKey));

  for (const addition of additions) {
    const normalized = addition.trim().replace(/\s+/gu, " ");
    const key = normalizeLaboratoryJournalOptionKey(normalized);
    if (normalized === "" || keys.has(key)) continue;
    keys.add(key);
    options.push(normalized);
  }

  return options;
}

function normalizeLaboratoryJournalOptionKey(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}
