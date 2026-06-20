import type {
  AccountAccessErrorCode,
  DispatcherFeedResponse,
  DispatcherFeedSummary,
  DispatcherFormDefinition,
  DispatcherFormField,
  DispatcherFormFieldType,
  DispatcherFormId,
  DispatcherFormsResponse,
  DispatcherSubmission,
  DispatcherSubmissionDraft,
  DispatcherSubmissionPayload,
  DispatcherSubmissionResponse,
  DispatcherSubmissionStatus,
} from "../contracts";
import {
  buildRemoteEndpoint,
  describeRemoteNetworkFailure,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const DISPATCHER_FORMS_PATH = "/api/dispatcher/forms";
const DISPATCHER_SUBMISSIONS_PATH = "/api/dispatcher/submissions";

const dispatcherFormIds: readonly DispatcherFormId[] = [
  "equipment",
  "incident",
  "incident_close",
  "visitor",
  "gas_oc",
  "gas_cosh",
];

const dispatcherFieldTypes: readonly DispatcherFormFieldType[] = [
  "text",
  "number",
  "date",
  "month",
  "datetime-local",
  "select",
  "textarea",
];

export type DispatcherFormsReadyState = {
  status: "ready";
  forms: DispatcherFormDefinition[];
  source?: "remote" | "local_test";
};

export type DispatcherSubmissionReadyState = {
  status: "ready";
  submission: DispatcherSubmission;
  source?: "remote" | "local_test";
};

export type DispatcherFeedReadyState = {
  status: "ready";
  submissions: DispatcherSubmission[];
  receivedAt: string;
  summary: DispatcherFeedSummary;
  source?: "remote" | "local_test";
};

export type DispatcherRemoteErrorState = {
  status: "error";
  message: string;
  code?: AccountAccessErrorCode | RemoteServerErrorCode;
  statusCode?: number;
};

export type DispatcherFormsResult =
  | DispatcherFormsReadyState
  | DispatcherRemoteErrorState;

export type DispatcherSubmissionResult =
  | DispatcherSubmissionReadyState
  | DispatcherRemoteErrorState;

export type DispatcherFeedResult =
  | DispatcherFeedReadyState
  | DispatcherRemoteErrorState;

export type DispatcherFeedFilters = {
  formId?: DispatcherFormId;
  dateFrom?: string;
  dateTo?: string;
};

type DispatcherRemoteOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
  localFallback?: boolean;
  storage?: DispatcherLocalStorage;
};

type DispatcherLocalStorage = Pick<Storage, "getItem" | "setItem">;

type LocalDispatcherFormDefinition = DispatcherFormDefinition & {
  summaryFields: string[];
};

const LOCAL_DISPATCHER_STORAGE_KEY =
  "smb-monitor.local-dispatcher-submissions.v1";
const localSummaryFallback = "Запись без краткого описания";

const localEquipmentOptions = [
  "Пресс №1",
  "Пресс №2",
  "Пресс №3",
  "Пресс №4",
  "Пресс №5",
  "Пресс №6",
  "Бегуны №1",
  "Бегуны №2",
  "Бегуны №3",
  "Бегуны №4",
  "Бегуны №5",
  "Бегуны №6",
  "Дезинтегратор №2",
  "Сушильный №2",
  "Шаровая №1",
  "Шаровая №2",
];

const localDowntimeReasonOptions = [
  "Резерв",
  "Замена марки/формы",
  "Простой по мех. эл. части",
];

const localSeverityOptions = ["Низкий", "Средний", "Высокий"];

