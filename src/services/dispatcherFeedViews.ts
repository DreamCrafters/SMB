import type {
  DispatcherFormId,
  DispatcherSubmission,
  DispatcherSubmissionPayload,
  ProductionBrandCategoryRow,
  ProductionBrandFact,
  ProductionGranulationRow,
  ProductionJarMeasurementRow,
  ProductionMetricRow,
  ProductionReportTables,
} from "../contracts";

export type DispatcherFeedGroup =
  | "production"
  | "equipment"
  | "incidents"
  | "visitors";

export type DispatcherFeedPeriod =
  | "today"
  | "current_month"
  | "current_year"
  | "custom";

export type EquipmentSummaryRow = {
  equipment: string;
  productionTons: number;
  downtimeHours: number;
  downtimeReasons: {
    reason: string;
    hours: number;
  }[];
};

export type EquipmentDetailRow = {
  reportDate: string;
  productionTons: number;
  downtimeHours: number;
  downtimeReasons: {
    reason: string;
    hours: number;
  }[];
  notes: string[];
  receivedAt: string;
  submissionCount: number;
};

export type IncidentSummaryRow = {
  incidentNumber: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string;
  location?: string;
  incidentType?: string;
  criticality?: string;
  description?: string;
  approvedBy?: string;
};

export type OpenIncidentOption = {
  incidentNumber: string;
  label: string;
  openedAt: string;
  location?: string;
  incidentType?: string;
  criticality?: string;
};

export type VisitorVisitRow = {
  entryId: string;
  fio: string;
  organization?: string;
  whom?: string;
  entryAt: string;
  exitAt?: string;
};

export type OpenVisitorOption = {
  entryId: string;
  label: string;
  fio: string;
  organization?: string;
  whom?: string;
  entryAt: string;
};

export type OwnerEquipmentWorkingCount = {
  key: string;
  label: string;
  count: number;
};

export type OwnerEquipmentOverview = {
  updatedAt: string;
  reportDate?: string;
  workingCounts: OwnerEquipmentWorkingCount[];
};

export type OwnerIncidentOverview = {
  updatedAt: string;
  incidentNumber: string;
  dateTime?: string;
  location?: string;
  incidentType?: string;
  description?: string;
  criticality?: string;
  responsible?: string;
  immediateActions?: string;
  status: string;
};

export type OwnerIncidentClosureOverview = {
  updatedAt: string;
  incidentNumber: string;
  rootCauses?: string;
  preventiveMeasures?: string;
  closureDateTime?: string;
  costs?: string;
  approvedBy?: string;
  closureNote?: string;
  status: string;
};

export type OwnerVisitorsOverview = {
  latestDate?: string;
  count: number;
  hosts: string[];
  openCount: number;
};

export type OwnerDispatcherOverview = {
  equipment?: OwnerEquipmentOverview;
  latestIncident?: OwnerIncidentOverview;
  latestIncidentClosure?: OwnerIncidentClosureOverview;
  visitors: OwnerVisitorsOverview;
};

export type DateRange = {
  dateFrom?: string;
  dateTo?: string;
};

export type OpenVisitorEntry = {
  submission: DispatcherSubmission;
  key: string;
  entryAt: string;
};

type OpenIncidentEntry = {
  submission: DispatcherSubmission;
  incidentNumber: string;
  openedAt: string;
};

export function buildDispatcherFeedDateRange(
  period: DispatcherFeedPeriod,
  currentDate = new Date(),
): DateRange {
  if (period === "custom") {
    return {};
  }

  const today = formatDateValue(currentDate);

  if (period === "today") {
    return {
      dateFrom: today,
      dateTo: today,
    };
  }

  return {
    dateFrom:
      period === "current_month"
        ? `${today.slice(0, 7)}-01`
        : `${today.slice(0, 4)}-01-01`,
    dateTo: today,
  };
}

export function buildOwnerDispatcherOverview(
  submissions: DispatcherSubmission[],
): OwnerDispatcherOverview {
  return {
    equipment: buildOwnerEquipmentOverview(submissions),
    latestIncident: buildOwnerIncidentOverview(submissions),
    latestIncidentClosure:
      buildOwnerIncidentClosureOverview(submissions),
    visitors: buildOwnerVisitorsOverview(submissions),
  };
}

