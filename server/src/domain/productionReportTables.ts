import type {
  DispatcherSubmission,
  DispatcherSubmissionPayload,
} from "./dispatcherSubmission.js";
import {
  productionCategories,
  type ProductionCategory,
  type ProductionPlan,
} from "./productionPlan.js";

export type ProductionReportBaseRow = {
  reportId: string;
  reportDate: string;
  receivedAt: string;
};

export type ProductionMetricRow = ProductionReportBaseRow & {
  brand?: string;
  dayPlan?: number;
  dayFact?: number;
  monthPlan?: number;
  monthFact?: number;
  deviation?: number;
};

export type ProductionBrandFact = {
  brand: string;
  value: number;
  monthValue: number;
};

type DailyProductionBrandFact = Omit<ProductionBrandFact, "monthValue">;

export type ProductionBrandCategoryRow = ProductionMetricRow & {
  facts: ProductionBrandFact[];
};

export type ProductionJarMeasurementRow = ProductionReportBaseRow & {
  jarNumber: number;
  start?: number;
  end?: number;
  consumption?: number;
  shipmentStart?: number;
  shipmentEnd?: number;
  shipmentConsumption?: number;
};

export type ProductionGranulationRow = ProductionReportBaseRow & {
  platesInOperation?: number;
  millHours?: number;
  fraction1630Day?: number;
  fraction1630Month?: number;
  fraction1218Day?: number;
  fraction1218Month?: number;
};

export type ProductionReportTables = {
  forming: ProductionBrandCategoryRow[];
  sorting: ProductionBrandCategoryRow[];
  unformed: ProductionBrandCategoryRow[];
  chamotte: ProductionBrandCategoryRow[];
  jars: ProductionJarMeasurementRow[];
  granulation: ProductionGranulationRow[];
};

export type ProductionBrandCategoryTotals = {
  rowCount: number;
  dayPlan?: number;
  dayFact?: number;
  monthPlan?: number;
  monthFact?: number;
  deviation?: number;
};

export type ProductionJarMeasurementTotals = {
  rowCount: number;
  start?: number;
  end?: number;
  consumption?: number;
  shipmentStart?: number;
  shipmentEnd?: number;
  shipmentConsumption?: number;
};

export type ProductionGranulationTotals = {
  rowCount: number;
  platesInOperation?: number;
  millHours?: number;
  fraction1630Day?: number;
  fraction1630Month?: number;
  fraction1218Day?: number;
  fraction1218Month?: number;
};

export type ProductionReportTableTotals = {
  forming: ProductionBrandCategoryTotals;
  sorting: ProductionBrandCategoryTotals;
  unformed: ProductionBrandCategoryTotals;
  chamotte: ProductionBrandCategoryTotals;
  jars: ProductionJarMeasurementTotals;
  granulation: ProductionGranulationTotals;
};

export type ProductionReportDateRange = {
  dateFrom?: string;
  dateTo?: string;
};

export type ProductionMonthOverview = {
  month: string;
  totalFact: number;
  forming: ProductionOverviewValue;
  sorting: ProductionOverviewValue;
  unformed: ProductionOverviewValue;
  chamotte: ProductionOverviewValue;
  granulation: ProductionOverviewValue;
};

type ProductionOverviewValue = {
  monthFact: number;
  todayFact: number;
};

export type ProductionMonthToDateValue = {
  monthPlan?: number;
  monthFactBeforeDay: number;
};

export type ProductionMonthToDate = Partial<
  Record<ProductionCategory, ProductionMonthToDateValue>
>;

type DatedProductionReport = {
  submission: DispatcherSubmission;
  reportDate: string;
};

type ProductionTotals = {
  plan: number;
  fact: number;
  hasPlan: boolean;
  hasFact: boolean;
};

export function buildProductionReportTables(
  submissions: DispatcherSubmission[],
  plans: ProductionPlan[] = [],
): ProductionReportTables {
  const dailyReports = readLatestProductionReports(submissions);

  return {
    forming: buildBrandRows(dailyReports, plans, "forming"),
    sorting: buildBrandRows(dailyReports, plans, "sorting"),
    unformed: buildBrandRows(dailyReports, plans, "unformed"),
    chamotte: buildBrandRows(dailyReports, plans, "chamotte"),
    jars: buildJarRows(dailyReports),
    granulation: buildGranulationRows(dailyReports),
  };
}

