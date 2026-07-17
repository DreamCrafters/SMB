import type {
  DispatcherSubmission,
  DispatcherSubmissionPayload,
} from "./dispatcherSubmission.js";

export type ProductionReportBaseRow = {
  reportId: string;
  reportDate: string;
  receivedAt: string;
};

export type ProductionMetricRow = ProductionReportBaseRow & {
  dayPlan?: number;
  dayFact?: number;
  monthPlan?: number;
  monthFact?: number;
  deviation?: number;
};

export type ProductionBrandMetricRow = ProductionMetricRow & {
  brand: string;
};

export type ProductionJarMeasurementRow = ProductionReportBaseRow & {
  jarNumber: number;
  start?: number;
  end?: number;
  consumption?: number;
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
  forming: ProductionMetricRow[];
  sorting: ProductionMetricRow[];
  unformed: ProductionBrandMetricRow[];
  chamotte: ProductionBrandMetricRow[];
  jars: ProductionJarMeasurementRow[];
  granulation: ProductionGranulationRow[];
};

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
): ProductionReportTables {
  const dailyReports = readLatestProductionReports(submissions);

  return {
    forming: buildMetricRows(dailyReports, "forming"),
    sorting: buildMetricRows(dailyReports, "sorting"),
    unformed: buildBrandRows(dailyReports, "unformed", 4),
    chamotte: buildBrandRows(dailyReports, "chamotte", 1),
    jars: buildJarRows(dailyReports),
    granulation: buildGranulationRows(dailyReports),
  };
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

function buildMetricRows(
  reports: DatedProductionReport[],
  prefix: "forming" | "sorting",
): ProductionMetricRow[] {
  const totalsByMonth = new Map<string, ProductionTotals>();

  return reports.flatMap((report) => {
    const dayPlan = readNumber(report.submission.payload[`${prefix}Plan`]);
    const dayFact = readNumber(report.submission.payload[`${prefix}Day`]);
    const totals = readTotals(totalsByMonth, report.reportDate.slice(0, 7));

    addDailyValues(totals, dayPlan, dayFact);

    if (dayPlan === undefined && dayFact === undefined) return [];

    return [{
      ...readBaseRow(report),
      dayPlan,
      dayFact,
      ...readMonthlyValues(totals),
    }];
  });
}

function buildBrandRows(
  reports: DatedProductionReport[],
  prefix: "unformed" | "chamotte",
  rowCount: number,
): ProductionBrandMetricRow[] {
  const brandLabels = new Map<string, string>();
  const totalsByMonthAndBrand = new Map<string, ProductionTotals>();

  return reports.flatMap((report) => {
    const dailyValues = readDailyBrandValues(
      report.submission.payload,
      prefix,
      rowCount,
      brandLabels,
    );

    return [...dailyValues.entries()]
      .sort(([leftKey], [rightKey]) =>
        (brandLabels.get(leftKey) ?? leftKey).localeCompare(
          brandLabels.get(rightKey) ?? rightKey,
          "ru-RU",
        ))
      .map(([brandKey, daily]) => {
        const totals = readTotals(
          totalsByMonthAndBrand,
          `${report.reportDate.slice(0, 7)}:${brandKey}`,
        );

        addDailyValues(
          totals,
          daily.hasPlan ? daily.plan : undefined,
          daily.hasFact ? daily.fact : undefined,
        );

        return {
          ...readBaseRow(report),
          brand: brandLabels.get(brandKey) ?? "Без марки",
          dayPlan: daily.hasPlan ? daily.plan : undefined,
          dayFact: daily.hasFact ? daily.fact : undefined,
          ...readMonthlyValues(totals),
        };
      });
  });
}

function readDailyBrandValues(
  payload: DispatcherSubmissionPayload,
  prefix: "unformed" | "chamotte",
  rowCount: number,
  brandLabels: Map<string, string>,
) {
  const values = new Map<string, ProductionTotals>();

  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const plan = readNumber(payload[`${prefix}Plan${rowNumber}`]);
    const fact = readNumber(payload[`${prefix}Fact${rowNumber}`]);

    if (plan === undefined && fact === undefined) continue;

    const brand = normalizeBrand(payload[`${prefix}Brand${rowNumber}`]);
    const brandKey = brand.toLocaleLowerCase("ru-RU");
    const totals = readTotals(values, brandKey);

    if (!brandLabels.has(brandKey)) brandLabels.set(brandKey, brand);
    addDailyValues(totals, plan, fact);
  }

  return values;
}

function buildJarRows(
  reports: DatedProductionReport[],
): ProductionJarMeasurementRow[] {
  return reports.flatMap((report) =>
    [1, 2, 3].flatMap((jarNumber) => {
      const start = readNumber(report.submission.payload[`jarStart${jarNumber}`]);
      const end = readNumber(report.submission.payload[`jarEnd${jarNumber}`]);

      if (start === undefined && end === undefined) return [];

      return [{
        ...readBaseRow(report),
        jarNumber,
        start,
        end,
        consumption:
          start !== undefined && end !== undefined ? start - end : undefined,
      }];
    }));
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

function readMonthlyValues(totals: ProductionTotals) {
  return {
    monthPlan: totals.hasPlan ? totals.plan : undefined,
    monthFact: totals.hasFact ? totals.fact : undefined,
    deviation:
      totals.hasPlan && totals.hasFact ? totals.fact - totals.plan : undefined,
  };
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
