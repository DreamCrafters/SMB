import type {
  AccountAccessErrorCode,
  DispatcherFeedResponse,
  DispatcherFeedSummary,
  DispatcherFormDefinition,
  DispatcherFormField,
  DispatcherFormFieldType,
  DispatcherFormId,
  DispatcherFormsResponse,
  DispatcherEquipmentReportResponse,
  DispatcherSubmission,
  DispatcherSubmissionDraft,
  DispatcherSubmissionPayload,
  DispatcherSubmissionResponse,
  DispatcherSubmissionStatus,
  DispatcherProductionBankContent,
  OpenIncidentSummary,
  ProductionMonthOverview,
  ProductionMetricRow,
  ProductionReportTableTotals,
  ProductionReportTables,
} from "../contracts";
import {
  buildRemoteEndpoint,
  describeRemoteNetworkFailure,
  type RemoteServerErrorCode,
} from "./remoteServer.js";
import {
  normalizeProductionPayloadForSubmit,
  validateDispatcherPayloadForSubmit,
} from "./dispatcherPayloadValidation.js";
import {
  buildOpenIncidentSummaries,
  buildLocalProductionReportTableTotals,
  buildProductionMonthOverview,
  buildProductionReportTables,
  findOpenIncidentByNumber,
  findOpenVisitorByEntryId,
  findOpenVisitorByEntryPayload,
} from "./dispatcherFeedViews.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";

const DISPATCHER_FORMS_PATH = "/api/dispatcher/forms";
const DISPATCHER_SUBMISSIONS_PATH = "/api/dispatcher/submissions";
const DISPATCHER_EQUIPMENT_REPORT_PATH = "/api/dispatcher/equipment-report";

const incidentOpeningContextFieldNames = [
  "datetime",
  "location",
  "incidentType",
  "criticality",
  "description",
] as const;

const dispatcherFormIds: readonly DispatcherFormId[] = [
  "equipment",
  "production",
  "incident",
  "incident_close",
  "visitor",
  "visitor_exit",
  "gas_oc",
  "gas_cosh",
];

