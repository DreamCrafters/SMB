import { laboratorySampleRegistrationFields } from "./laboratorySampleRegistrationJournal.js";
import { laboratoryChemicalAnalysisFields } from "./laboratoryChemicalAnalysisJournal.js";
import { laboratoryUnshapedProductSampleFields } from "./laboratoryUnshapedProductSampleJournal.js";
import { laboratoryFormedProductSampleFields } from "./laboratoryFormedProductSampleJournal.js";
import { laboratoryVerificationFields } from "./laboratoryVerificationJournal.js";
import { laboratoryClayMeasurementFields, laboratoryTemperMeasurementFields, laboratorySlipMeasurementFields, laboratoryRunnerMeasurementFields } from "./laboratoryRawMaterialQualityJournal.js";
import { laboratoryGreenProductQualityGeneralFields, laboratoryGreenProductQualityMeasurementFields } from "./laboratoryGreenProductQualityJournal.js";
import { productBrandFields } from "./productBrands.js";
import { rawMaterialNomenclatureFields } from "./rawMaterialNomenclature.js";
import { railwayWagonStageFields } from "./railwayWagons.js";

export const tableLayoutLimits = {
  minWidth: 64, maxWidth: 960, defaultWidth: 160,
  maxColumns: 512, textLines: 4, keyboardStep: 8,
} as const;

function defineTable<const Columns extends readonly string[]>(label: string, columns: Columns) {
  return { label, columns };
}
const chemicalColumns = laboratoryChemicalAnalysisFields.map(({ id }) => `analysis.${id}` as const);
const measurementColumns = [...new Set([
  ...laboratoryClayMeasurementFields, ...laboratoryTemperMeasurementFields,
  ...laboratorySlipMeasurementFields, ...laboratoryRunnerMeasurementFields,
  ...laboratoryGreenProductQualityMeasurementFields,
].map(({ id }) => id))];