export function buildProductionReportTableTotals(
  tables: ProductionReportTables,
  range: ProductionReportDateRange = {},
): ProductionReportTableTotals {
  return {
    forming: buildBrandCategoryTotals(
      filterProductionRowsByDate(tables.forming, range),
    ),
    sorting: buildBrandCategoryTotals(
      filterProductionRowsByDate(tables.sorting, range),
    ),
    unformed: buildBrandCategoryTotals(
      filterProductionRowsByDate(tables.unformed, range),
    ),
    chamotte: buildBrandCategoryTotals(
      filterProductionRowsByDate(tables.chamotte, range),
    ),
    jars: buildJarMeasurementTotals(
      filterProductionRowsByDate(tables.jars, range),
    ),
    granulation: buildGranulationTotals(
      filterProductionRowsByDate(tables.granulation, range),
    ),
  };
}

function buildBrandCategoryTotals(
  rows: readonly ProductionBrandCategoryRow[],
): ProductionBrandCategoryTotals {
  const dayPlan = sumOptionalNumbers(rows.map((row) => row.dayPlan));
  const dayFact = sumOptionalNumbers(rows.map((row) => row.dayFact));
  const latestRow = readLatestProductionRow(rows);

  return {
    rowCount: rows.length,
    dayPlan,
    dayFact,
    monthPlan: latestRow?.monthPlan,
    monthFact: latestRow?.monthFact,
    deviation: latestRow?.deviation,
  };
}

function buildJarMeasurementTotals(
  rows: readonly ProductionJarMeasurementRow[],
): ProductionJarMeasurementTotals {
  const start = sumOptionalNumbers(rows.map((row) => row.start));
  const end = sumOptionalNumbers(rows.map((row) => row.end));
  const consumption = sumOptionalNumbers(rows.map((row) => row.consumption));
  const shipmentStart = sumOptionalNumbers(
    rows.map((row) => row.shipmentStart),
  );
  const shipmentEnd = sumOptionalNumbers(rows.map((row) => row.shipmentEnd));
  const shipmentConsumption = sumOptionalNumbers(
    rows.map((row) => row.shipmentConsumption),
  );

  return {
    rowCount: rows.length,
    start,
    end,
    consumption,
    ...(shipmentStart === undefined ? {} : { shipmentStart }),
    ...(shipmentEnd === undefined ? {} : { shipmentEnd }),
    ...(shipmentConsumption === undefined ? {} : { shipmentConsumption }),
  };
}

function buildGranulationTotals(
  rows: readonly ProductionGranulationRow[],
): ProductionGranulationTotals {
  const latestRow = readLatestProductionRow(rows);
  const platesInOperation = sumOptionalNumbers(
    rows.map((row) => row.platesInOperation),
  );
  const millHours = sumOptionalNumbers(rows.map((row) => row.millHours));
  const fraction1630Day = sumOptionalNumbers(
    rows.map((row) => row.fraction1630Day),
  );
  const fraction1218Day = sumOptionalNumbers(
    rows.map((row) => row.fraction1218Day),
  );

  return {
    rowCount: rows.length,
    platesInOperation,
    millHours,
    fraction1630Day,
    fraction1630Month: latestRow?.fraction1630Month,
    fraction1218Day,
    fraction1218Month: latestRow?.fraction1218Month,
  };
}

function filterProductionRowsByDate<Row extends ProductionReportBaseRow>(
  rows: readonly Row[],
  range: ProductionReportDateRange,
) {
  return rows.filter(
    (row) =>
      (range.dateFrom === undefined || row.reportDate >= range.dateFrom) &&
      (range.dateTo === undefined || row.reportDate <= range.dateTo),
  );
}