export function buildEquipmentSummaryRows(
  submissions: DispatcherSubmission[],
  range: DateRange,
): EquipmentSummaryRow[] {
  const rowsByEquipment = new Map<
    string,
    {
      productionTons: number;
      downtimeHours: number;
      downtimeReasons: Map<string, number>;
    }
  >();

  for (const submission of submissions) {
    if (submission.formId !== "equipment") {
      continue;
    }

    const reportDate = readPayloadDate(submission.payload.reportDate);

    if (reportDate === undefined || !isDateInRange(reportDate, range)) {
      continue;
    }

    const equipment = submission.payload.equipment?.trim();

    if (equipment === undefined || equipment.length === 0) {
      continue;
    }

    const row =
      rowsByEquipment.get(equipment) ??
      {
        productionTons: 0,
        downtimeHours: 0,
        downtimeReasons: new Map<string, number>(),
      };
    const productionTons = readNumber(submission.payload.productionTons) ?? 0;
    const downtimeHours = readNumber(submission.payload.downtimeHours) ?? 0;
    const downtimeReason = submission.payload.downtimeReason?.trim();

    row.productionTons += productionTons;
    row.downtimeHours += downtimeHours;

    if (
      downtimeReason !== undefined &&
      downtimeReason.length > 0 &&
      downtimeHours > 0
    ) {
      row.downtimeReasons.set(
        downtimeReason,
        (row.downtimeReasons.get(downtimeReason) ?? 0) + downtimeHours,
      );
    }

    rowsByEquipment.set(equipment, row);
  }

  return [...rowsByEquipment.entries()]
    .map(([equipment, row]) => ({
      equipment,
      productionTons: row.productionTons,
      downtimeHours: row.downtimeHours,
      downtimeReasons: [...row.downtimeReasons.entries()]
        .map(([reason, hours]) => ({ reason, hours }))
        .sort((left, right) => right.hours - left.hours),
    }))
    .sort((left, right) => left.equipment.localeCompare(right.equipment, "ru"));
}

export function buildEquipmentDetailRows(
  submissions: DispatcherSubmission[],
  equipment: string,
  range: DateRange,
): EquipmentDetailRow[] {
  const requestedEquipment = equipment.trim().toLocaleLowerCase("ru-RU");
  const rowsByDate = new Map<
    string,
    {
      productionTons: number;
      downtimeHours: number;
      downtimeReasons: Map<string, number>;
      notes: Set<string>;
      latestSubmission: DispatcherSubmission;
      submissionCount: number;
    }
  >();

  if (requestedEquipment.length === 0) {
    return [];
  }

  for (const submission of submissions) {
    if (submission.formId !== "equipment") {
      continue;
    }

    const reportDate = readPayloadDate(submission.payload.reportDate);

    if (reportDate === undefined || !isDateInRange(reportDate, range)) {
      continue;
    }

    const submissionEquipment = submission.payload.equipment?.trim();

    if (
      submissionEquipment === undefined ||
      submissionEquipment.toLocaleLowerCase("ru-RU") !== requestedEquipment
    ) {
      continue;
    }

    const row =
      rowsByDate.get(reportDate) ??
      {
        productionTons: 0,
        downtimeHours: 0,
        downtimeReasons: new Map<string, number>(),
        notes: new Set<string>(),
        latestSubmission: submission,
        submissionCount: 0,
      };
    const productionTons = readNumber(submission.payload.productionTons) ?? 0;
    const downtimeHours = readNumber(submission.payload.downtimeHours) ?? 0;
    const downtimeReason = submission.payload.downtimeReason?.trim();
    const note = submission.payload.note?.trim();

    row.productionTons += productionTons;
    row.downtimeHours += downtimeHours;
    row.submissionCount += 1;

    if (
      downtimeReason !== undefined &&
      downtimeReason.length > 0 &&
      downtimeHours > 0
    ) {
      row.downtimeReasons.set(
        downtimeReason,
        (row.downtimeReasons.get(downtimeReason) ?? 0) + downtimeHours,
      );
    }

    if (note !== undefined && note.length > 0) {
      row.notes.add(note);
    }

    if (compareSubmissionsAscending(row.latestSubmission, submission) <= 0) {
      row.latestSubmission = submission;
    }

    rowsByDate.set(reportDate, row);
  }

  return [...rowsByDate.entries()]
    .map(([reportDate, row]) => ({
      reportDate,
      productionTons: row.productionTons,
      downtimeHours: row.downtimeHours,
      downtimeReasons: [...row.downtimeReasons.entries()]
        .map(([reason, hours]) => ({ reason, hours }))
        .sort((left, right) => right.hours - left.hours),
      notes: [...row.notes],
      receivedAt: row.latestSubmission.receivedAt,
      submissionCount: row.submissionCount,
    }))
    .sort((left, right) => left.reportDate.localeCompare(right.reportDate));
}

export function buildProductionReportTables(
  submissions: DispatcherSubmission[],
  range: DateRange,
): ProductionReportTables {
  const dailyReports = readLatestProductionReports(submissions);

  return {
    forming: buildProductionMetricRows(dailyReports, range, "forming"),
    sorting: buildProductionMetricRows(dailyReports, range, "sorting"),
    unformed: buildProductionBrandRows(dailyReports, range, "unformed"),
    chamotte: buildProductionBrandRows(dailyReports, range, "chamotte"),
    jars: buildProductionJarMeasurementRows(dailyReports, range),
    granulation: buildProductionGranulationRows(dailyReports, range),
  };
}