const dispatcherFieldTypes: readonly DispatcherFormFieldType[] = [
  "text",
  "number",
  "signed-number",
  "integer",
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

export type DispatcherEquipmentReportReadyState = {
  status: "ready";
  submissions: DispatcherSubmission[];
  reportStatus: "created" | "updated";
  source?: "remote" | "local_test";
};

export type DispatcherFeedReadyState = {
  status: "ready";
  submissions: DispatcherSubmission[];
  productionReportTables: ProductionReportTables;
  productionReportTableTotals: ProductionReportTableTotals;
  productionMonthOverview: ProductionMonthOverview | null;
  openIncidents: OpenIncidentSummary[];
  bankContents: DispatcherProductionBankContent[];
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

export type DispatcherEquipmentReportResult =
  | DispatcherEquipmentReportReadyState
  | DispatcherRemoteErrorState;

export type DispatcherFeedResult =
  | DispatcherFeedReadyState
  | DispatcherRemoteErrorState;

export type DispatcherFeedFilters = {
  formId?: DispatcherFormId;
  dateFrom?: string;
  dateTo?: string;
  productionDateFrom?: string;
  productionDateTo?: string;
  reportDate?: string;
  limit?: number;
  offset?: number;
};

export const dispatcherFeedPageLimit = 2_000;

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
  "Замена марки/формы",
  "Простой по мех, эл. части",
  "Резерв",
];

const localIncidentTypeOptions = [
  "Травма",
  "Поломка оборудования по эл. части",
  "Поломка оборудования по мех. части",
  "Утечка данных",
  "Пожар",
  "Разлив химикатов",
  "Нарушение безопасности",
  "Микротравма",
  "Нарушение регламента",
];

const localCriticalityOptions = ["Высокий", "Средний", "Низкий"];

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
        type: "integer",
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
    id: "production",
    title: "Выработка",
    sheetName: "Выработка",
    summaryFields: ["reportDate", "formingDay", "sortingDay"],
    fields: [
      {
        name: "reportDate",
        label: "Дата отчета",
        type: "date",
        required: true,
      },
      ...buildLocalProductionSummaryFields("forming", "Формовка"),
      ...buildLocalProductionSummaryFields("sorting", "Сортировка"),
      ...buildLocalJarMeasurementFields(),
      {
        name: "granulationPlatesInOperation",
        label: "Участок грануляции — Количество тарелок в работе",
        type: "integer",
        required: false,
      },
      {
        name: "granulationMillHours",
        label: "Участок грануляции — Время работы мельницы, часов",
        type: "number",
        required: false,
      },
      {
        name: "granulationFraction1630Day",
        label: "Участок грануляции — Фракция 16/30, сутки",
        type: "number",
        required: false,
      },
      {
        name: "granulationFraction1218Day",
        label: "Участок грануляции — Фракция 12/18, сутки",
        type: "number",
        required: false,
      },
    ],
  },
  {
    id: "incident",
    title: "Открытие инцидента",
    sheetName: "Инциденты",
    summaryFields: ["incidentNumber", "location", "incidentType", "criticality"],
    fields: [
      {
        name: "datetime",
        label: "Дата и время инцидента",
        type: "datetime-local",
        required: true,
      },
      {
        name: "location",
        label: "Место (цех/участок)",
        type: "text",
        required: true,
      },
      {
        name: "incidentType",
        label: "Тип инцидента",
        type: "select",
        required: true,
        options: localIncidentTypeOptions,
      },
      {
        name: "description",
        label: "Описание",
        type: "textarea",
        required: true,
        maxLength: 2_000,
      },
      {
        name: "criticality",
        label: "Критичность",
        type: "select",
        required: true,
        options: localCriticalityOptions,
      },
      {
        name: "responsible",
        label: "Ответственный за регистрацию",
        type: "text",
        required: true,
      },
      {
        name: "immediateActions",
        label: "Оперативные меры",
        type: "textarea",
        required: true,
        maxLength: 2_000,
      },
    ],
  },
  {
    id: "incident_close",
    title: "Закрытие инцидента",
    sheetName: "Инциденты",
    summaryFields: ["incidentNumber", "closureDateTime", "approvedBy"],
    fields: [
      {
        name: "incidentNumber",
        label: "№",
        type: "text",
        required: true,
      },
      {
        name: "rootCauses",
        label: "Корневые причины",
        type: "textarea",
        required: true,
        maxLength: 2_000,
      },
      {
        name: "preventiveMeasures",
        label: "Предотвращающие меры",
        type: "textarea",
        required: true,
        maxLength: 2_000,
      },
      {
        name: "closureDateTime",
        label: "Дата и время закрытия",
        type: "datetime-local",
        required: true,
      },
      {
        name: "costs",
        label: "Затраты (убытки), руб",
        type: "number",
        required: false,
      },
      {
        name: "approvedBy",
        label: "Кто утвердил закрытие",
        type: "text",
        required: true,
      },
      {
        name: "closureNote",
        label: "Примечание",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
    ],
  },
  {
    id: "visitor",
    title: "Вход посетителя",
    sheetName: "Посетители",
    summaryFields: ["fio", "organization", "whom"],
    fields: [
      {
        name: "fio",
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
        name: "purpose",
        label: "Цель визита",
        type: "text",
        required: false,
      },
      {
        name: "whom",
        label: "Кого посещает",
        type: "text",
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
    id: "visitor_exit",
    title: "Выход посетителя",
    sheetName: "Посетители",
    summaryFields: ["fio", "organization"],
    fields: [
      {
        name: "visitorEntryId",
        label: "Посетитель",
        type: "text",
        required: true,
      },
    ],
  },
];

function buildLocalProductionSummaryFields(
  prefix: "forming" | "sorting",
  sectionLabel: string,
): DispatcherFormField[] {
  return [
    localProductionNumberField(`${prefix}Day`, `${sectionLabel} — Сутки`),
    {
      name: `${prefix}ProductBrand`,
      label: `${sectionLabel} — Марка изделия`,
      type: "text",
      required: false,
      maxLength: 120,
    },
  ];
}

function buildLocalJarMeasurementFields(): DispatcherFormField[] {
  return [
    ...[1, 2, 3].flatMap((jarNumber) => [
      localProductionNumberField(
        `jarStart${jarNumber}`,
        `Замеры банок — Банка ${jarNumber}, начало дня, по замерам`,
      ),
      localProductionNumberField(
        `jarShipmentStart${jarNumber}`,
        `Замеры банок — Банка ${jarNumber}, начало дня, по отгрузкам`,
      ),
      localProductionNumberField(
        `jarEnd${jarNumber}`,
        `Замеры банок — Банка ${jarNumber}, конец дня, по замерам`,
      ),
      localProductionNumberField(
        `jarShipmentEnd${jarNumber}`,
        `Замеры банок — Банка ${jarNumber}, конец дня, по отгрузкам`,
      ),
      ...[1, 2, 3, 4].map((measurementNumber) =>
        localProductionNumberField(
          `jarMeasurement${jarNumber}_${measurementNumber}`,
          `Замеры банок — Банка ${jarNumber}, замер ${measurementNumber}`,
          measurementNumber === 1,
        )
      ),
      localProductionNumberField(
        `jarLoaded${jarNumber}`,
        `Замеры банок — Банка ${jarNumber}, засыпали`,
      ),
      localProductionNumberField(
        `jarShipped${jarNumber}`,
        `Замеры банок — Банка ${jarNumber}, отгрузили`,
      ),
      {
        name: `jarMaterial${jarNumber}`,
        label: `Замеры банок — Банка ${jarNumber}, содержимое`,
        type: "text" as const,
        required: false,
        maxLength: 120,
      },
      localProductionNumberField(
        `jarAverage${jarNumber}`,
        `Замеры банок — Банка ${jarNumber}, среднее значение`,
      ),
      localProductionNumberField(
        `jarBulkDensity${jarNumber}`,
        `Замеры банок — Банка ${jarNumber}, насыпная плотность`,
      ),
      {
        name: `jarBulkDensityDate${jarNumber}`,
        label: `Замеры банок — Банка ${jarNumber}, дата насыпной плотности`,
        type: "date" as const,
        required: false,
      },
      localProductionNumberField(
        `jarVolume${jarNumber}`,
        `Замеры банок — Банка ${jarNumber}, объём по замерам`,
      ),
      localProductionNumberField(
        `jarCalculatedWeight${jarNumber}`,
        `Замеры банок — Банка ${jarNumber}, расчётный вес по замерам`,
      ),
      localProductionNumberField(
        `jarShipmentCalculatedWeight${jarNumber}`,
        `Замеры банок — Банка ${jarNumber}, расчётный вес по отгрузкам`,
      ),
    ]),
    {
      name: "coshMaster",
      label: "Замеры банок — Мастер ЦОШ",
      type: "text",
      required: true,
      maxLength: 120,
    },
  ];
}

function localProductionNumberField(
  name: string,
  label: string,
  required = false,
): DispatcherFormField {
  return {
    name,
    label,
    type: "number",
    required,
  };
}


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
      headers: buildDevAccessHeaders({
        Accept: "application/json",
      }),
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
  const normalizedDraft =
    draft.formId === "production"
      ? {
          ...draft,
          payload: normalizeProductionPayloadForSubmit(draft.payload),
        }
      : draft;
  const endpoint = buildRemoteEndpoint(DISPATCHER_SUBMISSIONS_PATH, options);

  if (endpoint.status === "missing") {
    if (shouldUseLocalDispatcherFallback(options)) {
      return saveLocalDispatcherSubmission(normalizedDraft, options);
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
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        "Content-Type": "application/json",
      }),
      credentials: "include",
      signal: options.signal,
      body: JSON.stringify(normalizedDraft),
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
      return saveLocalDispatcherSubmission(normalizedDraft, options);
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

export async function submitDispatcherEquipmentReport(
  value: {
    items: DispatcherSubmissionPayload[];
  },
  options: DispatcherRemoteOptions = {},
): Promise<DispatcherEquipmentReportResult> {
  const endpoint = buildRemoteEndpoint(DISPATCHER_EQUIPMENT_REPORT_PATH, options);

  if (endpoint.status === "missing") {
    if (shouldUseLocalDispatcherFallback(options)) {
      return saveLocalDispatcherEquipmentReport(value, options);
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
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        "Content-Type": "application/json",
      }),
      credentials: "include",
      signal: options.signal,
      body: JSON.stringify(value),
    });

    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(
        payload,
        response.status,
        "Сервер отклонил отчёт оборудования.",
      );
    }

    if (isDispatcherEquipmentReportResponse(payload)) {
      return {
        status: "ready",
        submissions: payload.submissions,
        reportStatus: payload.reportStatus,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул отчёт оборудования в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос отчёта оборудования отменён.",
      };
    }

    if (shouldUseLocalDispatcherFallback(options)) {
      return saveLocalDispatcherEquipmentReport(value, options);
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось отправить отчёт оборудования на удалённый сервер.",
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
  productionDateFrom,
  productionDateTo,
  reportDate,
  limit,
  offset,
}: DispatcherRemoteOptions & DispatcherFeedFilters = {}): Promise<DispatcherFeedResult> {
  const endpoint = buildRemoteEndpoint(DISPATCHER_SUBMISSIONS_PATH, { baseUrl });

  if (endpoint.status === "missing") {
    if (shouldUseLocalDispatcherFallback({ localFallback, storage })) {
      return requestLocalDispatcherFeed({
        formId,
        dateFrom,
        dateTo,
        productionDateFrom,
        productionDateTo,
        reportDate,
        limit,
        offset,
        storage,
      });
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
    productionDateFrom,
    productionDateTo,
    reportDate,
    limit,
    offset,
  });

  try {
    const response = await fetch(feedEndpoint, {
      method: "GET",
      headers: buildDevAccessHeaders({
        Accept: "application/json",
      }),
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
        productionReportTables: payload.productionReportTables,
        productionReportTableTotals: payload.productionReportTableTotals,
        productionMonthOverview: payload.productionMonthOverview,
        openIncidents: payload.openIncidents,
        bankContents: payload.bankContents,
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
      return requestLocalDispatcherFeed({
        formId,
        dateFrom,
        dateTo,
        productionDateFrom,
        productionDateTo,
        reportDate,
        limit,
        offset,
        storage,
      });
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

export async function requestCompleteDispatcherFeed(
  options: DispatcherRemoteOptions & Omit<DispatcherFeedFilters, "offset"> = {},
): Promise<DispatcherFeedResult> {
  const pageLimit = Math.min(
    Math.max(Math.trunc(options.limit ?? dispatcherFeedPageLimit), 1),
    dispatcherFeedPageLimit,
  );
  const submissions: DispatcherSubmission[] = [];
  let offset = 0;
  let latestPage: DispatcherFeedReadyState | undefined;

  while (true) {
    const page = await requestDispatcherFeed({
      ...options,
      limit: pageLimit,
      offset,
    });

    if (page.status !== "ready") {
      return page;
    }

    latestPage = page;
    submissions.push(...page.submissions);

    if (
      page.submissions.length < pageLimit ||
      submissions.length >= page.summary.total
    ) {
      return {
        ...latestPage,
        submissions,
      };
    }

    offset += page.submissions.length;
  }
}

export function mergeDispatcherFeedSubmissions(
  cachedSubmissions: readonly DispatcherSubmission[],
  latestSubmissions: readonly DispatcherSubmission[],
) {
  const latestIds = new Set(latestSubmissions.map((submission) => submission.id));

  return [
    ...latestSubmissions,
    ...cachedSubmissions.filter((submission) => !latestIds.has(submission.id)),
  ];
}

function saveLocalDispatcherEquipmentReport(
  value: {
    items: DispatcherSubmissionPayload[];
  },
  options: Pick<DispatcherRemoteOptions, "storage">,
): DispatcherEquipmentReportResult {
  if (value.items.length === 0) {
    return {
      status: "error",
      message: "Заполните хотя бы одну позицию оборудования.",
      code: "invalid_response",
    };
  }

  const completenessMessage = validateCompleteLocalEquipmentReport(value.items);

  if (completenessMessage !== undefined) {
    return {
      status: "error",
      message: completenessMessage,
      code: "invalid_response",
    };
  }

  const storage = readLocalDispatcherStorage(options);
  const existingSubmissions =
    storage === undefined ? [] : readLocalDispatcherSubmissions(storage);
  const reportStatus = value.items.some((payload) =>
    existingSubmissions.some(
      (submission) =>
        buildLocalDispatcherSubmissionDedupeKey(
          submission.formId,
          submission.payload,
        ) ===
        buildLocalDispatcherSubmissionDedupeKey(
          "equipment",
          payload,
        ),
    ),
  )
    ? "updated"
    : "created";
  const submissions: DispatcherSubmission[] = [];

  for (const payload of value.items) {
    const result = saveLocalDispatcherSubmission(
      {
        formId: "equipment",
        payload,
      },
      options,
    );

    if (result.status === "error") {
      return result;
    }

    submissions.push(result.submission);
  }

  return {
    status: "ready",
    submissions,
    reportStatus,
    source: "local_test",
  };
}

function validateCompleteLocalEquipmentReport(
  items: readonly DispatcherSubmissionPayload[],
) {
  const submittedEquipment = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of items) {
    const equipment = item.equipment?.trim() ?? "";

    if (submittedEquipment.has(equipment)) {
      duplicates.add(equipment);
    }

    submittedEquipment.add(equipment);
  }

  const missingEquipment = localEquipmentOptions.filter(
    (equipment) => !submittedEquipment.has(equipment),
  );

  if (duplicates.size > 0) {
    return `Отчёт оборудования содержит дубли: ${[...duplicates].join(", ")}.`;
  }

  if (missingEquipment.length > 0) {
    return `Внесите данные по всем позициям оборудования. Не заполнено: ${missingEquipment.join(", ")}.`;
  }

  return undefined;
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
  const existingSubmissions = readLocalDispatcherSubmissions(storage);
  const scriptPayload = applyLocalDispatcherFormScriptRules(
    form,
    draft.payload,
    existingSubmissions,
    new Date(receivedAt),
  );

  if (scriptPayload.status === "error") {
    return scriptPayload;
  }

  const submission: DispatcherSubmission = {
    id:
      readLocalEquipmentSubmissionDuplicate(
        existingSubmissions,
        draft.formId,
        scriptPayload.payload,
      )?.id ?? buildLocalSubmissionId(receivedAt),
    formId: draft.formId,
    formTitle: form.title,
    payload: scriptPayload.payload,
    summary: buildLocalSubmissionSummary(form, scriptPayload.payload),
    status: "received",
    submittedByAccountId: "local-test-dispatcher",
    submittedAt: receivedAt,
    receivedAt,
  };
  const dedupeKey = buildLocalDispatcherSubmissionDedupeKey(
    draft.formId,
    scriptPayload.payload,
  );
  const submissions =
    dedupeKey === null
      ? [submission, ...existingSubmissions]
      : [
          submission,
          ...existingSubmissions.filter(
            (item) =>
              buildLocalDispatcherSubmissionDedupeKey(
                item.formId,
                item.payload,
              ) !== dedupeKey,
          ),
        ];

  try {
    storage.setItem(
      LOCAL_DISPATCHER_STORAGE_KEY,
      JSON.stringify(submissions.slice(0, 2_000)),
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
  productionDateFrom,
  productionDateTo,
  reportDate,
  limit,
  offset,
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

  const allSubmissions = readLocalDispatcherSubmissions(localStorage);
  const matchingSubmissions = allSubmissions
    .filter((submission) =>
      matchesLocalDispatcherFilters(submission, {
        formId,
        dateFrom,
        dateTo,
        reportDate,
      }),
    )
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
  const safeOffset = Math.max(offset ?? 0, 0);
  const submissions = matchingSubmissions.slice(
    safeOffset,
    safeOffset + readSafeLocalFeedLimit(limit),
  );

  const productionReportTables = buildProductionReportTables(allSubmissions, {});
  const productionReportTableTotals = buildLocalProductionReportTableTotals(
    productionReportTables,
    { dateFrom: productionDateFrom, dateTo: productionDateTo },
  );

  return {
    status: "ready",
    submissions,
    productionReportTables,
    productionReportTableTotals,
    productionMonthOverview:
      buildProductionMonthOverview(productionReportTables) ?? null,
    openIncidents: buildOpenIncidentSummaries(allSubmissions),
    bankContents: [],
    receivedAt: new Date().toISOString(),
    summary: buildLocalDispatcherSummary(matchingSubmissions),
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

function readLocalEquipmentSubmissionDuplicate(
  submissions: DispatcherSubmission[],
  formId: DispatcherFormId,
  payload: DispatcherSubmissionPayload,
) {
  const dedupeKey = buildLocalDispatcherSubmissionDedupeKey(
    formId,
    payload,
  );

  if (dedupeKey === null) {
    return undefined;
  }

  return submissions.find(
    (submission) =>
      buildLocalDispatcherSubmissionDedupeKey(
        submission.formId,
        submission.payload,
      ) === dedupeKey,
  );
}

function buildLocalDispatcherSubmissionDedupeKey(
  formId: DispatcherFormId,
  payload: DispatcherSubmissionPayload,
) {
  if (formId !== "equipment") {
    return null;
  }

  const reportDate = payload.reportDate?.trim();
  const equipment = payload.equipment?.trim();
  const normalizedReportDate =
    reportDate === undefined ? undefined : formatLocalScriptDate(reportDate);

  if (
    normalizedReportDate === undefined ||
    normalizedReportDate.length === 0 ||
    equipment === undefined ||
    equipment.length === 0
  ) {
    return null;
  }

  return `equipment:${normalizedReportDate}:${equipment}`;
}

function applyLocalDispatcherFormScriptRules(
  form: LocalDispatcherFormDefinition,
  payload: DispatcherSubmissionPayload,
  existingSubmissions: DispatcherSubmission[],
  receivedAt: Date,
):
  | {
      status: "ready";
      payload: DispatcherSubmissionPayload;
    }
  | DispatcherRemoteErrorState {
  const nextPayload = { ...payload };

  if (form.id === "equipment") {
    const hasReportData = [
      nextPayload.productionTons,
      nextPayload.downtimeReason,
      nextPayload.downtimeHours,
      nextPayload.note,
    ].some((value) => value !== undefined && value.trim().length > 0);

    if (!hasReportData) {
      return {
        status: "error",
        message:
          "Заполните выработку, причину простоя, время простоя или примечание.",
        code: "invalid_response",
      };
    }

    const validationMessage = validateDispatcherPayloadForSubmit(form, nextPayload);

    if (validationMessage !== undefined) {
      return {
        status: "error",
        message: validationMessage,
        code: "invalid_response",
      };
    }

    if (nextPayload.reportDate !== undefined) {
      nextPayload.reportMonth = nextPayload.reportDate.slice(0, 7);
      nextPayload.reportDate = formatLocalScriptDate(nextPayload.reportDate);
    }
  }

  if (form.id === "production") {
    const validationMessage = validateDispatcherPayloadForSubmit(form, nextPayload);

    if (validationMessage !== undefined) {
      return {
        status: "error",
        message: validationMessage,
        code: "invalid_response",
      };
    }

    if (nextPayload.reportDate !== undefined) {
      nextPayload.reportMonth = nextPayload.reportDate.slice(0, 7);
      nextPayload.reportDate = formatLocalScriptDate(nextPayload.reportDate);
    }
  }

  if (form.id === "incident") {
    if (nextPayload.datetime !== undefined) {
      nextPayload.datetime = formatLocalScriptDateTime(nextPayload.datetime);
    }

    nextPayload.incidentNumber = readNextLocalIncidentNumber(
      existingSubmissions,
      receivedAt,
    );
    nextPayload.incidentStatus = "Новый";
  }

  if (form.id === "incident_close") {
    const openIncident = findOpenIncidentByNumber(
      existingSubmissions,
      nextPayload.incidentNumber,
    );

    if (openIncident === undefined) {
      return {
        status: "error",
        message: "Выберите незакрытый инцидент.",
        code: "invalid_response",
      };
    }

    if (nextPayload.closureDateTime !== undefined) {
      nextPayload.closureDateTime = formatLocalScriptDateTime(
        nextPayload.closureDateTime,
      );
    }

    nextPayload.costs = nextPayload.costs ?? "0";
    for (const fieldName of incidentOpeningContextFieldNames) {
      const value = openIncident.submission.payload[fieldName]?.trim();

      if (value !== undefined && value.length > 0) {
        nextPayload[fieldName] = value;
      }
    }
    nextPayload.incidentStatus = "Закрыт";

    if (
      nextPayload.closureDateTime !== undefined &&
      nextPayload.approvedBy !== undefined
    ) {
      const note =
        nextPayload.closureNote === undefined
          ? ""
          : ` (${nextPayload.closureNote})`;
      nextPayload.closeRecord = `Закрыт ${nextPayload.closureDateTime}, утвердил ${nextPayload.approvedBy}${note}`;
    }
  }

  if (form.id === "visitor") {
    const duplicate = findOpenVisitorByEntryPayload(
      existingSubmissions,
      nextPayload,
    );

    if (duplicate !== undefined) {
      return {
        status: "error",
        message:
          "Этот посетитель уже вошёл и пока не имеет отметки выхода.",
        code: "invalid_response",
      };
    }

    nextPayload.entryAt = formatLocalScriptDateTimeFromDate(receivedAt);
  }

  if (form.id === "visitor_exit") {
    const openVisitor = findOpenVisitorByEntryId(
      existingSubmissions,
      nextPayload.visitorEntryId,
    );

    if (openVisitor === undefined) {
      return {
        status: "error",
        message: "Выберите посетителя, который вошёл и ещё не вышел.",
        code: "invalid_response",
      };
    }

    nextPayload.fio = openVisitor.submission.payload.fio ?? "";
    nextPayload.organization = openVisitor.submission.payload.organization ?? "";
    nextPayload.position = openVisitor.submission.payload.position ?? "";
    nextPayload.purpose = openVisitor.submission.payload.purpose ?? "";
    nextPayload.whom = openVisitor.submission.payload.whom ?? "";
    nextPayload.entryAt =
      openVisitor.submission.payload.entryAt ?? openVisitor.submission.receivedAt;
    nextPayload.exitAt = formatLocalScriptDateTimeFromDate(receivedAt);
  }

  return {
    status: "ready",
    payload: nextPayload,
  };
}

function readNextLocalIncidentNumber(
  submissions: DispatcherSubmission[],
  receivedAt: Date,
) {
  const year = String(receivedAt.getFullYear());
  let maxSuffix = 0;

  for (const submission of submissions) {
    const value = submission.payload.incidentNumber;

    if (
      submission.formId !== "incident" ||
      value === undefined ||
      !value.startsWith(`INC-${year}-`)
    ) {
      continue;
    }

    const suffix = Number(value.slice(`INC-${year}-`.length));

    if (Number.isInteger(suffix) && suffix > maxSuffix) {
      maxSuffix = suffix;
    }
  }

  return `INC-${year}-${maxSuffix + 1}`;
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

function formatLocalScriptDate(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (parts === null) {
    return value;
  }

  return `${parts[3]}.${parts[2]}.${parts[1]}`;
}

function formatLocalScriptDateTime(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

  if (parts === null) {
    return value;
  }

  return `${parts[3]}.${parts[2]}.${parts[1]} ${parts[4]}:${parts[5]}`;
}

function formatLocalScriptDateTimeFromDate(value: Date) {
  return `${String(value.getDate()).padStart(2, "0")}.${String(
    value.getMonth() + 1,
  ).padStart(2, "0")}.${value.getFullYear()} ${String(
    value.getHours(),
  ).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
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

  if (
    filters.reportDate !== undefined &&
    !isSameLocalReportDate(submission.payload.reportDate, filters.reportDate)
  ) {
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

function readSafeLocalFeedLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 100, 1), 2_000);
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

  if (filters.productionDateFrom !== undefined) {
    url.searchParams.set("productionDateFrom", filters.productionDateFrom);
  }

  if (filters.productionDateTo !== undefined) {
    url.searchParams.set("productionDateTo", filters.productionDateTo);
  }

  if (filters.reportDate !== undefined) {
    url.searchParams.set("reportDate", filters.reportDate);
  }

  if (filters.limit !== undefined) {
    url.searchParams.set("limit", String(filters.limit));
  }

  if (filters.offset !== undefined) {
    url.searchParams.set("offset", String(filters.offset));
  }

  return url.toString();
}

function isSameLocalReportDate(payloadDate: string | undefined, reportDate: string) {
  if (payloadDate === undefined) {
    return false;
  }

  const trimmedPayloadDate = payloadDate.trim();

  return (
    trimmedPayloadDate === reportDate ||
    trimmedPayloadDate === formatLocalScriptDate(reportDate)
  );
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

function isDispatcherEquipmentReportResponse(
  value: unknown,
): value is DispatcherEquipmentReportResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.submissions) &&
    value.submissions.every(isDispatcherSubmission) &&
    (value.reportStatus === "created" || value.reportStatus === "updated")
  );
}

function isDispatcherFeedResponse(value: unknown): value is DispatcherFeedResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.submissions) &&
    value.submissions.every(isDispatcherSubmission) &&
    isProductionReportTables(value.productionReportTables) &&
    isProductionReportTableTotals(value.productionReportTableTotals) &&
    (value.productionMonthOverview === null ||
      isProductionMonthOverview(value.productionMonthOverview)) &&
    Array.isArray(value.openIncidents) &&
    value.openIncidents.every(isOpenIncidentSummary) &&
    Array.isArray(value.bankContents) &&
    value.bankContents.every(isDispatcherProductionBankContent) &&
    typeof value.receivedAt === "string" &&
    isDispatcherFeedSummary(value.summary)
  );
}

function isDispatcherProductionBankContent(
  value: unknown,
): value is DispatcherProductionBankContent {
  return (
    isRecord(value) &&
    (value.bankNumber === 1 || value.bankNumber === 2 ||
      value.bankNumber === 3) &&
    typeof value.materialLabel === "string" &&
    value.materialLabel.trim().length > 0
  );
}

function isOpenIncidentSummary(value: unknown): value is OpenIncidentSummary {
  return (
    isRecord(value) &&
    typeof value.incidentNumber === "string" &&
    value.incidentNumber.length > 0 &&
    typeof value.openedAt === "string" &&
    isOptionalString(value.location) &&
    isOptionalString(value.incidentType) &&
    isOptionalString(value.criticality) &&
    isOptionalString(value.description)
  );
}

function isProductionMonthOverview(
  value: unknown,
): value is ProductionMonthOverview {
  return (
    isRecord(value) &&
    /^\d{4}-\d{2}$/u.test(String(value.month)) &&
    typeof value.totalFact === "number" &&
    Number.isFinite(value.totalFact) &&
    isProductionOverviewValue(value.forming) &&
    isProductionOverviewValue(value.sorting) &&
    isProductionOverviewValue(value.unformed) &&
    isProductionOverviewValue(value.chamotte) &&
    isProductionOverviewValue(value.granulation)
  );
}

function isProductionOverviewValue(value: unknown) {
  return isRecord(value) &&
    typeof value.monthFact === "number" &&
    Number.isFinite(value.monthFact) &&
    typeof value.todayFact === "number" &&
    Number.isFinite(value.todayFact);
}

function isProductionReportTables(value: unknown): value is ProductionReportTables {
  return (
    isRecord(value) &&
    Array.isArray(value.forming) &&
    value.forming.every(isProductionBrandCategoryRow) &&
    Array.isArray(value.sorting) &&
    value.sorting.every(isProductionBrandCategoryRow) &&
    Array.isArray(value.unformed) &&
    value.unformed.every(isProductionBrandCategoryRow) &&
    Array.isArray(value.chamotte) &&
    value.chamotte.every(isProductionBrandCategoryRow) &&
    Array.isArray(value.jars) &&
    value.jars.every(
      (row) =>
        isProductionBaseRow(row) &&
        typeof row.jarNumber === "number" &&
        isOptionalNumber(row.start) &&
        isOptionalNumber(row.end) &&
        isOptionalNumber(row.consumption) &&
        isOptionalNumber(row.shipmentStart) &&
        isOptionalNumber(row.shipmentEnd) &&
        isOptionalNumber(row.shipmentConsumption),
    ) &&
    Array.isArray(value.granulation) &&
    value.granulation.every(
      (row) =>
        isProductionBaseRow(row) &&
        isOptionalNumber(row.platesInOperation) &&
        isOptionalNumber(row.millHours) &&
        isOptionalNumber(row.fraction1630Day) &&
        isOptionalNumber(row.fraction1630Month) &&
        isOptionalNumber(row.fraction1218Day) &&
        isOptionalNumber(row.fraction1218Month),
    )
  );
}

function isProductionReportTableTotals(
  value: unknown,
): value is ProductionReportTableTotals {
  return (
    isRecord(value) &&
    isProductionBrandCategoryTotals(value.forming) &&
    isProductionBrandCategoryTotals(value.sorting) &&
    isProductionBrandCategoryTotals(value.unformed) &&
    isProductionBrandCategoryTotals(value.chamotte) &&
    isProductionJarMeasurementTotals(value.jars) &&
    isProductionGranulationTotals(value.granulation)
  );
}

function isProductionBrandCategoryTotals(value: unknown) {
  return (
    isProductionTotalsBase(value) &&
    isOptionalNumber(value.dayPlan) &&
    isOptionalNumber(value.dayFact) &&
    isOptionalNumber(value.monthPlan) &&
    isOptionalNumber(value.monthFact) &&
    isOptionalNumber(value.deviation)
  );
}

function isProductionJarMeasurementTotals(value: unknown) {
  return (
    isProductionTotalsBase(value) &&
    isOptionalNumber(value.start) &&
    isOptionalNumber(value.end) &&
    isOptionalNumber(value.consumption) &&
    isOptionalNumber(value.shipmentStart) &&
    isOptionalNumber(value.shipmentEnd) &&
    isOptionalNumber(value.shipmentConsumption)
  );
}

function isProductionGranulationTotals(value: unknown) {
  return (
    isProductionTotalsBase(value) &&
    isOptionalNumber(value.platesInOperation) &&
    isOptionalNumber(value.millHours) &&
    isOptionalNumber(value.fraction1630Day) &&
    isOptionalNumber(value.fraction1630Month) &&
    isOptionalNumber(value.fraction1218Day) &&
    isOptionalNumber(value.fraction1218Month)
  );
}

function isProductionTotalsBase(
  value: unknown,
): value is Record<string, unknown> & { rowCount: number } {
  return (
    isRecord(value) &&
    typeof value.rowCount === "number" &&
    Number.isInteger(value.rowCount) &&
    value.rowCount >= 0
  );
}

function isProductionBrandCategoryRow(value: unknown) {
  return (
    isProductionMetricRow(value) &&
    "facts" in value &&
    Array.isArray(value.facts) &&
    value.facts.every(
      (fact) =>
        isRecord(fact) &&
        typeof fact.brand === "string" &&
        typeof fact.value === "number" &&
        Number.isFinite(fact.value) &&
        typeof fact.monthValue === "number" &&
        Number.isFinite(fact.monthValue),
    )
  );
}

function isProductionMetricRow(value: unknown): value is ProductionMetricRow {
  return (
    isProductionBaseRow(value) &&
    (value.brand === undefined || typeof value.brand === "string") &&
    isOptionalNumber(value.dayPlan) &&
    isOptionalNumber(value.dayFact) &&
    isOptionalNumber(value.monthPlan) &&
    isOptionalNumber(value.monthFact) &&
    isOptionalNumber(value.deviation)
  );
}

function isProductionBaseRow(
  value: unknown,
): value is Record<string, unknown> & {
  reportId: string;
  reportDate: string;
  receivedAt: string;
} {
  return (
    isRecord(value) &&
    typeof value.reportId === "string" &&
    typeof value.reportDate === "string" &&
    typeof value.receivedAt === "string"
  );
}

function isOptionalNumber(value: unknown) {
  return value === undefined || typeof value === "number";
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
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
