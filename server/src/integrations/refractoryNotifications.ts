import {
  refractoryReportLabels,
  type RefractoryCoshPayload,
  type RefractoryEquipmentPayload,
  type RefractoryFiringPayload,
  type RefractoryReportNotification,
  type RefractoryShiftNumber,
} from "../domain/refractoryReport.js";

export type RefractoryNotificationKind = "approved" | "review_requested";

export function buildRefractoryNotificationSubject(
  report: RefractoryReportNotification,
  subjectPrefix: string,
) {
  const prefix = subjectPrefix.length > 0 ? `[${subjectPrefix}] ` : "";

  return `${prefix}Таблица ОЦ подтверждена: ${refractoryReportLabels[report.reportType]}`;
}

export function buildRefractoryReviewRequestSubject(
  report: RefractoryReportNotification,
  subjectPrefix: string,
) {
  const prefix = subjectPrefix.length > 0 ? `[${subjectPrefix}] ` : "";

  return `${prefix}Таблица ОЦ ожидает подтверждения: ${refractoryReportLabels[report.reportType]}`;
}

export function buildRefractoryReviewRequestText(
  report: RefractoryReportNotification,
) {
  return [
    "Новая таблица ОЦ ожидает подтверждения",
    `Таблица: ${refractoryReportLabels[report.reportType]}`,
    `Дата смены: ${formatReportDate(report.reportDate)}`,
    `Смена: ${formatShift(report.shiftNumber)}`,
    `Ревизия: ${report.revisionNumber}`,
    `Мастер смены: ${report.masterDisplayName}`,
  ].join("\n");
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
    "Сводка по ЦОШ (ежесменная)",
    "Выпуск шамота",
    formatField("Работает вр. печь №", payload.kilnNumber),
    formatField("ШБО, т", output?.shbo),
    formatField("ШГР-1, т", output?.shgr1),
    formatField("ШГР-2, т", output?.shgr2),
    formatField("ШКИ, т", output?.shki),
    formatField("Загрузка, ковш/час", payload.loadingBucketsPerHour),
    formatField("Загрузка, всего ковшей", payload.totalLoadingBuckets),
    "Замеры банок",
    ...(payload.jarMeasurements?.map((row) =>
      `Банка ${["I", "II", "III"][row.jarNumber - 1]}: ${row.values.map(formatValue).join("; ")}`
    ) ?? ["—"]),
    "Заполнение ж/д бункеров",
    ...(payload.bunkerFill?.map((row) =>
      `Бункер ${row.bunker}: продукт ${formatValue(row.productName)}; количество, т ${formatValue(row.quantity)}`
    ) ?? ["—"]),
    "Подача шамота в огнеупорный цех, тн",
    ...(payload.chamotteSupply?.map((row) =>
      `${formatSupplySource(row.source)}: продукт ${formatValue(row.productName)}; кол-во, т ${formatValue(row.quantity)}`
    ) ?? ["—"]),
    "Затарка в мешки",
    formatField("№ банки", payload.bagging?.jarNumber),
    formatField("Кол-во, т", payload.bagging?.quantity),
    formatField("Вывоз недопала с ж/д бункера, тн", payload.scrapRemovalTons),
    "Время операций",
    formatField("Время розжига печи", payload.furnaceIgnitionTime),
    formatField("Время начала загрузки", payload.loadingStartTime),
    formatField("Время перехода на ж/д бункер", payload.bunkerTransitionTime),
    formatField("№ бункера", payload.bunkerNumber),
    formatField("Время перехода на банку", payload.jarTransitionTime),
    formatField("№ банки", payload.jarNumber),
    formatField("Время прекращения работы печи", payload.furnaceStopTime),
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
        `отработано, ч ${formatValue(row.workedHours)}`,
        `простой всего ${formatValue(row.totalDowntimeHours)}`,
        `ремонт по мех. части ${formatValue(row.mechanicalRepairHours)}`,
        `ремонт по эл. части ${formatValue(row.electricalRepairHours)}`,
        `замена вагона ${formatValue(row.carriageReplacementHours)}`,
        `замена марки ${formatValue(row.brandReplacementHours)}`,
        `замена формы ${formatValue(row.moldReplacementHours)}`,
        `резерв ${formatValue(row.reserveHours)}`,
        `отсутствие рабочего/сменщика ${formatValue(row.workerAbsenceHours)}`,
        `отсутствие сырья ${formatValue(row.rawMaterialAbsenceHours)}`,
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
        `кол-во, шт. ${formatValue(row.quantityPieces)}`,
        `кол-во, поддонов ${formatValue(row.palletCount)}`,
        `годная, т по среднему весу ${formatValue(row.goodTonsAverageWeight)}`,
        `годная, т по взвешиванию ${formatValue(row.goodTonsWeighed)}`,
        `брак всего, шт. ${formatValue(row.rejectTotalPieces)}`,
        `недожог ${formatValue(row.rejectUnderburnPieces)}`,
        `трещины ${formatValue(row.rejectCracksPieces)}`,
        `выплавка ${formatValue(row.rejectFusionPieces)}`,
        `сколы ${formatValue(row.rejectChipsPieces)}`,
        `примечание ${formatValue(row.note)}`,
      ].join("; ")
    ),
    formatField("Время прогонки, час(а)", payload.calcinationHours),
    formatField("Присутствуют на смене, сортировщиков", payload.sorterCount),
    formatField("Причина невыполнения плана", payload.planFailureReason),
  ];
}

function buildTotalsLines(report: RefractoryReportNotification) {
  if (report.reportType === "cosh") {
    const totals = report.totals;

    return [
      formatTotal("Выпуск шамота, т", totals.chamotteOutputTons),
      formatTotal("Заполнение ж/д бункеров, т", totals.bunkerFillTons),
      formatTotal("Подача шамота, т", totals.chamotteSupplyTons),
      formatTotal("Затарка в мешки, т", totals.baggingTons),
      formatTotal("Вывоз недопала, т", totals.scrapRemovalTons),
    ];
  }

  if (report.reportType === "equipment") {
    const totals = report.totals;

    return [
      formatTotal("Формованные изделия, шт", totals.formedActualPieces),
      formatTotal("Формованные изделия, т", totals.formedActualTons),
      formatTotal("Отработано, ч", totals.formedWorkedHours),
      formatTotal("Простой всего, ч", totals.formedDowntimeHours),
      formatTotal(
        "Неформованные изделия, контейнеры",
        totals.unformedActualContainers,
      ),
      formatTotal("Неформованные изделия, т", totals.unformedActualTons),
    ];
  }

  const totals = report.totals;

  return [
    formatTotal("Кол-во, шт", totals.quantityPieces),
    formatTotal("Кол-во, поддонов", totals.palletCount),
    formatTotal("Годная по среднему весу, т", totals.goodTonsAverageWeight),
    formatTotal("Годная по взвешиванию, т", totals.goodTonsWeighed),
    formatTotal("Брак всего, шт", totals.rejectTotalPieces),
    formatTotal("Недожог, шт", totals.rejectUnderburnPieces),
    formatTotal("Трещины, шт", totals.rejectCracksPieces),
    formatTotal("Выплавка, шт", totals.rejectFusionPieces),
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
  if (value === "street") return "уличн.";
  return value === "I" ? "Из I" : value;
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
