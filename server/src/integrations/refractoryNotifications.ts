import {
  refractoryReportLabels,
  type RefractoryCoshPayload,
  type RefractoryEquipmentPayload,
  type RefractoryFiringPayload,
  type RefractoryReportNotification,
  type RefractoryShiftNumber,
} from "../domain/refractoryReport.js";

export function buildRefractoryNotificationSubject(
  report: RefractoryReportNotification,
  subjectPrefix: string,
) {
  const prefix = subjectPrefix.length > 0 ? `[${subjectPrefix}] ` : "";

  return `${prefix}Таблица ОЦ подтверждена: ${refractoryReportLabels[report.reportType]}`;
}

export function buildRefractoryNotificationText(
  report: RefractoryReportNotification,
) {
  return [
    "Таблица ОЦ подтверждена",
    `Таблица: ${refractoryReportLabels[report.reportType]}`,
    `Дата смены: ${formatReportDate(report.reportDate)}`,
    `Смена: ${formatShift(report.shiftNumber)}`,
    `Ревизия: ${report.revisionNumber}`,
    `Мастер смены: ${report.masterDisplayName}`,
    `Подтвердил: ${report.reviewerDisplayName ?? "Не указан"}`,
    "",
    "Данные таблицы:",
    ...buildPayloadLines(report),
    "",
    "Итоги:",
    ...buildTotalsLines(report),
  ].join("\n");
}

export function dedupeRefractoryEmailRecipients(values: readonly string[]) {
  return dedupeRecipients(values, (value) =>
    value.toLocaleLowerCase("en-US"),
  );
}

export function dedupeRefractoryMaxRecipients(values: readonly string[]) {
  return dedupeRecipients(values, (value) => value);
}

function buildPayloadLines(report: RefractoryReportNotification) {
  if (report.reportType === "cosh") {
    return buildCoshPayloadLines(report.payload);
  }

  if (report.reportType === "equipment") {
    return buildEquipmentPayloadLines(report.payload);
  }

  return buildFiringPayloadLines(report.payload);
}

function buildCoshPayloadLines(payload: RefractoryCoshPayload) {
  const output = payload.chamotteOutput;
  const lines = [
    "Работа печи и выпуск шамота",
    formatField("Вращающаяся печь №", payload.kilnNumber),
    formatField("ШБО, т", output?.shbo),
    formatField("ШГР-1, т", output?.shgr1),
    formatField("ШГР-2, т", output?.shgr2),
    formatField("ШКИ, т", output?.shki),
    formatField("Загрузка, ковшей/час", payload.loadingBucketsPerHour),
    formatField("Всего загружено ковшей", payload.totalLoadingBuckets),
    formatField("Вывоз брака из бункера РЦ, т", payload.scrapRemovalTons),
    "Замеры банок",
    ...(payload.jarMeasurements?.map((row) =>
      `Банка ${row.jarNumber}: ${row.values.map(formatValue).join("; ")}`
    ) ?? ["—"]),
    "Наполнение бункеров РЦ",
    ...(payload.bunkerFill?.map((row) =>
      `Бункер ${row.bunker}: продукт ${formatValue(row.productName)}; количество, т ${formatValue(row.quantity)}`
    ) ?? ["—"]),
    "Подача шамота в огнеупорный цех",
    ...(payload.chamotteSupply?.map((row) =>
      `Источник ${formatSupplySource(row.source)}: продукт ${formatValue(row.productName)}; количество, т ${formatValue(row.quantity)}`
    ) ?? ["—"]),
    "Фасовка и время операций",
    formatField("Номер банки фасовки", payload.bagging?.jarNumber),
    formatField("Количество фасовки, т", payload.bagging?.quantity),
    formatField("Розжиг печи", payload.furnaceIgnitionTime),
    formatField("Начало загрузки", payload.loadingStartTime),
    formatField("Переход на бункер РЦ", payload.bunkerTransitionTime),
    formatField("Номер бункера", payload.bunkerNumber),
    formatField("Переход на банку", payload.jarTransitionTime),
    formatField("Номер банки", payload.jarNumber),
    formatField("Остановка печи", payload.furnaceStopTime),
    formatField("Примечание", payload.note),
  ];

  return lines;
}

