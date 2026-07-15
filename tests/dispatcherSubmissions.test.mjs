import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeDispatcherFeedSubmissions,
  requestCompleteDispatcherFeed,
  requestDispatcherForms,
  requestDispatcherFeed,
  submitDispatcherEquipmentReport,
  submitDispatcherSubmission,
} from "../.test-build/src/services/dispatcherSubmissions.js";
import {
  describeRemoteNetworkFailure,
  getRemoteServerConnection,
} from "../.test-build/src/services/remoteServer.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

const draft = {
  businessAccountId: "business-id",
  formId: "equipment",
  payload: {
    reportDate: "2026-06-18",
    equipment: "Пресс №1",
    productionTons: "42",
  },
};

const submission = {
  id: "submission-id",
  businessAccountId: "business-id",
  formId: "equipment",
  formTitle: "Оборудование",
  payload: draft.payload,
  summary: "Оборудование: Пресс №1 · Дата отчета: 2026-06-18",
  status: "received",
  submittedByAccountId: "dispatcher-access-id",
  submittedAt: "2026-06-18T00:00:00.000Z",
  receivedAt: "2026-06-18T00:00:01.000Z",
};

test("getRemoteServerConnection reports missing remote server without URL", () => {
  const result = getRemoteServerConnection({ baseUrl: "" });

  assert.equal(result.status, "missing");
});

test("getRemoteServerConnection warns when a LAN page targets loopback API", () => {
  const result = getRemoteServerConnection({
    baseUrl: "http://127.0.0.1:3000",
    pageHostname: "192.168.0.25",
    pageOrigin: "http://192.168.0.25:5173",
  });

  assert.equal(result.status, "configured");
  assert.match(result.warning, /LAN IP backend-сервера/);
});

test("describeRemoteNetworkFailure includes health and CORS diagnostics", () => {
  const message = describeRemoteNetworkFailure("Не удалось отправить данные.", {
    baseUrl: "http://192.168.0.103:3000",
    pageOrigin: "http://192.168.0.25:5173",
  });

  assert.match(message, /http:\/\/192\.168\.0\.103:3000\/health/);
  assert.match(message, /http:\/\/192\.168\.0\.25:5173/);
});

test("submitDispatcherSubmission reports not configured without remote URL", async () => {
  const result = await submitDispatcherSubmission(draft, { baseUrl: "" });

  assert.equal(result.status, "error");
  assert.equal(result.code, "server_not_configured");
});

test("dispatcher submissions can use local test storage without remote URL", async () => {
  const storage = createMemoryStorage();
  const formsResult = await requestDispatcherForms({
    baseUrl: "",
    localFallback: true,
    storage,
  });
  const submitResult = await submitDispatcherSubmission(draft, {
    baseUrl: "",
    localFallback: true,
    storage,
  });
  const feedResult = await requestDispatcherFeed({
    baseUrl: "",
    localFallback: true,
    storage,
  });

  assert.equal(formsResult.status, "ready");
  assert.equal(formsResult.source, "local_test");
  assert.equal(formsResult.forms.length, 5);
  assert.equal(formsResult.forms.some((form) => form.id === "visitor_exit"), true);
  assert.equal(formsResult.forms.some((form) => form.id === "gas_oc"), false);
  assert.equal(formsResult.forms.some((form) => form.id === "gas_cosh"), false);
  assert.equal(submitResult.status, "ready");
  assert.equal(submitResult.source, "local_test");
  assert.match(submitResult.submission.id, /^local-/);
  assert.equal(feedResult.status, "ready");
  assert.equal(feedResult.source, "local_test");
  assert.equal(feedResult.summary.total, 1);
  assert.equal(feedResult.submissions[0].id, submitResult.submission.id);
});

