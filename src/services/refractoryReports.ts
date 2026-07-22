import {
  refractoryReportLabels,
  refractoryReportTypes,
  type RefractoryReportDecision,
  type RefractoryReportRevision,
  type RefractoryReportSubmission,
  type RefractoryReportType,
  type RefractoryShiftNumber,
} from "../contracts/refractoryReports.js";
import type { RefractoryBanksResponse } from "../contracts/laboratoryBanks.js";
import { isLaboratoryBankAssignment } from "./laboratoryBanks.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const REPORTS_PATH = "/api/refractory-reports";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
export type ReturnedRefractoryReportCounts = Readonly<
  Record<RefractoryReportType, number>
>;
export type ReturnedRefractoryShift = {
  reportDate: string;
  shiftNumber: RefractoryShiftNumber;
};
type RefractoryReportShiftFilter = {
  reportDate: string;
  shiftNumber: RefractoryShiftNumber;
};
export const emptyReturnedRefractoryReportCounts:
  ReturnedRefractoryReportCounts = {
    cosh: 0,
    equipment: 0,
    firing: 0,
  };
export type RefractoryFieldErrorDetail = {
  fieldPath: string;
  message: string;
};
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
  details?: RefractoryFieldErrorDetail[];
};
export type RefractoryReportsResult =
  | { status: "ready"; reports: RefractoryReportRevision[] }
  | ErrorResult;
export type RefractoryReportResult =
  | { status: "ready"; report: RefractoryReportRevision }
  | ErrorResult;
export type RefractoryBanksResult =
  | ({ status: "ready" } & RefractoryBanksResponse)
  | ErrorResult;

export async function requestRefractoryBanks(
  options: RequestOptions = {},
): Promise<RefractoryBanksResult> {
  const result = await requestJson(`${REPORTS_PATH}/banks`, "GET", undefined, options);
  if (result.status === "error") return result;
  if (!isRefractoryBanksResponse(result.payload)) return invalidResponse();
  return { status: "ready", ...result.payload };
}

export async function requestRefractoryReports(
  reportDate: string,
  shiftNumber: RefractoryShiftNumber,
  options: RequestOptions = {},
): Promise<RefractoryReportsResult> {
  const result = await requestJson(
    `${REPORTS_PATH}?date=${encodeURIComponent(reportDate)}&shift=${shiftNumber}`,
    "GET",
    undefined,
    options,
  );
  if (result.status === "error") return result;
  if (!isReportsResponse(result.payload)) return invalidResponse();
  return { status: "ready", reports: result.payload.reports };
}


export async function submitRefractoryReport(
  submission: RefractoryReportSubmission,
  options: RequestOptions = {},
): Promise<RefractoryReportResult> {
  return requestOne(REPORTS_PATH, submission, options);
}

export async function requestPendingRefractoryReports(
  options: RequestOptions = {},
): Promise<RefractoryReportsResult> {
  const result = await requestJson(
    `${REPORTS_PATH}/pending`,
    "GET",
    undefined,
    options,
  );
  if (result.status === "error") return result;
  if (!isReportsResponse(result.payload)) return invalidResponse();
  return { status: "ready", reports: result.payload.reports };
}

export async function requestOwnRefractoryReports(
  options: RequestOptions = {},
): Promise<RefractoryReportsResult> {
  const result = await requestJson(
    `${REPORTS_PATH}/own`,
    "GET",
    undefined,
    options,
  );
  if (result.status === "error") return result;
  if (!isReportsResponse(result.payload)) return invalidResponse();
  return { status: "ready", reports: result.payload.reports };
}

export function buildRefractoryDecisionNotifications(
  previousStatuses: ReadonlyMap<string, RefractoryReportRevision["status"]>,
  reports: readonly RefractoryReportRevision[],
) {
  return reports.flatMap((report) => {
    if (
      report.status === "pending" ||
      previousStatuses.get(report.id) === report.status
    ) {
      return [];
    }

    const context = `${refractoryReportLabels[report.reportType]} · ${formatReportDate(
      report.reportDate,
    )} · смена ${report.shiftNumber}.`;

    if (report.status === "approved") {
      return [
        { reportId: report.id, title: "Таблица принята", message: context },
      ];
    }

    const comment = truncateNotificationText(
      report.rejectionComment?.trim() ?? "Требуется доработка.",
    );
    return [
      {
        reportId: report.id,
        title: "Возвращено на доработку",
        message: `${context} Причина: ${comment}`,
      },
    ];
  });
}

export function buildRefractoryStatusMap(
  reports: readonly RefractoryReportRevision[],
) {
  return new Map(reports.map((report) => [report.id, report.status] as const));
}

export function countReturnedRefractoryReports(
  reports: readonly RefractoryReportRevision[],
) {
  return Object.values(countReturnedRefractoryReportsByType(reports)).reduce(
    (total, count) => total + count,
    0,
  );
}

export function countReturnedRefractoryReportsByType(
  reports: readonly RefractoryReportRevision[],
  shiftFilter?: RefractoryReportShiftFilter,
): ReturnedRefractoryReportCounts {
  const latestReports = selectLatestRefractoryReports(reports);
  const counts: Record<RefractoryReportType, number> = {
    cosh: 0,
    equipment: 0,
    firing: 0,
  };

  for (const report of latestReports) {
    if (
      report.status === "rejected" &&
      (shiftFilter === undefined ||
        (report.reportDate === shiftFilter.reportDate &&
          report.shiftNumber === shiftFilter.shiftNumber))
    ) {
      counts[report.reportType] += 1;
    }
  }

  return counts;
}