function sumOptionalNumbers(values: readonly (number | undefined)[]) {
  let total = 0;
  let hasValue = false;

  for (const value of values) {
    if (value === undefined) {
      continue;
    }

    total += value;
    hasValue = true;
  }

  return hasValue ? total : undefined;
}

function readLatestProductionRow<Row extends ProductionReportBaseRow>(
  rows: readonly Row[],
) {
  return rows.reduce<Row | undefined>((latest, row) => {
    if (
      latest === undefined ||
      row.reportDate > latest.reportDate ||
      (row.reportDate === latest.reportDate && row.receivedAt > latest.receivedAt)
    ) {
      return row;
    }

    return latest;
  }, undefined);
}

export function buildProductionMonthOverview(
  tables: ProductionReportTables,
  currentDate = new Date(),
): ProductionMonthOverview {
  const today = formatMoscowProductionCalendarDate(currentDate);
  const month = today.slice(0, 7);
  const forming = buildCategoryOverviewValue(tables.forming, month, today);
  const sorting = buildCategoryOverviewValue(tables.sorting, month, today);
  const unformed = buildCategoryOverviewValue(tables.unformed, month, today);
  const chamotte = buildCategoryOverviewValue(tables.chamotte, month, today);
  const granulation = buildGranulationOverviewValue(
    tables.granulation,
    month,
    today,
  );
  return {
    month,
    totalFact:
      forming.monthFact + sorting.monthFact + unformed.monthFact +
      chamotte.monthFact,
    forming,
    sorting,
    unformed,
    chamotte,
    granulation,
  };
}

function formatMoscowProductionCalendarDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const partByType = new Map(parts.map((part) => [part.type, part.value]));

  return `${partByType.get("year")}-${partByType.get("month")}-${partByType.get("day")}`;
}

function buildCategoryOverviewValue(
  rows: readonly ProductionMetricRow[],
  month: string,
  today: string,
): ProductionOverviewValue {
  const latestMonthRow = readLatestProductionRow(
    rows.filter((row) =>
      row.reportDate.startsWith(month) && row.monthFact !== undefined),
  );
  const todayRow = readLatestProductionRow(
    rows.filter((row) => row.reportDate === today),
  );

  return {
    monthFact: latestMonthRow?.monthFact ?? 0,
    todayFact: todayRow?.dayFact ?? 0,
  };
}

function buildGranulationOverviewValue(
  rows: readonly ProductionGranulationRow[],
  month: string,
  today: string,
): ProductionOverviewValue {
  const latestMonthRow = readLatestProductionRow(
    rows.filter((row) => row.reportDate.startsWith(month)),
  );
  const todayRow = readLatestProductionRow(
    rows.filter((row) => row.reportDate === today),
  );

  return {
    monthFact: (latestMonthRow?.fraction1630Month ?? 0) +
      (latestMonthRow?.fraction1218Month ?? 0),
    todayFact: (todayRow?.fraction1630Day ?? 0) +
      (todayRow?.fraction1218Day ?? 0),
  };
}

export function buildProductionMonthToDate(
  submissions: DispatcherSubmission[],
  plan: ProductionPlan | undefined,
  reportDate: string,
): ProductionMonthToDate {
  const month = reportDate.slice(0, 7);
  const applicablePlan = plan?.month === month ? plan : undefined;
  const tables = buildProductionReportTables(
    submissions,
    applicablePlan === undefined ? [] : [applicablePlan],
  );
  const result: ProductionMonthToDate = {};

  for (const category of productionCategories) {
    const latestRow = (tables[category] as ProductionMetricRow[])
      .filter(
        (row) =>
          row.reportDate.startsWith(month) && row.reportDate < reportDate,
      )
      .at(-1);
    const schedule = applicablePlan?.schedules[category];
    const scheduledMonthPlan = schedule === undefined
      ? undefined
      : schedule.dailyPlans
          .filter((dailyPlan) => dailyPlan.date <= reportDate)
          .reduce((sum, dailyPlan) => sum + dailyPlan.value, 0);
    const monthPlan = scheduledMonthPlan ?? latestRow?.monthPlan;
    const monthFactBeforeDay = latestRow?.monthFact;

    result[category] = {
      ...(monthPlan === undefined ? {} : { monthPlan }),
      monthFactBeforeDay: monthFactBeforeDay ?? 0,
    };
  }

  return result;
}