/** Stable semantic column IDs; labels, filtering and optional columns never address stored widths. */
export const tableDefinitions = {
  "production.plan": defineTable("План выработки", ["date", "forming", "sorting", "unformed", "chamotte"]),
  "production.banks": defineTable("Банки: отчёт", ["metric", "bank.1", "bank.2", "bank.3", "bank.4"]),
  "production.brands": defineTable("Выработка по маркам", ["dayPlan", "monthPlan", "monthFact", "deviation"]),
  "production.granulation": defineTable("Грануляция: ввод", ["plates", "millHours", "fraction1630", "fraction1218"]),
  "dashboard.brands": defineTable("Выработка по маркам: история", ["date", "brand", "dayPlan", "dayFact", "monthPlan", "monthFact", "deviation"]),
  "dashboard.banks": defineTable("Банки: история", ["date", "bank", "material", "startMeasured", "startShipped", "endMeasured", "endShipped", "usedMeasured", "usedShipped"]),
  "dashboard.granulation": defineTable("Грануляция: история", ["date", "plates", "millHours", "day1630", "month1630", "day1218", "month1218"]),
  "dispatcher.equipment": defineTable("Оборудование", ["equipment", "production", "downtime", "reasons"]),
  "dispatcher.equipmentHistory": defineTable("История оборудования", ["date", "production", "downtime", "reasons", "note", "updatedAt"]),
  "dispatcher.incidents": defineTable("Инциденты", ["number", "status", "openedAt", "closedAt", "description"]),
  "dispatcher.visitors": defineTable("Посетители", ["visitor", "organization", "host", "enteredAt", "leftAt"]),
  "admin.audit": defineTable("Журнал действий", ["occurredAt", "actor", "action"]),
  "admin.database": defineTable("База данных", ["actions"]),
  "admin.accounts": defineTable("Учётные записи", ["position", "name", "login", "protection", "password", "navigation", "status"]),
  "admin.positions": defineTable("Должности", ["order", "position", "adminRights", "navigation", "accounts"]),
  "admin.navigationAccess": defineTable("Доступ к вкладке", ["position", "access", "level"]),
  "board.history": defineTable("История исполнения поручения", ["acceptedAt", "description", "completedAt", "acceptedBy", "status"]),
  "board.assignments": defineTable("Поручения Совета директоров", ["meetingDate", "description", "coExecutors", "deadline", "status"]),
  "laboratory.banks": defineTable("Назначения банок", ["date", "bank", "material", "weightBasis", "bulkDensity", "assistant"]),
  "laboratory.samples": defineTable("Регистрация проб", [...laboratorySampleRegistrationFields.map(({ id }) => id), ...chemicalColumns]),
  "laboratory.analyses": defineTable("Химические анализы", ["sampleCode", "sampleNumber", "sampleName", ...laboratoryChemicalAnalysisFields.map(({ id }) => id)]),
  "laboratory.unshaped": defineTable("Неформованная продукция", [...laboratoryUnshapedProductSampleFields.filter(({ id }) => id !== "chemicalAnalysisNumber").map(({ id }) => id), ...chemicalColumns]),
  "laboratory.formed": defineTable("Формованная продукция", [...laboratoryFormedProductSampleFields.map(({ id }) => id), ...chemicalColumns]),
  "laboratory.verification": defineTable("Верификация", [...laboratoryVerificationFields.map(({ id }) => id), ...chemicalColumns]),
  "laboratory.rawQuality": defineTable("Качество сырья", ["date", "assistant", "master", "shift", "measurements"]),
  "laboratory.measurements": defineTable("Замеры: история", ["counter", ...measurementColumns]),
  "laboratory.measurementForm": defineTable("Замеры: ввод", ["counter", ...measurementColumns, "actions"]),
  "laboratory.greenQuality": defineTable("Качество сырцовой продукции", [...laboratoryGreenProductQualityGeneralFields.map(({ id }) => id), "measurements"]),
  "laboratory.rotaryKiln": defineTable("Вращающаяся печь № 2", ["date", "time", "material", "waterAbsorption", "temperatureBeforeCyclone", "temperatureBeforeFilter", "temperatureInFieldChamber", "temperatureAtRollback", "gasConsumptionPerHour", "vacuum", "pressure", "master", "firingOperator", "assistant", "sievePass05", "bulkDensity", "kilnLoadBucketsPerHour", "note"]),
  "laboratory.warehouse": defineTable("Склад сырья", ["date", "material", "location", "received", "supplier", "shipped", "recipient", "status", "actor", "actions"]),
  "laboratory.results": defineTable("Результаты испытаний", ["date", "section", "object", "identifier", "assistant", "protocol", "indicator.al2o3", "indicator.fe2o3", "indicator.sio2", "indicator.cao2", "indicator.p2o5", "indicator.loss_on_ignition", "indicator.moisture", "indicator.bulk_density", "indicator.water_absorption", "indicator.strength", "indicator.grain_composition"]),
  "notifications.personal": defineTable("Личные уведомления", ["notification", "email", "max"]),
  "notifications.positions": defineTable("Должности: уведомления", ["position", "accounts"]),
  "notifications.permissions": defineTable("Разрешения рассылок", ["notification", "enabled"]),
  "notifications.channels": defineTable("Каналы аккаунта", ["notification", "email", "max"]),
  "catalog.brands": defineTable("Марки", [...productBrandFields.map(({ id }) => id), "actions"]),
  "catalog.materials": defineTable("Номенклатура сырья", rawMaterialNomenclatureFields.map(({ id }) => id)),
  "railway.cargo": defineTable("Грузы заявки", ["name", "code", "palletCount", "palletWeight", "totalWeight", "dimensions", "fastening", "fasteningWeight", "actions"]),
  "railway.orders": defineTable("Заявки на вагоны", ["actions", "status", "declineComment", "contract", "direction", "station", "wagonType", "cargo", "totalWeight", "rent", "tariff", "penalty", "carrier", "wagonNumber", "arrivalDate", "location", ...railwayWagonStageFields]),
  "refractory.banks": defineTable("Банки: ввод", ["metric", "bank.1", "bank.2", "bank.3", "bank.4"]),
  "refractory.cosh": defineTable("Выпуск ЦОШ", ["brand", "output", "actions"]),
  "refractory.equipment": defineTable("Выпуск формованных огнеупоров", ["equipment", "productBrand", "outputNorm", "actualPieces", "actualTons", "workedHours", "totalDowntimeHours", "mechanicalRepairHours", "electricalRepairHours", "carriageReplacementHours", "brandReplacementHours", "moldReplacementHours", "reserveHours", "workerAbsenceHours", "rawMaterialAbsenceHours", "note"]),
  "refractory.unformed": defineTable("Выпуск неформованных огнеупоров", ["brand", "norm", "actualContainers", "actualTons"]),
  "refractory.firing": defineTable("Обжиг", ["firingDate", "firingOperator", "wagons", "sortingDate", "sorter", "quantityPieces", "palletCount", "goodTonsAverageWeight", "goodTonsWeighed", "rejectTotalPieces", "rejectUnderburnPieces", "rejectCracksPieces", "rejectFusionPieces", "rejectChipsPieces", "note"]),
  "refractory.catalog": defineTable("Каталог вагонов", ["number", "firingCount", "state"]),
  "refractory.inspections": defineTable("Осмотры вагонов", ["number", "sortingDate", "state", "inspectionDate", "inspector"]),
  "refractory.wagons": defineTable("Вагоны огнеупорного цеха", ["number", "settingDate", "brand", "pressDate", "pieces", "setter", "pressOperator", "inspectionDate", "firingOperator", "firingDates", "sorter", "sortingDate", "state", "checkedAt"]),
  "warehouse.sheet": defineTable("Исходный лист 1С", ["rowNumber"]),
  "warehouse.uploads": defineTable("Журнал приёма 1С", ["receivedAt", "file", "result", "summary"]),
  "warehouse.stock": defineTable("Остатки 1С", ["warehouse", "nomenclature", "openingBalance", "openingQuantity", "closingBalance", "closingQuantity"]),
} as const;