function buildLocalGasForm(
  id: "gas_oc" | "gas_cosh",
  title: "Газ ОЦ" | "Газ ЦОШ",
): LocalDispatcherFormDefinition {
  return {
    id,
    title,
    sheetName: title,
    summaryFields: ["date", "meterReading", "dailyConsumption"],
    fields: [
      {
        name: "date",
        label: "Дата",
        type: "date",
        required: true,
      },
      {
        name: "meterReading",
        label: "Показание счетчика ГРП 1 (ОЦ+Котельная)",
        type: "number",
        required: false,
      },
      {
        name: "dailyConsumption",
        label: "Расход за сутки, м3",
        type: "number",
        required: false,
      },
      {
        name: "monthlyConsumption",
        label: "Расход с начала месяца, м3",
        type: "number",
        required: false,
      },
      {
        name: "dailyLimit",
        label: "Лимит суточный, м3",
        type: "number",
        required: false,
      },
      {
        name: "dailyUnderuse",
        label: "Недобор газа суточный, м3",
        type: "number",
        required: false,
      },
      {
        name: "monthlyUnderuse",
        label: "Недобор газа месячный, м3",
        type: "number",
        required: false,
      },
      {
        name: "dailyOveruse",
        label: "Перебор газа суточный, м3",
        type: "number",
        required: false,
      },
      {
        name: "monthlyOveruse",
        label: "Перебор газа месячный, м3",
        type: "number",
        required: false,
      },
      {
        name: "monthYear",
        label: "Месяц год",
        type: "month",
        required: true,
      },
    ],
  };
}