export function filterProductionReportTables(
  tables: ProductionReportTables,
  range: DateRange,
): ProductionReportTables {
  return {
    forming: tables.forming.filter((row) => isDateInRange(row.reportDate, range)),
    sorting: tables.sorting.filter((row) => isDateInRange(row.reportDate, range)),
    unformed: tables.unformed.filter((row) => isDateInRange(row.reportDate, range)),
    chamotte: tables.chamotte.filter((row) => isDateInRange(row.reportDate, range)),
    jars: tables.jars.filter((row) => isDateInRange(row.reportDate, range)),
    granulation: tables.granulation.filter((row) =>
      isDateInRange(row.reportDate, range)),
  };
}

type DatedProductionReport = {
  submission: DispatcherSubmission;
  reportDate: string;
};

function readLatestProductionReports(
  submissions: DispatcherSubmission[],
): DatedProductionReport[] {
  const reportsByDate = new Map<string, DispatcherSubmission>();

  for (const submission of submissions) {
    if (submission.formId !== "production") {
      continue;
    }

    const reportDate = readPayloadDate(submission.payload.reportDate);

    if (reportDate === undefined) {
      continue;
    }

    const current = reportsByDate.get(reportDate);

    if (
      current === undefined ||
      readTimestamp(submission.receivedAt) > readTimestamp(current.receivedAt) ||
      (submission.receivedAt === current.receivedAt && submission.id > current.id)
    ) {
      reportsByDate.set(reportDate, submission);
    }
  }

  return [...reportsByDate.entries()]
    .map(([reportDate, submission]) => ({ reportDate, submission }))
    .sort((left, right) => left.reportDate.localeCompare(right.reportDate));
}

function buildProductionMetricRows(
  reports: DatedProductionReport[],
  range: DateRange,
  prefix: "forming" | "sorting",
): ProductionMetricRow[] {
  const totalsByMonth = new Map<
    string,
    { plan: number; fact: number; hasPlan: boolean; hasFact: boolean }
  >();
  const rows: ProductionMetricRow[] = [];

  for (const report of reports) {
    const dayPlan = readNumber(report.submission.payload[`${prefix}Plan`]);
    const dayFact = readNumber(report.submission.payload[`${prefix}Day`]);
    const brand = readOptionalProductionBrandLabel(
      report.submission.payload[`${prefix}ProductBrand`] ??
        report.submission.payload[`${prefix}ProductBrands`],
    );
    const month = report.reportDate.slice(0, 7);
    const totals = totalsByMonth.get(month) ?? {
      plan: 0,
      fact: 0,
      hasPlan: false,
      hasFact: false,
    };

    if (dayPlan !== undefined) {
      totals.plan += dayPlan;
      totals.hasPlan = true;
    }

    if (dayFact !== undefined) {
      totals.fact += dayFact;
      totals.hasFact = true;
    }

    totalsByMonth.set(month, totals);

    if (
      (dayPlan === undefined && dayFact === undefined) ||
      !isDateInRange(report.reportDate, range)
    ) {
      continue;
    }

    rows.push({
      reportId: report.submission.id,
      reportDate: report.reportDate,
      ...(brand === undefined ? {} : { brand }),
      dayPlan,
      dayFact,
      monthPlan: totals.hasPlan ? totals.plan : undefined,
      monthFact: totals.hasFact ? totals.fact : undefined,
      deviation:
        totals.hasPlan && totals.hasFact ? totals.fact - totals.plan : undefined,
      receivedAt: report.submission.receivedAt,
    });
  }

  return rows;
}

function buildProductionBrandRows(
  reports: DatedProductionReport[],
  range: DateRange,
  prefix: "unformed" | "chamotte",
): ProductionBrandCategoryRow[] {
  const brandLabels = new Map<string, string>();
  const totalsByMonth = new Map<
    string,
    { plan: number; fact: number; hasPlan: boolean; hasFact: boolean }
  >();
  const factsByMonthAndBrand = new Map<string, number>();
  const rows: ProductionBrandCategoryRow[] = [];

  for (const report of reports) {
    const dailyFacts = readDailyProductionBrandFacts(
      report.submission.payload,
      prefix,
      brandLabels,
    );
    const month = report.reportDate.slice(0, 7);
    const facts = dailyFacts.map((fact): ProductionBrandFact => {
      const key = `${month}:${fact.brand.toLocaleLowerCase("ru-RU")}`;
      const monthValue = (factsByMonthAndBrand.get(key) ?? 0) + fact.value;

      factsByMonthAndBrand.set(key, monthValue);
      return { ...fact, monthValue };
    });
    const dayFact = facts.length === 0
      ? undefined
      : facts.reduce((sum, fact) => sum + fact.value, 0);
    const dayPlan = readLegacyProductionBrandPlan(
      report.submission.payload,
      prefix,
    );
    const totals = totalsByMonth.get(month) ?? {
      plan: 0,
      fact: 0,
      hasPlan: false,
      hasFact: false,
    };

    if (dayPlan !== undefined) {
      totals.plan += dayPlan;
      totals.hasPlan = true;
    }

    if (dayFact !== undefined) {
      totals.fact += dayFact;
      totals.hasFact = true;
    }

    totalsByMonth.set(month, totals);

    if (
      (dayPlan === undefined && dayFact === undefined) ||
      !isDateInRange(report.reportDate, range)
    ) continue;

    rows.push({
      reportId: report.submission.id,
      reportDate: report.reportDate,
      facts,
      dayPlan,
      dayFact,
      monthPlan: totals.hasPlan ? totals.plan : undefined,
      monthFact: totals.hasFact ? totals.fact : undefined,
      deviation:
        totals.hasPlan && totals.hasFact ? totals.fact - totals.plan : undefined,
      receivedAt: report.submission.receivedAt,
    });
  }

  return rows;
}