export function listReturnedRefractoryShifts(
  reports: readonly RefractoryReportRevision[],
): ReturnedRefractoryShift[] {
  const shifts = new Map<string, ReturnedRefractoryShift>();

  for (const report of selectLatestRefractoryReports(reports)) {
    if (report.status !== "rejected") continue;

    const shift = {
      reportDate: report.reportDate,
      shiftNumber: report.shiftNumber,
    };
    shifts.set(`${shift.reportDate}:${shift.shiftNumber}`, shift);
  }

  return Array.from(shifts.values()).sort(
    (left, right) =>
      right.reportDate.localeCompare(left.reportDate) ||
      right.shiftNumber - left.shiftNumber,
  );
}

function selectLatestRefractoryReports(
  reports: readonly RefractoryReportRevision[],
) {
  const latestReports = new Map<string, RefractoryReportRevision>();

  for (const report of reports) {
    const reportKey = [
      report.reportType,
      report.reportDate,
      report.shiftNumber,
    ].join(":");
    const latestReport = latestReports.get(reportKey);

    if (
      latestReport === undefined ||
      report.revisionNumber > latestReport.revisionNumber
    ) {
      latestReports.set(reportKey, report);
    }
  }

  return latestReports.values();
}

export async function decideRefractoryReport(
  reportId: string,
  decision: RefractoryReportDecision,
  options: RequestOptions = {},
): Promise<RefractoryReportResult> {
  return requestOne(
    `${REPORTS_PATH}/${encodeURIComponent(reportId)}/decision`,
    decision,
    options,
  );
}

async function requestOne(
  path: string,
  body: RefractoryReportSubmission | RefractoryReportDecision,
  options: RequestOptions,
): Promise<RefractoryReportResult> {
  const result = await requestJson(path, "POST", body, options);
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isReport(result.payload.report)) {
    return invalidResponse();
  }
  return { status: "ready", report: result.payload.report };
}

async function requestJson(
  path: string,
  method: "GET" | "POST",
  body: RefractoryReportSubmission | RefractoryReportDecision | undefined,
  { baseUrl, signal }: RequestOptions,
): Promise<{ status: "ready"; payload: unknown } | ErrorResult> {
  const endpoint = resolveApiEndpoint(path, path, { baseUrl });
  try {
    const response = await fetch(endpoint, {
      method,
      credentials: "include",
      signal,
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await readJson(response);
    if (!response.ok) return readRemoteError(payload);
    return { status: "ready", payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос таблиц ОЦ отменён." };
    }
    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить таблицы ОЦ.",
        {
          baseUrl,
        },
      ),
      code: "network_error",
    };
  }
}

function isReportsResponse(
  value: unknown,
): value is { reports: RefractoryReportRevision[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.reports) &&
    value.reports.every(isReport)
  );
}

function isRefractoryBanksResponse(value: unknown): value is RefractoryBanksResponse {
  return isRecord(value) &&
    Array.isArray(value.currentAssignments) &&
    value.currentAssignments.every(isLaboratoryBankAssignment) &&
    isRecord(value.volumeReference) &&
    Array.isArray(value.volumeReference.points) &&
    value.volumeReference.points.length >= 2 &&
    value.volumeReference.points.every((point) =>
      isRecord(point) &&
      typeof point.heightMeters === "number" &&
      Number.isFinite(point.heightMeters) &&
      typeof point.volumeCubicMeters === "number" &&
      Number.isFinite(point.volumeCubicMeters)
    );
}

function isReport(value: unknown): value is RefractoryReportRevision {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !refractoryReportTypes.includes(
      value.reportType as (typeof refractoryReportTypes)[number],
    ) ||
    typeof value.reportDate !== "string" ||
    (value.shiftNumber !== 1 && value.shiftNumber !== 2) ||
    !Number.isSafeInteger(value.revisionNumber) ||
    Number(value.revisionNumber) < 1 ||
    (value.status !== "pending" &&
      value.status !== "rejected" &&
      value.status !== "approved") ||
    !isRecord(value.payload) ||
    !isNumberRecord(value.totals) ||
    typeof value.masterDisplayName !== "string" ||
    typeof value.submittedAt !== "string"
  ) {
    return false;
  }
  if (
    (value.reviewerDisplayName !== undefined &&
      typeof value.reviewerDisplayName !== "string") ||
    (value.reviewedAt !== undefined && typeof value.reviewedAt !== "string") ||
    (value.rejectionComment !== undefined &&
      typeof value.rejectionComment !== "string")
  ) {
    return false;
  }
  if (value.reportType === "equipment") {
    return (
      Array.isArray(value.payload.formedRows) &&
      Array.isArray(value.payload.unformedRows)
    );
  }
  if (value.reportType === "firing") return Array.isArray(value.payload.rows);
  return true;
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  );
}

function readRemoteError(payload: unknown): ErrorResult {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === "string"
  ) {
    return {
      status: "error",
      message: payload.error.message,
      ...(typeof payload.error.code === "string"
        ? { code: payload.error.code as RemoteServerErrorCode }
        : {}),
      ...(Array.isArray(payload.error.details) &&
          payload.error.details.every(isFieldErrorDetail)
        ? { details: payload.error.details }
        : {}),
    };
  }
  return invalidResponse();
}

function invalidResponse(): ErrorResult {
  return {
    status: "error",
    message: "Сервер вернул таблицы ОЦ в неподдерживаемом формате.",
    code: "invalid_response",
  };
}

function isFieldErrorDetail(
  value: unknown,
): value is RefractoryFieldErrorDetail {
  return isRecord(value) &&
    typeof value.fieldPath === "string" &&
    typeof value.message === "string";
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

function formatReportDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function truncateNotificationText(value: string) {
  const maxLength = 180;
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