function readLatestProductionReports(
  submissions: DispatcherSubmission[],
): DatedProductionReport[] {
  const reportsByDate = new Map<string, DispatcherSubmission>();

  for (const submission of submissions) {
    if (submission.formId !== "production") continue;

    const reportDate = readPayloadDate(submission.payload.reportDate);

    if (reportDate === undefined) continue;

    const current = reportsByDate.get(reportDate);
    const submissionTimestamp = Date.parse(submission.receivedAt);
    const currentTimestamp = current === undefined
      ? Number.NEGATIVE_INFINITY
      : Date.parse(current.receivedAt);

    if (
      current === undefined ||
      submissionTimestamp > currentTimestamp ||
      (submissionTimestamp === currentTimestamp && submission.id > current.id)
    ) {
      reportsByDate.set(reportDate, submission);
    }
  }

  return [...reportsByDate.entries()]
    .map(([reportDate, submission]) => ({ reportDate, submission }))
    .sort((left, right) => left.reportDate.localeCompare(right.reportDate));
}

function buildBrandRows(
  reports: DatedProductionReport[],
  plans: ProductionPlan[],
  prefix: ProductionCategory,
): ProductionBrandCategoryRow[] {
  const totalsByMonth = new Map<string, ProductionTotals>();
  const factsByMonthAndBrand = new Map<string, number>();
  const brandLabels = new Map<string, string>();

  return reports.flatMap((report) => {
    const dailyFacts = readDailyBrandFacts(
      report.submission.payload,
      prefix,
      brandLabels,
    );
    const month = report.reportDate.slice(0, 7);
    const facts = dailyFacts.map((fact): ProductionBrandFact => {
      const key = `${month}:${normalizeBrand(fact.brand).toLocaleLowerCase("ru-RU")}`;
      const monthValue = (factsByMonthAndBrand.get(key) ?? 0) + fact.value;

      factsByMonthAndBrand.set(key, monthValue);
      return { ...fact, monthValue };
    });
    const dynamicDayFact = facts.length === 0
      ? undefined
      : facts.reduce((sum, fact) => sum + fact.value, 0);
    const legacyDayFact = isLegacySingleBrandCategory(prefix) &&
      !hasDynamicBrandFields(report.submission.payload, prefix)
      ? readNumber(report.submission.payload[`${prefix}Day`])
      : undefined;
    const dayFact = dynamicDayFact ?? legacyDayFact;
    const categoryPlan = readCategoryPlan(plans, report.reportDate, prefix);
    const legacyDayPlan = readLegacyCategoryPlan(
      report.submission.payload,
      prefix,
    );
    const dayPlan = categoryPlan.dayPlan ?? legacyDayPlan;
    const totals = readTotals(
      totalsByMonth,
      month,
    );

    addDailyValues(
      totals,
      categoryPlan.monthPlan === undefined ? legacyDayPlan : undefined,
      dayFact,
    );

    if (dayPlan === undefined && dayFact === undefined) {
      return [];
    }

    return [{
      ...readBaseRow(report),
      facts,
      dayPlan,
      dayFact,
      ...readMonthlyValues(totals, categoryPlan.monthPlan),
    }];
  });
}