const localDispatcherForms: LocalDispatcherFormDefinition[] = [
  {
    id: "equipment",
    title: "Оборудование",
    sheetName: "Оборудование",
    summaryFields: ["equipment", "reportDate", "productionTons"],
    fields: [
      {
        name: "reportDate",
        label: "Дата отчета",
        type: "date",
        required: true,
      },
      {
        name: "reportMonth",
        label: "Месяц отчета",
        type: "month",
        required: true,
      },
      {
        name: "equipment",
        label: "Оборудование",
        type: "select",
        required: true,
        options: localEquipmentOptions,
      },
      {
        name: "productionTons",
        label: "Выработка, тонн",
        type: "number",
        required: false,
      },
      {
        name: "downtimeReason",
        label: "Причина простоя",
        type: "select",
        required: false,
        options: localDowntimeReasonOptions,
      },
      {
        name: "downtimeHours",
        label: "Время простоя, часов",
        type: "number",
        required: false,
      },
      {
        name: "note",
        label: "Примечание",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
    ],
  },
  {
    id: "incident",
    title: "Инцидент",
    sheetName: "Инциденты",
    summaryFields: ["place", "incidentType", "severity"],
    fields: [
      {
        name: "happenedAt",
        label: "Дата и время",
        type: "datetime-local",
        required: true,
      },
      {
        name: "place",
        label: "Место",
        type: "text",
        required: true,
      },
      {
        name: "incidentType",
        label: "Тип",
        type: "text",
        required: true,
      },
      {
        name: "description",
        label: "Описание",
        type: "textarea",
        required: true,
        maxLength: 2_000,
      },
      {
        name: "severity",
        label: "Крит.",
        type: "select",
        required: true,
        options: localSeverityOptions,
      },
      {
        name: "registrar",
        label: "Ответственный за регистрацию",
        type: "text",
        required: true,
      },
      {
        name: "operationalMeasures",
        label: "Меры оперативные",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
      {
        name: "note",
        label: "Примечание",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
    ],
  },
  {
    id: "incident_close",
    title: "Закрытие инцидента",
    sheetName: "Инциденты",
    summaryFields: ["incidentNumber", "closedAt", "closingResponsible"],
    fields: [
      {
        name: "incidentNumber",
        label: "№",
        type: "text",
        required: true,
      },
      {
        name: "closedAt",
        label: "Дата и время закрытия",
        type: "datetime-local",
        required: true,
      },
      {
        name: "cause",
        label: "Причины",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
      {
        name: "closeMeasures",
        label: "Меры после закрытия",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
      {
        name: "expenses",
        label: "Расходы на инцидент",
        type: "number",
        required: false,
      },
      {
        name: "closingResponsible",
        label: "Ответственный о внесении записи о закрытии",
        type: "text",
        required: true,
      },
      {
        name: "closeRecord",
        label: "Запись о закрытии",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
      {
        name: "note",
        label: "Примечание",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
    ],
  },
  {
    id: "visitor",
    title: "Посетитель",
    sheetName: "Посетители",
    summaryFields: ["visitorName", "organization", "host"],
    fields: [
      {
        name: "entryAt",
        label: "Дата время",
        type: "datetime-local",
        required: true,
      },
      {
        name: "visitorName",
        label: "ФИО посетителя",
        type: "text",
        required: true,
      },
      {
        name: "position",
        label: "Должность",
        type: "text",
        required: false,
      },
      {
        name: "organization",
        label: "Организация",
        type: "text",
        required: false,
      },
      {
        name: "visitPurpose",
        label: "Цель визита",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
      {
        name: "host",
        label: "Кого посещает",
        type: "text",
        required: false,
      },
      {
        name: "exitAt",
        label: "Дата время выхода",
        type: "datetime-local",
        required: false,
      },
      {
        name: "note",
        label: "Примечание",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
    ],
  },
  buildLocalGasForm("gas_oc", "Газ ОЦ"),
  buildLocalGasForm("gas_cosh", "Газ ЦОШ"),
];

export async function requestDispatcherForms({
  baseUrl,
  signal,
  localFallback,
  storage,
}: DispatcherRemoteOptions = {}): Promise<DispatcherFormsResult> {
  const endpoint = buildRemoteEndpoint(DISPATCHER_FORMS_PATH, { baseUrl });

  if (endpoint.status === "missing") {
    if (shouldUseLocalDispatcherFallback({ localFallback, storage })) {
      return requestLocalDispatcherForms();
    }

    return {
      status: "error",
      message: endpoint.message,
      code: "server_not_configured",
    };
  }

  try {
    const response = await fetch(endpoint.endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "include",
      signal,
    });

    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(payload, response.status, "Сервер отклонил запрос форм.");
    }

    if (isDispatcherFormsResponse(payload)) {
      return {
        status: "ready",
        forms: payload.forms,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул формы в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос форм отменён.",
      };
    }

    if (shouldUseLocalDispatcherFallback({ localFallback, storage })) {
      return requestLocalDispatcherForms();
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось запросить диспетчерские формы.",
        { baseUrl },
      ),
      code: "network_error",
    };
  }
}

export async function submitDispatcherSubmission(
  draft: DispatcherSubmissionDraft,
  options: DispatcherRemoteOptions = {},
): Promise<DispatcherSubmissionResult> {
  const endpoint = buildRemoteEndpoint(DISPATCHER_SUBMISSIONS_PATH, options);

  if (endpoint.status === "missing") {
    if (shouldUseLocalDispatcherFallback(options)) {
      return saveLocalDispatcherSubmission(draft, options);
    }

    return {
      status: "error",
      message: endpoint.message,
      code: "server_not_configured",
    };
  }

  try {
    const response = await fetch(endpoint.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "include",
      signal: options.signal,
      body: JSON.stringify(draft),
    });

    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(payload, response.status, "Сервер отклонил отправку.");
    }

    if (isDispatcherSubmissionResponse(payload)) {
      return {
        status: "ready",
        submission: payload.submission,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул отправку в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос отправки отменён.",
      };
    }

    if (shouldUseLocalDispatcherFallback(options)) {
      return saveLocalDispatcherSubmission(draft, options);
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось отправить данные на удалённый сервер.",
        options,
      ),
      code: "network_error",
    };
  }
}

export async function requestDispatcherFeed({
  baseUrl,
  signal,
  localFallback,
  storage,
  formId,
  dateFrom,
  dateTo,
}: DispatcherRemoteOptions & DispatcherFeedFilters = {}): Promise<DispatcherFeedResult> {
  const endpoint = buildRemoteEndpoint(DISPATCHER_SUBMISSIONS_PATH, { baseUrl });

  if (endpoint.status === "missing") {
    if (shouldUseLocalDispatcherFallback({ localFallback, storage })) {
      return requestLocalDispatcherFeed({ formId, dateFrom, dateTo, storage });
    }

    return {
      status: "error",
      message: endpoint.message,
      code: "server_not_configured",
    };
  }

  const feedEndpoint = buildFeedEndpoint(endpoint.endpoint, {
    formId,
    dateFrom,
    dateTo,
  });

  try {
    const response = await fetch(feedEndpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "include",
      signal,
    });

    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(
        payload,
        response.status,
        "Сервер отклонил запрос диспетчерской истории.",
      );
    }

    if (isDispatcherFeedResponse(payload)) {
      return {
        status: "ready",
        submissions: payload.submissions,
        receivedAt: payload.receivedAt,
        summary: payload.summary,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул диспетчерскую историю в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос диспетчерской истории отменён.",
      };
    }

    if (shouldUseLocalDispatcherFallback({ localFallback, storage })) {
      return requestLocalDispatcherFeed({ formId, dateFrom, dateTo, storage });
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось запросить диспетчерскую историю.",
        { baseUrl },
      ),
      code: "network_error",
    };
  }
}