test("local visitor exit submissions use an open visitor entry", async () => {
  const storage = createMemoryStorage();
  const entryResult = await submitDispatcherSubmission(
    {
      businessAccountId: "business-id",
      formId: "visitor",
      payload: {
        fio: "Visitor Name",
        organization: "External Org",
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage,
    },
  );

  assert.equal(entryResult.status, "ready");

  const submitResult = await submitDispatcherSubmission(
    {
      businessAccountId: "business-id",
      formId: "visitor_exit",
      payload: {
        visitorEntryId: entryResult.submission.id,
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage,
    },
  );

  assert.equal(submitResult.status, "ready");
  assert.equal(submitResult.submission.payload.fio, "Visitor Name");
  assert.equal(submitResult.submission.payload.organization, "External Org");
  assert.match(
    submitResult.submission.payload.exitAt,
    /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/,
  );
});

test("local visitor submissions reject duplicate open entries and unknown exits", async () => {
  const storage = createMemoryStorage();
  const entryResult = await submitDispatcherSubmission(
    {
      businessAccountId: "business-id",
      formId: "visitor",
      payload: {
        fio: "Visitor Name",
        organization: "External Org",
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage,
    },
  );
  const duplicateEntryResult = await submitDispatcherSubmission(
    {
      businessAccountId: "business-id",
      formId: "visitor",
      payload: {
        fio: "Visitor Name",
        organization: "External Org",
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage,
    },
  );
  const unknownExitResult = await submitDispatcherSubmission(
    {
      businessAccountId: "business-id",
      formId: "visitor_exit",
      payload: {
        visitorEntryId: "missing-entry",
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage,
    },
  );

  assert.equal(entryResult.status, "ready");
  assert.equal(duplicateEntryResult.status, "error");
  assert.match(duplicateEntryResult.message, /уже вошёл/);
  assert.equal(unknownExitResult.status, "error");
  assert.match(unknownExitResult.message, /Выберите посетителя/);
});

test("local incident close submissions can close an earlier-day open incident", async () => {
  const storage = createMemoryStorage();
  const incidentResult = await submitDispatcherSubmission(
    {
      businessAccountId: "business-id",
      formId: "incident",
      payload: {
        datetime: "2026-07-04T10:00",
        location: "Цех 1",
        incidentType: "Травма",
        description: "Описание",
        criticality: "Высокий",
        responsible: "Ответственный",
        immediateActions: "Остановили участок",
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage,
    },
  );

  assert.equal(incidentResult.status, "ready");

  const incidentNumber = incidentResult.submission.payload.incidentNumber;

  assert.equal(typeof incidentNumber, "string");

  const closeResult = await submitDispatcherSubmission(
    {
      businessAccountId: "business-id",
      formId: "incident_close",
      payload: {
        incidentNumber,
        rootCauses: "Корневая причина",
        preventiveMeasures: "Профилактика",
        closureDateTime: "2026-07-05T12:00",
        approvedBy: "Начальник",
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage,
    },
  );
  const duplicateCloseResult = await submitDispatcherSubmission(
    {
      businessAccountId: "business-id",
      formId: "incident_close",
      payload: {
        incidentNumber,
        rootCauses: "Повтор",
        preventiveMeasures: "Повтор",
        closureDateTime: "2026-07-06T13:00",
        approvedBy: "Начальник",
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage,
    },
  );

  assert.equal(closeResult.status, "ready");
  assert.equal(closeResult.submission.payload.incidentNumber, incidentNumber);
  assert.equal(closeResult.submission.payload.location, "Цех 1");
  assert.equal(duplicateCloseResult.status, "error");
  assert.match(duplicateCloseResult.message, /незакрытый инцидент/);
});

test("local equipment submissions overwrite the same report date and equipment", async () => {
  const storage = createMemoryStorage();
  const firstSubmitResult = await submitDispatcherSubmission(draft, {
    baseUrl: "",
    localFallback: true,
    storage,
  });
  const secondSubmitResult = await submitDispatcherSubmission(
    {
      ...draft,
      payload: {
        ...draft.payload,
        productionTons: "43",
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage,
    },
  );
  const feedResult = await requestDispatcherFeed({
    baseUrl: "",
    localFallback: true,
    storage,
  });

  assert.equal(firstSubmitResult.status, "ready");
  assert.equal(secondSubmitResult.status, "ready");
  assert.equal(feedResult.status, "ready");
  assert.equal(secondSubmitResult.submission.id, firstSubmitResult.submission.id);
  assert.equal(feedResult.summary.total, 1);
  assert.equal(feedResult.submissions[0].payload.productionTons, "43");
});

test("local dispatcher feed filters equipment by report date payload", async () => {
  const storage = createMemoryStorage();

  await submitDispatcherSubmission(draft, {
    baseUrl: "",
    localFallback: true,
    storage,
  });

  const matchingFeedResult = await requestDispatcherFeed({
    baseUrl: "",
    formId: "equipment",
    reportDate: "2026-06-18",
    localFallback: true,
    storage,
  });
  const otherDateFeedResult = await requestDispatcherFeed({
    baseUrl: "",
    formId: "equipment",
    reportDate: "2026-06-19",
    localFallback: true,
    storage,
  });

  assert.equal(matchingFeedResult.status, "ready");
  assert.equal(matchingFeedResult.submissions.length, 1);
  assert.equal(otherDateFeedResult.status, "ready");
  assert.equal(otherDateFeedResult.submissions.length, 0);
});

test("local equipment submissions reject downtime reason without positive hours", async () => {
  const result = await submitDispatcherSubmission(
    {
      businessAccountId: "business-id",
      formId: "equipment",
      payload: {
        reportDate: "2026-06-18",
        equipment: "Пресс №1",
        downtimeReason: "Резерв",
        downtimeHours: "0",
        productionTons: "10",
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage: createMemoryStorage(),
    },
  );

  assert.equal(result.status, "error");
  assert.match(result.message, /время простоя больше 0/);
});

test("local equipment submissions reject downtime hours without reason", async () => {
  const result = await submitDispatcherSubmission(
    {
      businessAccountId: "business-id",
      formId: "equipment",
      payload: {
        reportDate: "2026-06-18",
        equipment: "Пресс №1",
        downtimeHours: "7",
        productionTons: "10",
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage: createMemoryStorage(),
    },
  );

  assert.equal(result.status, "error");
  assert.match(result.message, /причину простоя/);
});

test("local equipment submissions reject reserve downtime under 8 hours", async () => {
  const result = await submitDispatcherSubmission(
    {
      businessAccountId: "business-id",
      formId: "equipment",
      payload: {
        reportDate: "2026-06-18",
        equipment: "Пресс №1",
        downtimeReason: "Резерв",
        downtimeHours: "7",
        productionTons: "10",
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage: createMemoryStorage(),
    },
  );

  assert.equal(result.status, "error");
  assert.match(result.message, /Резерв/);
});

test("local equipment submissions reject short downtime without production", async () => {
  const result = await submitDispatcherSubmission(
    {
      businessAccountId: "business-id",
      formId: "equipment",
      payload: {
        reportDate: "2026-06-18",
        equipment: "Пресс №1",
        downtimeReason: "Замена марки/формы",
        downtimeHours: "7",
      },
    },
    {
      baseUrl: "",
      localFallback: true,
      storage: createMemoryStorage(),
    },
  );

  assert.equal(result.status, "error");
  assert.match(result.message, /выработка должна быть больше 0/);
});

test("submitDispatcherEquipmentReport posts a batch to remote server", async () => {
  let request;

  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(
      JSON.stringify({
        submissions: [
          submission,
          {
            ...submission,
            id: "submission-id-2",
            payload: {
              ...submission.payload,
              equipment: "Пресс №2",
              productionTons: "12",
            },
          },
        ],
        reportStatus: "created",
      }),
      {
        status: 201,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const value = {
    businessAccountId: "business-id",
    items: [
      draft.payload,
      {
        reportDate: "2026-06-18",
        equipment: "Пресс №2",
        productionTons: "12",
      },
    ],
  };
  const result = await submitDispatcherEquipmentReport(value, {
    baseUrl: "https://api.example.test/",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.submissions.length, 2);
  assert.equal(result.reportStatus, "created");
  assert.equal(
    request.endpoint,
    "https://api.example.test/api/dispatcher/equipment-report",
  );
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.credentials, "include");
  assert.deepEqual(JSON.parse(request.init.body), value);
});

test("local equipment reports update existing daily equipment rows", async () => {
  const storage = createMemoryStorage();
  const items = await readLocalEquipmentReportItems(storage);
  const firstResult = await submitDispatcherEquipmentReport(
    {
      businessAccountId: "business-id",
      items,
    },
    {
      baseUrl: "",
      localFallback: true,
      storage,
    },
  );
  const secondResult = await submitDispatcherEquipmentReport(
    {
      businessAccountId: "business-id",
      items: items.map((payload) =>
        payload.equipment === "Пресс №1"
          ? {
              ...payload,
              productionTons: "44",
            }
          : payload,
      ),
    },
    {
      baseUrl: "",
      localFallback: true,
      storage,
    },
  );
  const feedResult = await requestDispatcherFeed({
    baseUrl: "",
    localFallback: true,
    storage,
  });

  assert.equal(firstResult.status, "ready");
  assert.equal(firstResult.reportStatus, "created");
  assert.equal(secondResult.status, "ready");
  assert.equal(secondResult.reportStatus, "updated");
  assert.equal(feedResult.status, "ready");
  assert.equal(feedResult.summary.total, items.length);
  assert.equal(
    feedResult.submissions.find(
      (item) => item.payload.equipment === "Пресс №1",
    )?.payload.productionTons,
    "44",
  );
});

test("requestDispatcherForms reads server form definitions", async () => {
  let request;

  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(
      JSON.stringify({
        forms: [
          {
            id: "equipment",
            title: "Оборудование",
            sheetName: "Оборудование",
            fields: [
              {
                name: "reportDate",
                label: "Дата отчета",
                type: "date",
                required: true,
              },
            ],
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const result = await requestDispatcherForms({
    baseUrl: "https://api.example.test",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.forms[0].id, "equipment");
  assert.equal(request.endpoint, "https://api.example.test/api/dispatcher/forms");
  assert.equal(request.init.method, "GET");
});

test("submitDispatcherSubmission posts draft to remote server", async () => {
  let request;

  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(JSON.stringify({ submission }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await submitDispatcherSubmission(draft, {
    baseUrl: "https://api.example.test/",
  });

  assert.equal(result.status, "ready");
  assert.equal(request.endpoint, "https://api.example.test/api/dispatcher/submissions");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.credentials, "include");
  assert.deepEqual(JSON.parse(request.init.body), draft);
});

test("submitDispatcherSubmission reports network diagnostics on fetch failure", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  const result = await submitDispatcherSubmission(draft, {
    baseUrl: "http://192.168.0.103:3000",
  });

  assert.equal(result.status, "error");
  assert.equal(result.code, "network_error");
  assert.match(result.message, /\/health/);
  assert.match(result.message, /CORS_ORIGIN/);
});

test("dispatcher forms use local test storage on network failure when enabled", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  const result = await requestDispatcherForms({
    baseUrl: "http://127.0.0.1:3000",
    localFallback: true,
    storage: createMemoryStorage(),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.source, "local_test");
  assert.equal(result.forms[0].id, "equipment");
});

test("requestDispatcherFeed reads live history from remote server", async () => {
  let request;

  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(
      JSON.stringify({
        submissions: [submission],
        receivedAt: "2026-06-18T00:00:02.000Z",
        summary: {
          total: 1,
          byForm: [
            {
              formId: "equipment",
              formTitle: "Оборудование",
              count: 1,
            },
          ],
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const result = await requestDispatcherFeed({
    baseUrl: "https://api.example.test",
    formId: "equipment",
    dateFrom: "2026-06-01",
    dateTo: "2026-06-30",
    reportDate: "2026-06-18",
    limit: 500,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.submissions.length, 1);
  assert.equal(
    request.endpoint,
    "https://api.example.test/api/dispatcher/submissions?formId=equipment&dateFrom=2026-06-01&dateTo=2026-06-30&reportDate=2026-06-18&limit=500",
  );
  assert.equal(request.init.method, "GET");
});

test("requestCompleteDispatcherFeed reads every history page", async () => {
  const requestedEndpoints = [];

  globalThis.fetch = async (endpoint) => {
    requestedEndpoints.push(endpoint);
    const offset = Number(new URL(endpoint).searchParams.get("offset") ?? 0);
    const pageSubmissions =
      offset === 0
        ? [
            { ...submission, id: "submission-3" },
            { ...submission, id: "submission-2" },
          ]
        : [{ ...submission, id: "submission-1" }];

    return new Response(
      JSON.stringify({
        submissions: pageSubmissions,
        receivedAt: "2026-06-18T00:00:02.000Z",
        summary: {
          total: 3,
          byForm: [
            {
              formId: "equipment",
              formTitle: "Оборудование",
              count: 3,
            },
          ],
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const result = await requestCompleteDispatcherFeed({
    baseUrl: "https://api.example.test",
    limit: 2,
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(
    result.submissions.map((item) => item.id),
    ["submission-3", "submission-2", "submission-1"],
  );
  assert.deepEqual(requestedEndpoints, [
    "https://api.example.test/api/dispatcher/submissions?limit=2&offset=0",
    "https://api.example.test/api/dispatcher/submissions?limit=2&offset=2",
  ]);
});

test("mergeDispatcherFeedSubmissions replaces cached rows from the latest page", () => {
  const cachedSubmission = { ...submission, id: "cached", summary: "Старое" };
  const updatedSubmission = { ...cachedSubmission, summary: "Новое" };
  const newSubmission = { ...submission, id: "new" };

  assert.deepEqual(
    mergeDispatcherFeedSubmissions(
      [cachedSubmission, { ...submission, id: "older" }],
      [newSubmission, updatedSubmission],
    ).map((item) => [item.id, item.summary]),
    [
      ["new", submission.summary],
      ["cached", "Новое"],
      ["older", submission.summary],
    ],
  );
});

test("requestDispatcherFeed rejects unsupported remote payloads", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ rows: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await requestDispatcherFeed({
    baseUrl: "https://api.example.test",
  });

  assert.equal(result.status, "error");
  assert.equal(result.code, "invalid_response");
});

async function readLocalEquipmentReportItems(storage) {
  const formsResult = await requestDispatcherForms({
    baseUrl: "",
    localFallback: true,
    storage,
  });

  if (formsResult.status !== "ready") {
    throw new Error("Local dispatcher forms were not available.");
  }

  const equipmentForm = formsResult.forms.find((form) => form.id === "equipment");
  const equipmentOptions =
    equipmentForm?.fields.find((field) => field.name === "equipment")?.options ??
    [];

  return equipmentOptions.map((equipment, index) => ({
    reportDate: "2026-06-18",
    equipment,
    productionTons: equipment === "Пресс №1" ? "42" : String(index + 1),
  }));
}

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}