function readDailyBrandFacts(
  payload: DispatcherSubmissionPayload,
  prefix: ProductionCategory,
  brandLabels: Map<string, string>,
): DailyProductionBrandFact[] {
  const factsByBrand = new Map<string, DailyProductionBrandFact>();

  for (const [fieldName, rawFact] of Object.entries(payload)) {
    const match = new RegExp(`^${prefix}Fact([1-9]\\d?)$`, "u").exec(fieldName);

    if (match === null || Number(match[1]) > 50) {
      continue;
    }

    const value = readNumber(rawFact);
    const brand = normalizeBrand(payload[`${prefix}Brand${match[1]}`]);

    if (value === undefined || brand === "Без марки") {
      continue;
    }

    const brandKey = brand.toLocaleLowerCase("ru-RU");
    const current = factsByBrand.get(brandKey);

    if (!brandLabels.has(brandKey)) {
      brandLabels.set(brandKey, brand);
    }

    factsByBrand.set(brandKey, {
      brand: current?.brand ?? brandLabels.get(brandKey) ?? brand,
      value: (current?.value ?? 0) + value,
    });
  }

  if (
    factsByBrand.size === 0 &&
    isLegacySingleBrandCategory(prefix) &&
    !hasDynamicBrandFields(payload, prefix)
  ) {
    const value = readNumber(payload[`${prefix}Day`]);
    const brand = normalizeOptionalBrand(
      payload[`${prefix}ProductBrand`] ?? payload[`${prefix}ProductBrands`],
    );

    if (value !== undefined && brand !== undefined) {
      factsByBrand.set(brand.toLocaleLowerCase("ru-RU"), { brand, value });
    }
  }

  return [...factsByBrand.values()].sort((left, right) =>
    left.brand.localeCompare(right.brand, "ru-RU"),
  );
}

function readLegacyCategoryPlan(
  payload: DispatcherSubmissionPayload,
  prefix: ProductionCategory,
) {
  if (isLegacySingleBrandCategory(prefix)) {
    return readNumber(payload[`${prefix}Plan`]);
  }

  const values = Object.entries(payload).flatMap(([fieldName, value]) =>
    new RegExp(`^${prefix}Plan[1-9]\\d?$`, "u").test(fieldName)
      ? [readNumber(value)]
      : [],
  );
  const plans = values.filter((value): value is number => value !== undefined);

  return plans.length === 0
    ? undefined
    : plans.reduce((sum, value) => sum + value, 0);
}

function hasDynamicBrandFields(
  payload: DispatcherSubmissionPayload,
  prefix: ProductionCategory,
) {
  const fieldPattern = new RegExp(`^${prefix}(?:Brand|Fact)[1-9]\\d?$`, "u");

  return Object.keys(payload).some((fieldName) => fieldPattern.test(fieldName));
}

function isLegacySingleBrandCategory(
  prefix: ProductionCategory,
): prefix is "forming" | "sorting" {
  return prefix === "forming" || prefix === "sorting";
}

function buildJarRows(
  reports: DatedProductionReport[],
): ProductionJarMeasurementRow[] {
  return reports.flatMap((report) =>
    [1, 2, 3].flatMap((jarNumber) => {
      const start = readNumber(report.submission.payload[`jarStart${jarNumber}`]);
      const end = readNumber(report.submission.payload[`jarEnd${jarNumber}`]);
      const shipmentStart = readNumber(
        report.submission.payload[`jarShipmentStart${jarNumber}`],
      );
      const shipmentEnd = readNumber(
        report.submission.payload[`jarShipmentEnd${jarNumber}`],
      );

      if (
        start === undefined &&
        end === undefined &&
        shipmentStart === undefined &&
        shipmentEnd === undefined
      ) return [];

      return [{
        ...readBaseRow(report),
        jarNumber,
        start,
        end,
        consumption:
          start !== undefined && end !== undefined ? start - end : undefined,
        ...(shipmentStart === undefined ? {} : { shipmentStart }),
        ...(shipmentEnd === undefined ? {} : { shipmentEnd }),
        ...(shipmentStart === undefined || shipmentEnd === undefined
          ? {}
          : { shipmentConsumption: shipmentStart - shipmentEnd }),
      }];
    }))
    .sort((left, right) => right.reportDate.localeCompare(left.reportDate));
}

