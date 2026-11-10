import type { RefractoryWagonFleetRecord } from "../contracts/refractoryWagons.js";
import { readCalendarDate } from "../domain/calendarDate.js";
import type { RefractoryWagonInspectionsRepository } from "../repositories/refractoryWagonInspectionsRepository.js";
import type { RefractoryWagonsRepository } from "../repositories/refractoryWagonsRepository.js";

/** Дата ведомости; файл `server/assets/refractory-wagon-fleet/<дата>.csv`. */
export const refractoryWagonFleetAsOfDate = "2026-10-28";

export type RefractoryWagonFleetEntry = RefractoryWagonFleetRecord & {
  serviceable: boolean;
};

export type RefractoryWagonFleetActor = {
  userId: string;
  accountId: string;
  displayName: string;
};

const sourceHeader = ["Номер вагона", "Дата на борту", "Дата кап.", "Загрузка", "Исправен"];
/** Буква номера — кириллическая прописная, как в каталоге. */
const wagonNumberPattern = /^\d+А?$/u;
const capitalRepairPeriodPattern = /^(?:\d{2}\.\d{2}\.\d{4}|(?:до )?\d{2}\.\d{4})$/u;
const maxLoadLength = 120;

export function previewRefractoryWagonFleetImport(rows: string[][], asOfDate: string) {
  const entries: RefractoryWagonFleetEntry[] = [];
  const warnings: Array<{ number: string; messages: string[] }> = [];
  const [header, ...body] = rows.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (header?.join("|") !== sourceHeader.join("|")) {
    return { entries, warnings: [{ number: "—", messages: ["Неожиданные колонки ведомости."] }] };
  }

  const seenNumbers = new Set<string>();
  for (const [rawNumber = "", rawOnBoardDate = "", rawPeriod = "", rawLoad = "", rawServiceable = ""] of body) {
    const number = rawNumber.trim();
    const onBoardDate = rawOnBoardDate.trim();
    const capitalRepairPeriod = rawPeriod.trim();
    const load = rawLoad.trim();
    const serviceable = rawServiceable.trim();
    const messages: string[] = [];
    if (!wagonNumberPattern.test(number)) messages.push("Проверьте номер вагона.");
    if (seenNumbers.has(number)) messages.push("Номер встречается дважды.");
    if (onBoardDate !== "" && readCalendarDate(onBoardDate) === undefined) {
      messages.push("Проверьте дату на борту.");
    }
    if (capitalRepairPeriod !== "" && !capitalRepairPeriodPattern.test(capitalRepairPeriod)) {
      messages.push("Проверьте дату кап.");
    }
    if (load.length > maxLoadLength) messages.push("Слишком длинная загрузка.");
    if (serviceable !== "" && serviceable !== "нет") messages.push("Проверьте поле «Исправен».");
    seenNumbers.add(number);
    if (messages.length > 0) {
      warnings.push({ number, messages });
      continue;
    }
    entries.push({
      number,
      onBoardDate: onBoardDate === "" ? null : onBoardDate,
      capitalRepairPeriod: capitalRepairPeriod === "" ? null : capitalRepairPeriod,
      load: load === "" ? null : load,
      asOfDate,
      serviceable: serviceable !== "нет",
    });
  }
  return { entries, warnings };
}

/**
 * Ведомость применяется одной транзакцией, поэтому любой вагон с её датой учёта
 * (или более поздней) значит, что прогон уже был. Тогда пропускается вся
 * ведомость: импорт выполняется при каждой выкатке, а вагон, переименованный
 * после загрузки, иначе вернулся бы в каталог под прежним номером.
 */
async function isFleetLedgerApplied(
  wagons: Pick<RefractoryWagonsRepository, "readLatestFleetAsOf">,
  entries: RefractoryWagonFleetEntry[],
) {
  const asOfDate = entries[0]?.asOfDate;
  if (asOfDate === undefined) return false;
  const latest = await wagons.readLatestFleetAsOf();
  return latest !== null && latest >= asOfDate;
}

/** Только чтение: что сделает импорт с текущей БД. */
export async function countRefractoryWagonFleetChanges(
  wagons: Pick<RefractoryWagonsRepository, "readFleetState" | "readLatestFleetAsOf">,
  entries: RefractoryWagonFleetEntry[],
) {
  const counts = { created: 0, updated: 0, skipped: 0 };
  if (await isFleetLedgerApplied(wagons, entries)) {
    return { ...counts, skipped: entries.length };
  }
  for (const entry of entries) {
    if (await wagons.readFleetState(entry.number) === undefined) counts.created++;
    else counts.updated++;
  }
  return counts;
}

/**
 * Новый номер регистрируется как из `Каталога вагонов`, с первым пустым циклом.
 * Уже применённая ведомость пропускается целиком: повторный запуск не вернёт в
 * ремонт вагон, который уже вышел из него осмотром. Неисправный вагон уходит в ремонт
 * записью осмотра — другого источника этого состояния нет, а обратный путь у
 * него только один, через тот же журнал.
 */
export async function applyRefractoryWagonFleetImport({
  wagons,
  inspections,
  entries,
  actor,
}: {
  wagons: Pick<
    RefractoryWagonsRepository,
    "create" | "readFleetState" | "readLatestFleetAsOf" | "saveFleetRecord"
  >;
  inspections: Pick<RefractoryWagonInspectionsRepository, "create">;
  entries: RefractoryWagonFleetEntry[];
  actor: RefractoryWagonFleetActor;
}) {
  const counts = { created: 0, updated: 0, skipped: 0, underRepair: 0 };
  if (await isFleetLedgerApplied(wagons, entries)) {
    return { ...counts, skipped: entries.length };
  }
  for (const { serviceable, ...record } of entries) {
    if (await wagons.readFleetState(record.number) === undefined) {
      await wagons.create({
        wagon: {
          number: record.number,
          loadingDate: null,
          productBrand: null,
          pressDate: null,
          pieceCount: null,
          setter: null,
          pressOperator: null,
        },
        submittedByUserId: actor.userId,
        submittedByAccountId: actor.accountId,
      });
      counts.created++;
    } else {
      counts.updated++;
    }
    const wagonId = await wagons.saveFleetRecord(record);
    if (!serviceable) {
      await inspections.create({
        inspection: { wagonId, condition: "В ремонт", approvalDate: record.asOfDate },
        inspectedByUserId: actor.userId,
        inspectedByAccountId: actor.accountId,
        inspectedByDisplayName: actor.displayName,
        fromFleetImport: true,
      });
      counts.underRepair++;
    }
  }
  return counts;
}