function requestLocalDispatcherForms(): DispatcherFormsReadyState {
  return {
    status: "ready",
    forms: readPublicLocalDispatcherForms(),
    source: "local_test",
  };
}

function saveLocalDispatcherSubmission(
  draft: DispatcherSubmissionDraft,
  options: Pick<DispatcherRemoteOptions, "storage">,
): DispatcherSubmissionResult {
  const storage = readLocalDispatcherStorage(options);
  const form = localDispatcherForms.find((item) => item.id === draft.formId);

  if (storage === undefined) {
    return {
      status: "error",
      message:
        "Локальное тестовое хранилище недоступно в этом окружении. Запустите браузерный dev-режим или подключите backend.",
      code: "server_not_configured",
    };
  }

  if (form === undefined) {
    return {
      status: "error",
      message: "Локальный тестовый режим не знает выбранную форму.",
      code: "invalid_response",
    };
  }

  const receivedAt = new Date().toISOString();
  const submission: DispatcherSubmission = {
    id: buildLocalSubmissionId(receivedAt),
    businessAccountId: draft.businessAccountId,
    formId: draft.formId,
    formTitle: form.title,
    payload: draft.payload,
    summary: buildLocalSubmissionSummary(form, draft.payload),
    status: "received",
    submittedByAccountId: "local-test-dispatcher",
    submittedAt: receivedAt,
    receivedAt,
  };
  const submissions = [submission, ...readLocalDispatcherSubmissions(storage)];

  try {
    storage.setItem(
      LOCAL_DISPATCHER_STORAGE_KEY,
      JSON.stringify(submissions.slice(0, 500)),
    );
  } catch {
    return {
      status: "error",
      message:
        "Не удалось записать тестовую отправку в localStorage. Проверьте настройки браузера или очистите локальные данные сайта.",
      code: "server_error",
    };
  }

  return {
    status: "ready",
    submission,
    source: "local_test",
  };
}

function requestLocalDispatcherFeed({
  formId,
  dateFrom,
  dateTo,
  storage,
}: DispatcherFeedFilters & Pick<DispatcherRemoteOptions, "storage">): DispatcherFeedResult {
  const localStorage = readLocalDispatcherStorage({ storage });

  if (localStorage === undefined) {
    return {
      status: "error",
      message:
        "Локальное тестовое хранилище недоступно в этом окружении. Запустите браузерный dev-режим или подключите backend.",
      code: "server_not_configured",
    };
  }

  const submissions = readLocalDispatcherSubmissions(localStorage)
    .filter((submission) =>
      matchesLocalDispatcherFilters(submission, { formId, dateFrom, dateTo }),
    )
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));

  return {
    status: "ready",
    submissions,
    receivedAt: new Date().toISOString(),
    summary: buildLocalDispatcherSummary(submissions),
    source: "local_test",
  };
}