function readDailyProductionBrandFacts(
  payload: DispatcherSubmissionPayload,
  prefix: "unformed" | "chamotte",
  brandLabels: Map<string, string>,
) {
  const facts = new Map<string, Omit<ProductionBrandFact, "monthValue">>();

  for (const [fieldName, rawValue] of Object.entries(payload)) {
    const match = new RegExp(`^${prefix}Fact([1-9]\\d?)$`, "u").exec(fieldName);

    if (match === null || Number(match[1]) > 50) {
      continue;
    }

    const fact = readNumber(rawValue);
    const brand = normalizeProductionBrandLabel(
      payload[`${prefix}Brand${match[1]}`],
    );

    if (fact === undefined || brand === "Без марки") continue;

    const brandKey = brand.toLocaleLowerCase("ru-RU");
    const current = facts.get(brandKey);

    if (!brandLabels.has(brandKey)) {
      brandLabels.set(brandKey, brand);
    }

    facts.set(brandKey, {
      brand: current?.brand ?? brandLabels.get(brandKey) ?? brand,
      value: (current?.value ?? 0) + fact,
    });
  }

  return [...facts.values()].sort((left, right) =>
    left.brand.localeCompare(right.brand, "ru-RU"),
  );
}

function readLegacyProductionBrandPlan(
  payload: DispatcherSubmissionPayload,
  prefix: "unformed" | "chamotte",
) {
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

function normalizeProductionBrandLabel(value: string | undefined) {
  const brand = value?.trim().replace(/\s+/gu, " ") ?? "";

  return brand.length > 0 ? brand : "Без марки";
}

function readOptionalProductionBrandLabel(value: string | undefined) {
  const brand = value?.trim().replace(/\s+/gu, " ") ?? "";
  return brand.length === 0 ? undefined : brand;
}

function buildProductionJarMeasurementRows(
  reports: DatedProductionReport[],
  range: DateRange,
): ProductionJarMeasurementRow[] {
  return reports.flatMap((report) => {
    if (!isDateInRange(report.reportDate, range)) {
      return [];
    }

    return [1, 2, 3].flatMap((jarNumber) => {
      const start = readNumber(report.submission.payload[`jarStart${jarNumber}`]);
      const end = readNumber(report.submission.payload[`jarEnd${jarNumber}`]);

      if (start === undefined && end === undefined) {
        return [];
      }

      return [
        {
          reportId: report.submission.id,
          reportDate: report.reportDate,
          jarNumber,
          start,
          end,
          consumption:
            start !== undefined && end !== undefined ? start - end : undefined,
          receivedAt: report.submission.receivedAt,
        },
      ];
    });
  });
}

function buildProductionGranulationRows(
  reports: DatedProductionReport[],
  range: DateRange,
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
  const rows: ProductionGranulationRow[] = [];

  for (const report of reports) {
    const payload = report.submission.payload;
    const platesInOperation = readNumber(payload.granulationPlatesInOperation);
    const millHours = readNumber(payload.granulationMillHours);
    const fraction1630Day = readFirstPayloadNumber(payload, [
      "granulationFraction1630Day",
      "granulationFraction1600Day",
    ]);
    const fraction1218Day = readFirstPayloadNumber(payload, [
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
      !isDateInRange(report.reportDate, range) ||
      (platesInOperation === undefined &&
        millHours === undefined &&
        fraction1630Day === undefined &&
        fraction1218Day === undefined)
    ) {
      continue;
    }

    rows.push({
      reportId: report.submission.id,
      reportDate: report.reportDate,
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
      receivedAt: report.submission.receivedAt,
    });
  }

  return rows;
}

function readFirstPayloadNumber(
  payload: DispatcherSubmissionPayload,
  fieldNames: string[],
) {
  for (const fieldName of fieldNames) {
    const value = readNumber(payload[fieldName]);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function buildOwnerEquipmentOverview(
  submissions: DispatcherSubmission[],
): OwnerEquipmentOverview | undefined {
  const equipmentSubmissions = submissions.filter(
    (submission) =>
      submission.formId === "equipment" &&
      readPayloadDate(submission.payload.reportDate) !== undefined,
  );
  const latestEquipmentSubmission = findLatestSubmission(equipmentSubmissions);

  if (latestEquipmentSubmission === undefined) {
    return undefined;
  }

  const reportDate = readPayloadDate(latestEquipmentSubmission.payload.reportDate);
  const latestReportSubmissions =
    reportDate === undefined
      ? [latestEquipmentSubmission]
      : equipmentSubmissions.filter(
          (submission) => readPayloadDate(submission.payload.reportDate) === reportDate,
        );
  const latestSubmissionByEquipment = new Map<string, DispatcherSubmission>();

  for (const submission of latestReportSubmissions) {
    const equipment = submission.payload.equipment?.trim();

    if (equipment === undefined || equipment.length === 0) {
      continue;
    }

    const current = latestSubmissionByEquipment.get(equipment);

    if (
      current === undefined ||
      compareSubmissionsAscending(current, submission) <= 0
    ) {
      latestSubmissionByEquipment.set(equipment, submission);
    }
  }

  return {
    updatedAt: latestEquipmentSubmission.receivedAt,
    reportDate,
    workingCounts: buildEquipmentWorkingCounts([
      ...latestSubmissionByEquipment.values(),
    ]),
  };
}

function buildOwnerIncidentOverview(
  submissions: DispatcherSubmission[],
): OwnerIncidentOverview | undefined {
  const latestIncident = findLatestSubmission(
    submissions.filter((submission) => submission.formId === "incident"),
  );

  if (latestIncident === undefined) {
    return undefined;
  }

  return {
    updatedAt: latestIncident.receivedAt,
    incidentNumber: readIncidentNumber(latestIncident),
    dateTime: latestIncident.payload.datetime,
    location: latestIncident.payload.location,
    incidentType: latestIncident.payload.incidentType,
    description: latestIncident.payload.description,
    criticality: latestIncident.payload.criticality,
    responsible: latestIncident.payload.responsible,
    immediateActions: latestIncident.payload.immediateActions,
    status: latestIncident.payload.incidentStatus ?? "Новый",
  };
}

function buildOwnerIncidentClosureOverview(
  submissions: DispatcherSubmission[],
): OwnerIncidentClosureOverview | undefined {
  const latestClosure = findLatestSubmission(
    submissions.filter((submission) => submission.formId === "incident_close"),
  );

  if (latestClosure === undefined) {
    return undefined;
  }

  return {
    updatedAt: latestClosure.receivedAt,
    incidentNumber: latestClosure.payload.incidentNumber?.trim() || latestClosure.id,
    rootCauses: latestClosure.payload.rootCauses,
    preventiveMeasures: latestClosure.payload.preventiveMeasures,
    closureDateTime: latestClosure.payload.closureDateTime,
    costs: latestClosure.payload.costs,
    approvedBy: latestClosure.payload.approvedBy,
    closureNote: latestClosure.payload.closureNote,
    status: latestClosure.payload.incidentStatus ?? "Закрыт",
  };
}

function buildOwnerVisitorsOverview(
  submissions: DispatcherSubmission[],
): OwnerVisitorsOverview {
  const visitorEntries = submissions.filter(
    (submission) =>
      submission.formId === "visitor" &&
      readPayloadDate(submission.payload.entryAt ?? submission.receivedAt) !==
        undefined,
  );
  const latestDate = visitorEntries
    .map((submission) => readPayloadDate(submission.payload.entryAt ?? submission.receivedAt))
    .filter((value): value is string => value !== undefined)
    .sort((left, right) => right.localeCompare(left))[0];
  const latestDateEntries =
    latestDate === undefined
      ? []
      : visitorEntries.filter(
          (submission) =>
            readPayloadDate(submission.payload.entryAt ?? submission.receivedAt) ===
            latestDate,
        );

  return {
    latestDate,
    count: latestDateEntries.length,
    hosts: readUniqueValues(
      latestDateEntries.map((submission) => submission.payload.whom),
    ),
    openCount: buildOpenVisitorOptions(submissions).length,
  };
}

export function buildIncidentSummaryRows(
  submissions: DispatcherSubmission[],
  range: DateRange,
): IncidentSummaryRow[] {
  const openings = submissions
    .filter((submission) => submission.formId === "incident")
    .sort(compareSubmissionsAscending);
  const closuresByNumber = new Map<string, DispatcherSubmission>();

  for (const closure of submissions
    .filter((submission) => submission.formId === "incident_close")
    .sort(compareSubmissionsAscending)) {
    const incidentNumber = closure.payload.incidentNumber?.trim();

    if (incidentNumber !== undefined && incidentNumber.length > 0) {
      closuresByNumber.set(incidentNumber, closure);
    }
  }

  const start = range.dateFrom === undefined ? undefined : readDateStart(range.dateFrom);
  const end = range.dateTo === undefined ? undefined : readDateEnd(range.dateTo);

  return openings
    .map((opening) => {
      const incidentNumber =
        opening.payload.incidentNumber?.trim() || opening.id;
      const closure = closuresByNumber.get(incidentNumber);
      const openedAt = readPayloadDateTime(opening.payload.datetime);
      const closedAt =
        closure === undefined
          ? undefined
          : readPayloadDateTime(closure.payload.closureDateTime);
      const status: IncidentSummaryRow["status"] =
        closure === undefined ? "open" : "closed";

      return {
        incidentNumber,
        status,
        openedAt: opening.payload.datetime ?? opening.receivedAt,
        closedAt: closure?.payload.closureDateTime,
        location: opening.payload.location,
        incidentType: opening.payload.incidentType,
        criticality: opening.payload.criticality,
        description: opening.payload.description,
        approvedBy: closure?.payload.approvedBy,
        openedAtTime: openedAt ?? readTimestamp(opening.receivedAt),
        closedAtTime: closedAt ?? readOptionalTimestamp(closure?.receivedAt),
      };
    })
    .filter((row) => {
      const openedAt = row.openedAtTime;
      const closedAt = row.closedAtTime;

      if (end !== undefined && openedAt !== undefined && openedAt > end) {
        return false;
      }

      if (start !== undefined && closedAt !== undefined && closedAt < start) {
        return false;
      }

      return true;
    })
    .sort((left, right) => (right.openedAtTime ?? 0) - (left.openedAtTime ?? 0))
    .map(({ openedAtTime: _openedAtTime, closedAtTime: _closedAtTime, ...row }) => row);
}

export function buildVisitorVisitRows(
  submissions: DispatcherSubmission[],
  range: DateRange,
): VisitorVisitRow[] {
  const entries = submissions
    .filter((submission) => submission.formId === "visitor")
    .sort(compareSubmissionsAscending);
  const exits = submissions
    .filter((submission) => submission.formId === "visitor_exit")
    .sort(compareSubmissionsAscending);
  const exitsByEntryId = new Map<string, DispatcherSubmission>();

  for (const exit of exits) {
    const entryId = exit.payload.visitorEntryId;

    if (entryId !== undefined && entryId.length > 0) {
      exitsByEntryId.set(entryId, exit);
    }
  }

  const usedLegacyExitIds = new Set<string>();

  return entries
    .filter((entry) => {
      const entryDate = readPayloadDate(entry.payload.entryAt);

      return entryDate !== undefined && isDateInRange(entryDate, range);
    })
    .map((entry) => {
      const key = buildVisitorKey(entry.payload);
      const exit =
        exitsByEntryId.get(entry.id) ??
        exits.find((item) => {
          if (usedLegacyExitIds.has(item.id)) {
            return false;
          }

          return (
            item.payload.visitorEntryId === undefined &&
            buildVisitorKey(item.payload) === key &&
            (readPayloadDateTime(item.payload.exitAt) ?? readTimestamp(item.receivedAt)) >=
              (readPayloadDateTime(entry.payload.entryAt) ??
                readTimestamp(entry.receivedAt))
          );
        });

      if (exit !== undefined) {
        usedLegacyExitIds.add(exit.id);
      }

      return {
        entryId: entry.id,
        fio: entry.payload.fio ?? "Посетитель без ФИО",
        organization: entry.payload.organization,
        whom: entry.payload.whom,
        entryAt: entry.payload.entryAt ?? entry.receivedAt,
        exitAt: exit?.payload.exitAt,
      };
    })
    .sort((left, right) => left.entryAt.localeCompare(right.entryAt));
}

export function buildOpenVisitorOptions(
  submissions: DispatcherSubmission[],
  entryDate?: string,
): OpenVisitorOption[] {
  return buildOpenVisitorEntries(submissions, entryDate)
    .map(({ submission }) => ({
      entryId: submission.id,
      label: formatOpenVisitorLabel(submission.payload),
      fio: submission.payload.fio ?? "",
      organization: submission.payload.organization,
      whom: submission.payload.whom,
      entryAt: submission.payload.entryAt ?? submission.receivedAt,
    }))
    .sort((left, right) => right.entryAt.localeCompare(left.entryAt));
}

export function buildOpenIncidentOptions(
  submissions: DispatcherSubmission[],
): OpenIncidentOption[] {
  return buildOpenIncidentEntries(submissions)
    .map(({ submission, incidentNumber, openedAt }) => ({
      incidentNumber,
      label: formatOpenIncidentLabel(submission.payload, incidentNumber, openedAt),
      openedAt,
      location: submission.payload.location,
      incidentType: submission.payload.incidentType,
      criticality: submission.payload.criticality,
    }))
    .sort((left, right) => right.openedAt.localeCompare(left.openedAt));
}

export function findOpenIncidentByNumber(
  submissions: DispatcherSubmission[],
  incidentNumber: string | undefined,
) {
  const trimmedNumber = incidentNumber?.trim();

  if (trimmedNumber === undefined || trimmedNumber.length === 0) {
    return undefined;
  }

  return buildOpenIncidentEntries(submissions).find(
    (entry) => entry.incidentNumber === trimmedNumber,
  );
}

export function findOpenVisitorByEntryPayload(
  submissions: DispatcherSubmission[],
  payload: DispatcherSubmissionPayload,
) {
  const visitorKey = buildVisitorKey(payload);

  return buildOpenVisitorEntries(submissions).find(
    (entry) => entry.key === visitorKey,
  );
}

export function findOpenVisitorByEntryId(
  submissions: DispatcherSubmission[],
  visitorEntryId: string | undefined,
  entryDate?: string,
) {
  if (visitorEntryId === undefined || visitorEntryId.trim().length === 0) {
    return undefined;
  }

  return buildOpenVisitorEntries(submissions, entryDate).find(
    (entry) => entry.submission.id === visitorEntryId,
  );
}

function buildOpenVisitorEntries(
  submissions: DispatcherSubmission[],
  entryDate?: string,
): OpenVisitorEntry[] {
  const openEntries: OpenVisitorEntry[] = [];

  for (const submission of submissions
    .filter((item) => item.formId === "visitor" || item.formId === "visitor_exit")
    .sort(compareSubmissionsAscending)) {
    if (submission.formId === "visitor") {
      const visitorEntryAt = submission.payload.entryAt ?? submission.receivedAt;

      if (
        entryDate !== undefined &&
        readPayloadDate(visitorEntryAt) !== entryDate
      ) {
        continue;
      }

      openEntries.push({
        submission,
        key: buildVisitorKey(submission.payload),
        entryAt: visitorEntryAt,
      });
      continue;
    }

    const visitorEntryId = submission.payload.visitorEntryId;
    const index =
      visitorEntryId !== undefined
        ? openEntries.findIndex((entry) => entry.submission.id === visitorEntryId)
        : openEntries.findIndex(
            (entry) => entry.key === buildVisitorKey(submission.payload),
          );

    if (index >= 0) {
      openEntries.splice(index, 1);
    }
  }

  return openEntries;
}

function buildOpenIncidentEntries(
  submissions: DispatcherSubmission[],
): OpenIncidentEntry[] {
  const openEntries: OpenIncidentEntry[] = [];

  for (const submission of submissions
    .filter((item) => item.formId === "incident" || item.formId === "incident_close")
    .sort(compareSubmissionsAscending)) {
    if (submission.formId === "incident") {
      const incidentNumber = readIncidentNumber(submission);

      openEntries.push({
        submission,
        incidentNumber,
        openedAt: submission.payload.datetime ?? submission.receivedAt,
      });
      continue;
    }

    const incidentNumber = submission.payload.incidentNumber?.trim();

    if (incidentNumber === undefined || incidentNumber.length === 0) {
      continue;
    }

    const index = openEntries.findIndex(
      (entry) => entry.incidentNumber === incidentNumber,
    );

    if (index >= 0) {
      openEntries.splice(index, 1);
    }
  }

  return openEntries;
}

function formatOpenVisitorLabel(payload: DispatcherSubmissionPayload) {
  const parts = [
    payload.fio,
    payload.organization,
    payload.entryAt === undefined ? undefined : `вход ${payload.entryAt}`,
  ].filter((value): value is string => value !== undefined && value.length > 0);

  return parts.join(" · ");
}

function formatOpenIncidentLabel(
  payload: DispatcherSubmissionPayload,
  incidentNumber: string,
  openedAt: string,
) {
  const parts = [
    incidentNumber,
    payload.location,
    payload.incidentType,
    payload.criticality,
    `открыт ${openedAt}`,
  ].filter((value): value is string => value !== undefined && value.length > 0);

  return parts.join(" · ");
}

function readIncidentNumber(submission: DispatcherSubmission) {
  return submission.payload.incidentNumber?.trim() || submission.id;
}

function buildEquipmentWorkingCounts(
  submissions: DispatcherSubmission[],
): OwnerEquipmentWorkingCount[] {
  const groupsByKey = new Map<
    string,
    {
      label: string;
      order: number;
      count: number;
    }
  >();

  for (const submission of submissions) {
    const equipment = submission.payload.equipment?.trim();

    if (equipment === undefined || equipment.length === 0) {
      continue;
    }

    const group = readEquipmentWorkingGroup(equipment);
    const current =
      groupsByKey.get(group.key) ??
      {
        label: group.label,
        order: group.order,
        count: 0,
      };

    if ((readNumber(submission.payload.productionTons) ?? 0) > 0) {
      current.count += 1;
    }

    groupsByKey.set(group.key, current);
  }

  return [...groupsByKey.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      count: group.count,
      order: group.order,
    }))
    .sort(
      (left, right) =>
        left.order - right.order || left.label.localeCompare(right.label, "ru"),
    )
    .map(({ order: _order, ...group }) => group);
}

function readEquipmentWorkingGroup(equipment: string) {
  if (equipment.startsWith("Пресс")) {
    return {
      key: "press",
      label: "Прессов",
      order: 0,
    };
  }

  if (equipment.startsWith("Бегуны")) {
    return {
      key: "runner",
      label: "Бегунов",
      order: 1,
    };
  }

  if (equipment.startsWith("Дезинтегратор")) {
    return {
      key: "disintegrator",
      label: "Дезинтегратор",
      order: 2,
    };
  }

  if (equipment.startsWith("Сушильный")) {
    return {
      key: "dryer",
      label: "Сушильный",
      order: 3,
    };
  }

  if (equipment.startsWith("Шаровая")) {
    return {
      key: "ball_mill",
      label: "Шаровая",
      order: 4,
    };
  }

  const label = equipment.replace(/\s*№.*$/, "").trim() || equipment;

  return {
    key: `equipment:${label.toLocaleLowerCase("ru-RU")}`,
    label,
    order: 100,
  };
}

function readUniqueValues(values: (string | undefined)[]) {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();

    if (normalized === undefined || normalized.length === 0) {
      continue;
    }

    const key = normalized.toLocaleLowerCase("ru-RU");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueValues.push(normalized);
  }

  return uniqueValues;
}

function findLatestSubmission(submissions: DispatcherSubmission[]) {
  return submissions.reduce<DispatcherSubmission | undefined>(
    (latest, submission) => {
      if (latest === undefined) {
        return submission;
      }

      const timestampDelta =
        readTimestamp(submission.receivedAt) - readTimestamp(latest.receivedAt);

      if (timestampDelta > 0) {
        return submission;
      }

      if (timestampDelta === 0 && submission.id.localeCompare(latest.id) > 0) {
        return submission;
      }

      return latest;
    },
    undefined,
  );
}

function buildVisitorKey(payload: DispatcherSubmissionPayload) {
  return [payload.fio, payload.organization]
    .map((value) => value?.trim().toLocaleLowerCase("ru-RU") ?? "")
    .join("|");
}

function isDateInRange(value: string, range: DateRange) {
  if (range.dateFrom !== undefined && value < range.dateFrom) {
    return false;
  }

  if (range.dateTo !== undefined && value > range.dateTo) {
    return false;
  }

  return true;
}

function formatDateValue(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function readPayloadDate(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const scriptMatch = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(value);

  if (scriptMatch !== null) {
    return `${scriptMatch[3]}-${scriptMatch[2]}-${scriptMatch[1]}`;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (isoMatch !== null) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  return undefined;
}

function readPayloadDateTime(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const scriptMatch =
    /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(value);

  if (scriptMatch !== null) {
    return new Date(
      Number(scriptMatch[3]),
      Number(scriptMatch[2]) - 1,
      Number(scriptMatch[1]),
      Number(scriptMatch[4] ?? "0"),
      Number(scriptMatch[5] ?? "0"),
    ).getTime();
  }

  const isoTimestamp = Date.parse(value);

  return Number.isNaN(isoTimestamp) ? undefined : isoTimestamp;
}

function readDateStart(value: string) {
  return new Date(`${value}T00:00:00`).getTime();
}

function readDateEnd(value: string) {
  return new Date(`${value}T23:59:59.999`).getTime();
}

function compareSubmissionsAscending(
  left: DispatcherSubmission,
  right: DispatcherSubmission,
) {
  const timestampDelta =
    readTimestamp(left.receivedAt) - readTimestamp(right.receivedAt);

  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  return readVisitorLifecycleRank(left) - readVisitorLifecycleRank(right);
}

function readVisitorLifecycleRank(submission: DispatcherSubmission) {
  if (submission.formId === "incident") {
    return 0;
  }

  if (submission.formId === "incident_close") {
    return 1;
  }

  if (submission.formId === "visitor") {
    return 0;
  }

  if (submission.formId === "visitor_exit") {
    return 1;
  }

  return 0;
}

function readTimestamp(value: string) {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function readOptionalTimestamp(value: string | undefined) {
  return value === undefined ? undefined : readTimestamp(value);
}

function readNumber(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function sumPayloadNumbers(
  payload: DispatcherSubmissionPayload,
  fieldNames: readonly string[],
) {
  let hasValue = false;
  let total = 0;

  for (const fieldName of fieldNames) {
    const value = readNumber(payload[fieldName]);

    if (value === undefined) {
      continue;
    }

    hasValue = true;
    total += value;
  }

  return hasValue ? total : undefined;
}