function buildGranulationRows(
  reports: DatedProductionReport[],
): ProductionGranulationRow[] {
  const totalsByMonth = new Map<
    string,
    {
      fraction1630: number;
      fraction1218: number;
      hasFraction1630: boolean;
      hasFraction1218: boolean;
    }
  >();

  return reports.flatMap((report) => {
    const payload = report.submission.payload;
    const platesInOperation = readNumber(payload.granulationPlatesInOperation);
    const millHours = readNumber(payload.granulationMillHours);
    const fraction1630Day = readFirstNumber(payload, [
      "granulationFraction1630Day",
      "granulationFraction1600Day",
    ]);
    const fraction1218Day = readFirstNumber(payload, [
      "granulationFraction1218Day",
      "granulationSamplesDay",
    ]);
    const month = report.reportDate.slice(0, 7);
    const totals = totalsByMonth.get(month) ?? {
      fraction1630: 0,
      fraction1218: 0,
      hasFraction1630: false,
      hasFraction1218: false,
    };

    if (fraction1630Day !== undefined) {
      totals.fraction1630 += fraction1630Day;
      totals.hasFraction1630 = true;
    }

    if (fraction1218Day !== undefined) {
      totals.fraction1218 += fraction1218Day;
      totals.hasFraction1218 = true;
    }

    totalsByMonth.set(month, totals);

    if (
      platesInOperation === undefined &&
      millHours === undefined &&
      fraction1630Day === undefined &&
      fraction1218Day === undefined
    ) {
      return [];
    }

    return [{
      ...readBaseRow(report),
      platesInOperation,
      millHours,
      fraction1630Day,
      fraction1630Month: totals.hasFraction1630
        ? totals.fraction1630
        : undefined,
      fraction1218Day,
      fraction1218Month: totals.hasFraction1218
        ? totals.fraction1218
        : undefined,
    }];
  });
}

function readTotals(map: Map<string, ProductionTotals>, key: string) {
  const totals = map.get(key) ?? {
    plan: 0,
    fact: 0,
    hasPlan: false,
    hasFact: false,
  };

  map.set(key, totals);
  return totals;
}

function addDailyValues(
  totals: ProductionTotals,
  plan: number | undefined,
  fact: number | undefined,
) {
  if (plan !== undefined) {
    totals.plan += plan;
    totals.hasPlan = true;
  }

  if (fact !== undefined) {
    totals.fact += fact;
    totals.hasFact = true;
  }
}

function readMonthlyValues(
  totals: ProductionTotals,
  categoryMonthPlan?: number,
) {
  const monthPlan = categoryMonthPlan ?? (totals.hasPlan ? totals.plan : undefined);

  return {
    monthPlan,
    monthFact: totals.hasFact ? totals.fact : undefined,
    deviation:
      monthPlan !== undefined && totals.hasFact
        ? totals.fact - monthPlan
        : undefined,
  };
}

function readCategoryPlan(
  plans: ProductionPlan[],
  reportDate: string,
  category: ProductionCategory,
) {
  const plan = plans.find((item) => item.month === reportDate.slice(0, 7));

  if (plan === undefined) {
    return {};
  }

  const schedule = plan.schedules[category];

  if (schedule === undefined) {
    return {};
  }

  const dayPlan = schedule.dailyPlans.find(
    (dailyPlan) => dailyPlan.date === reportDate,
  )?.value;
  const monthPlan = schedule.dailyPlans
    .filter((dailyPlan) => dailyPlan.date <= reportDate)
    .reduce((sum, dailyPlan) => sum + dailyPlan.value, 0);

  return { dayPlan, monthPlan };
}

function readBaseRow(report: DatedProductionReport): ProductionReportBaseRow {
  return {
    reportId: report.submission.id,
    reportDate: report.reportDate,
    receivedAt: report.submission.receivedAt,
  };
}

function normalizeBrand(value: string | undefined) {
  const brand = value?.trim().replace(/\s+/gu, " ") ?? "";
  return brand.length > 0 ? brand : "Без марки";
}

function normalizeOptionalBrand(value: string | undefined) {
  const brand = value?.trim().replace(/\s+/gu, " ") ?? "";
  return brand.length === 0 ? undefined : brand;
}

function readFirstNumber(
  payload: DispatcherSubmissionPayload,
  fieldNames: string[],
) {
  for (const fieldName of fieldNames) {
    const value = readNumber(payload[fieldName]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function readNumber(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) return undefined;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readPayloadDate(value: string | undefined) {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (iso !== null) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const russian = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(normalized);
  return russian === null
    ? undefined
    : `${russian[3]}-${russian[2]}-${russian[1]}`;
}