function shouldUseLocalDispatcherFallback({
  localFallback,
}: Pick<DispatcherRemoteOptions, "localFallback" | "storage">) {
  if (localFallback !== undefined) {
    return localFallback;
  }

  const viteEnv = import.meta.env as ImportMetaEnv | undefined;

  return viteEnv?.DEV === true;
}

function readPublicLocalDispatcherForms(): DispatcherFormDefinition[] {
  return localDispatcherForms.map(({ summaryFields: _summaryFields, ...form }) => ({
    ...form,
    fields: form.fields.map((field) => ({
      ...field,
      options: field.options === undefined ? undefined : [...field.options],
    })),
  }));
}

function readLocalDispatcherStorage({
  storage,
}: Pick<DispatcherRemoteOptions, "storage">) {
  if (storage !== undefined) {
    return storage;
  }

  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function readLocalDispatcherSubmissions(storage: DispatcherLocalStorage) {
  let rawValue: string | null;

  try {
    rawValue = storage.getItem(LOCAL_DISPATCHER_STORAGE_KEY);
  } catch {
    return [];
  }

  if (rawValue === null) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);

    return Array.isArray(parsedValue)
      ? parsedValue.filter(isDispatcherSubmission)
      : [];
  } catch {
    return [];
  }
}

function buildLocalSubmissionId(receivedAt: string) {
  const entropy = Math.random().toString(36).slice(2, 8);

  return `local-${receivedAt.replace(/\D/g, "").slice(0, 14)}-${entropy}`;
}

function buildLocalSubmissionSummary(
  form: LocalDispatcherFormDefinition,
  payload: DispatcherSubmissionPayload,
) {
  const values = form.summaryFields
    .map((fieldName) => {
      const value = payload[fieldName];
      const field = form.fields.find((item) => item.name === fieldName);

      if (value === undefined) {
        return undefined;
      }

      return field === undefined ? value : `${field.label}: ${value}`;
    })
    .filter((value): value is string => value !== undefined);

  return values.length === 0 ? localSummaryFallback : values.join(" · ");
}

function matchesLocalDispatcherFilters(
  submission: DispatcherSubmission,
  filters: DispatcherFeedFilters,
) {
  const receivedDate = submission.receivedAt.slice(0, 10);

  if (filters.formId !== undefined && submission.formId !== filters.formId) {
    return false;
  }

  if (filters.dateFrom !== undefined && receivedDate < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo !== undefined && receivedDate > filters.dateTo) {
    return false;
  }

  return true;
}

function buildLocalDispatcherSummary(
  submissions: DispatcherSubmission[],
): DispatcherFeedSummary {
  const countByForm = new Map<DispatcherFormId, number>();

  for (const submission of submissions) {
    countByForm.set(
      submission.formId,
      (countByForm.get(submission.formId) ?? 0) + 1,
    );
  }

  const byForm = localDispatcherForms.map((form) => ({
    formId: form.id,
    formTitle: form.title,
    count: countByForm.get(form.id) ?? 0,
  }));

  return {
    total: byForm.reduce((sum, item) => sum + item.count, 0),
    byForm,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildFeedEndpoint(endpoint: string, filters: DispatcherFeedFilters) {
  const url = new URL(endpoint);

  if (filters.formId !== undefined) {
    url.searchParams.set("formId", filters.formId);
  }

  if (filters.dateFrom !== undefined) {
    url.searchParams.set("dateFrom", filters.dateFrom);
  }

  if (filters.dateTo !== undefined) {
    url.searchParams.set("dateTo", filters.dateTo);
  }

  return url.toString();
}

function readRemoteError(
  payload: unknown,
  statusCode: number,
  fallback: string,
): DispatcherRemoteErrorState {
  return {
    status: "error",
    message: readErrorMessage(payload, fallback),
    code: readErrorCode(payload),
    statusCode,
  };
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }

  return fallback;
}

function readErrorCode(payload: unknown) {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    isKnownErrorCode(payload.error.code)
  ) {
    return payload.error.code;
  }

  return undefined;
}