export type TableId = keyof typeof tableDefinitions;
export type TableColumnId<T extends TableId> = (typeof tableDefinitions)[T]["columns"][number]
  | (T extends "production.brands" ? `brand.${number}` : never)
  | (T extends "warehouse.sheet" ? `column.${number}` : never)
  | (T extends "admin.database" ? `field.${string}.${string}` : never);
export type TableWidths = Record<string, number>;
export type TableLayout = { tableId: TableId; revision: number; widths: TableWidths };
export type TableLayoutsResponse = { layouts: TableLayout[]; canManage: boolean };

export function isTableId(value: unknown): value is TableId {
  return typeof value === "string" && Object.hasOwn(tableDefinitions, value);
}

export function isTableColumnId<T extends TableId>(tableId: T, value: string): value is TableColumnId<T> {
  if ((tableDefinitions[tableId].columns as readonly string[]).includes(value)) return true;
  if (tableId === "production.brands") return /^brand\.([1-9]|[1-4]\d|50)$/u.test(value);
  if (tableId === "warehouse.sheet") return /^column\.\d{1,3}$/u.test(value) && Number(value.slice(7)) < tableLayoutLimits.maxColumns;
  if (tableId === "admin.database") return /^field\.[a-z][a-z0-9_]{0,63}\.[a-z][a-z0-9_]{0,63}$/u.test(value);
  return false;
}

export function getTableColumnWidth(tableId: TableId, columnId: string) {
  if (tableId === "warehouse.stock") return columnId === "warehouse" || columnId === "nomenclature" ? 180 : 140;
  if (columnId === "actions" || columnId === "counter" || columnId === "rowNumber") return 96;
  if (/description|note|summary|reasons|navigation|actor|action|nomenclature/iu.test(columnId)) return 240;
  return tableLayoutLimits.defaultWidth;
}

export function clampTableColumnWidth(width: number) {
  return Math.min(tableLayoutLimits.maxWidth, Math.max(tableLayoutLimits.minWidth, Math.round(width)));
}

export function reconcileTableWidths(tableId: TableId, value: unknown): TableWidths {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => {
    const [key, width] = entry;
    return isTableColumnId(tableId, key) && typeof width === "number" && Number.isInteger(width)
    && width >= tableLayoutLimits.minWidth && width <= tableLayoutLimits.maxWidth;
  }));
}

export function validateTableLayout(value: unknown):
  | { ok: true; value: TableLayout } | { ok: false; message: string } {
  if (!isRecord(value) || !isTableId(value.tableId) || !Number.isSafeInteger(value.revision)
    || (value.revision as number) < 0 || !isRecord(value.widths)
    || Object.keys(value.widths).length > tableLayoutLimits.maxColumns) {
    return { ok: false, message: "Передайте известную таблицу, версию и допустимые ширины колонок." };
  }
  const widths = reconcileTableWidths(value.tableId, value.widths);
  if (Object.keys(widths).length !== Object.keys(value.widths).length) {
    return { ok: false, message: `Ширина известной колонки должна быть целым числом от ${tableLayoutLimits.minWidth} до ${tableLayoutLimits.maxWidth} пикселей.` };
  }
  return { ok: true, value: { tableId: value.tableId, revision: value.revision as number, widths } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