function buildEquipmentPayloadLines(payload: RefractoryEquipmentPayload) {
  return [
    "Формованные огнеупоры",
    ...payload.formedRows.map((row, index) =>
      [
        `${index + 1}. ${row.equipment}`,
        `марка ${formatValue(row.productBrand)}`,
        `норма ${formatValue(row.outputNorm)}`,
        `факт, шт. ${formatValue(row.actualPieces)}`,
        `факт, т ${formatValue(row.actualTons)}`,
        `работа, ч ${formatValue(row.workedHours)}`,
        `мех. ремонт ${formatValue(row.mechanicalRepairHours)}`,
        `эл. ремонт ${formatValue(row.electricalRepairHours)}`,
        `замена каретки ${formatValue(row.carriageReplacementHours)}`,
        `замена марки ${formatValue(row.brandReplacementHours)}`,
        `замена формы ${formatValue(row.moldReplacementHours)}`,
        `резерв ${formatValue(row.reserveHours)}`,
        `нет рабочего/сменщика ${formatValue(row.workerAbsenceHours)}`,
        `нет сырья ${formatValue(row.rawMaterialAbsenceHours)}`,
        `простой всего ${formatValue(row.totalDowntimeHours)}`,
        `примечание ${formatValue(row.note)}`,
      ].join("; ")
    ),
    "Неформованные огнеупоры",
    ...payload.unformedRows.map((row, index) =>
      `${index + 1}. ${row.productBrand}; норма, контейнеры ${formatValue(row.outputNormContainers)}; факт, контейнеры ${formatValue(row.actualContainers)}; факт, т ${formatValue(row.actualTons)}`
    ),
  ];
}

function buildFiringPayloadLines(payload: RefractoryFiringPayload) {
  return [
    "Выпуск обожжённых огнеупоров",
    ...payload.rows.map((row, index) =>
      [
        `${index + 1}. ${row.productBrand}`,
        `количество, шт. ${formatValue(row.quantityPieces)}`,
        `поддоны ${formatValue(row.palletCount)}`,
        `годные, т (ср. вес) ${formatValue(row.goodTonsAverageWeight)}`,
        `годные, т (взвешено) ${formatValue(row.goodTonsWeighed)}`,
        `недожог ${formatValue(row.rejectUnderburnPieces)}`,
        `трещины ${formatValue(row.rejectCracksPieces)}`,
        `сплав ${formatValue(row.rejectFusionPieces)}`,
        `сколы ${formatValue(row.rejectChipsPieces)}`,
        `брак всего ${formatValue(row.rejectTotalPieces)}`,
        `примечание ${formatValue(row.note)}`,
      ].join("; ")
    ),
    formatField("Время обжига, часов", payload.calcinationHours),
    formatField("Количество сортировщиков", payload.sorterCount),
    formatField("Причина невыполнения плана", payload.planFailureReason),
  ];
}

function buildTotalsLines(report: RefractoryReportNotification) {
  if (report.reportType === "cosh") {
    const totals = report.totals;

    return [
      formatTotal("Выработка шамота, т", totals.chamotteOutputTons),
      formatTotal("Заполнение бункеров, т", totals.bunkerFillTons),
      formatTotal("Подача шамота, т", totals.chamotteSupplyTons),
      formatTotal("Фасовка, т", totals.baggingTons),
      formatTotal("Вывоз брака, т", totals.scrapRemovalTons),
    ];
  }

  if (report.reportType === "equipment") {
    const totals = report.totals;

    return [
      formatTotal("Формованные изделия, шт", totals.formedActualPieces),
      formatTotal("Формованные изделия, т", totals.formedActualTons),
      formatTotal("Отработано, ч", totals.formedWorkedHours),
      formatTotal("Простой, ч", totals.formedDowntimeHours),
      formatTotal(
        "Неформованные изделия, контейнеры",
        totals.unformedActualContainers,
      ),
      formatTotal("Неформованные изделия, т", totals.unformedActualTons),
    ];
  }

  const totals = report.totals;

  return [
    formatTotal("Выпуск, шт", totals.quantityPieces),
    formatTotal("Поддоны, шт", totals.palletCount),
    formatTotal("Годное по среднему весу, т", totals.goodTonsAverageWeight),
    formatTotal("Годное по взвешиванию, т", totals.goodTonsWeighed),
    formatTotal("Брак, шт", totals.rejectTotalPieces),
    formatTotal("Недожог, шт", totals.rejectUnderburnPieces),
    formatTotal("Трещины, шт", totals.rejectCracksPieces),
    formatTotal("Сплав, шт", totals.rejectFusionPieces),
    formatTotal("Сколы, шт", totals.rejectChipsPieces),
  ];
}

function formatShift(shiftNumber: RefractoryShiftNumber) {
  return shiftNumber === 1 ? "1 (08:00–20:00)" : "2 (20:00–08:00)";
}

function formatReportDate(value: string) {
  const [year, month, day] = value.split("-");

  return year !== undefined && month !== undefined && day !== undefined
    ? `${day}.${month}.${year}`
    : value;
}

function formatTotal(label: string, value: number) {
  return formatField(label, value);
}

function formatField(label: string, value: string | number | undefined) {
  return `${label}: ${formatValue(value)}`;
}

function formatValue(value: string | number | undefined) {
  if (value === undefined || (typeof value === "string" && value.length === 0)) {
    return "—";
  }

  return typeof value === "number" ? String(value).replace(".", ",") : value;
}

function formatSupplySource(value: "I" | "II" | "III" | "street") {
  return value === "street" ? "улица" : value;
}

function dedupeRecipients(
  values: readonly string[],
  normalize: (value: string) => string,
) {
  const recipients: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    const normalized = normalize(trimmed);

    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push(trimmed);
  }

  return recipients;
}