function isDispatcherFormsResponse(value: unknown): value is DispatcherFormsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.forms) &&
    value.forms.every(isDispatcherFormDefinition)
  );
}

function isDispatcherSubmissionResponse(
  value: unknown,
): value is DispatcherSubmissionResponse {
  return isRecord(value) && isDispatcherSubmission(value.submission);
}

function isDispatcherFeedResponse(value: unknown): value is DispatcherFeedResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.submissions) &&
    value.submissions.every(isDispatcherSubmission) &&
    typeof value.receivedAt === "string" &&
    isDispatcherFeedSummary(value.summary)
  );
}

function isDispatcherFormDefinition(
  value: unknown,
): value is DispatcherFormDefinition {
  return (
    isRecord(value) &&
    isDispatcherFormId(value.id) &&
    typeof value.title === "string" &&
    typeof value.sheetName === "string" &&
    Array.isArray(value.fields) &&
    value.fields.every(isDispatcherFormField)
  );
}

function isDispatcherFormField(value: unknown): value is DispatcherFormField {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.label === "string" &&
    isDispatcherFormFieldType(value.type) &&
    typeof value.required === "boolean" &&
    (value.options === undefined ||
      (Array.isArray(value.options) &&
        value.options.every((option) => typeof option === "string")))
  );
}

function isDispatcherSubmission(value: unknown): value is DispatcherSubmission {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.businessAccountId === "string" &&
    isDispatcherFormId(value.formId) &&
    typeof value.formTitle === "string" &&
    isDispatcherSubmissionPayload(value.payload) &&
    typeof value.summary === "string" &&
    isDispatcherSubmissionStatus(value.status) &&
    typeof value.submittedByAccountId === "string" &&
    typeof value.submittedAt === "string" &&
    typeof value.receivedAt === "string"
  );
}

function isDispatcherFeedSummary(
  value: unknown,
): value is DispatcherFeedSummary {
  return (
    isRecord(value) &&
    typeof value.total === "number" &&
    Array.isArray(value.byForm) &&
    value.byForm.every(
      (item) =>
        isRecord(item) &&
        isDispatcherFormId(item.formId) &&
        typeof item.formTitle === "string" &&
        typeof item.count === "number",
    )
  );
}

function isDispatcherSubmissionPayload(
  value: unknown,
): value is DispatcherSubmissionPayload {
  return (
    isRecord(value) &&
    Object.values(value).every((payloadValue) => typeof payloadValue === "string")
  );
}

function isDispatcherFormId(value: unknown): value is DispatcherFormId {
  return (
    typeof value === "string" &&
    dispatcherFormIds.includes(value as DispatcherFormId)
  );
}

function isDispatcherFormFieldType(
  value: unknown,
): value is DispatcherFormFieldType {
  return (
    typeof value === "string" &&
    dispatcherFieldTypes.includes(value as DispatcherFormFieldType)
  );
}

function isDispatcherSubmissionStatus(
  value: unknown,
): value is DispatcherSubmissionStatus {
  return (
    value === "received" ||
    value === "queued" ||
    value === "accepted" ||
    value === "rejected"
  );
}

function isKnownErrorCode(
  value: unknown,
): value is AccountAccessErrorCode | RemoteServerErrorCode {
  return (
    value === "server_not_configured" ||
    value === "network_error" ||
    value === "invalid_response" ||
    value === "access_denied" ||
    value === "not_found" ||
    value === "server_error"
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
