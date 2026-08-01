import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { GoogleSheetsReferenceConfig } from "../config/env.js";
import type { BankVolumeReference } from "../domain/bankMeasurement.js";
import type { NotificationRecipientGroups } from "./dispatcherNotifications.js";

export type DispatcherReferenceData = {
  incidentLocationOptions: string[];
  incidentResponsibleOptions: string[];
  notificationRecipients: NotificationRecipients;
  maxNotificationRecipients: MaxNotificationRecipients;
  refractoryNotificationRecipients: string[];
  refractoryMaxNotificationRecipients: string[];
  refractoryReviewNotificationRecipients: string[];
  refractoryReviewMaxNotificationRecipients: string[];
};

export type NotificationRecipients = NotificationRecipientGroups;

export type MaxNotificationRecipients = NotificationRecipientGroups;

export type DispatcherReferenceDataSource = {
  read: () => Promise<DispatcherReferenceData>;
};

export type ProductionBrandReference = {
  fieldName: string;
  label: string;
};

export type ProductionBrandResolution =
  | { ok: true; references: ProductionBrandReference[] }
  | { ok: false; missing: ProductionBrandReference };

export type ProductionBrandsDataSource = {
  list: () => Promise<string[]>;
  create: (
    label: string,
    commitCreated: (label: string) => Promise<void>,
  ) => Promise<{ label: string; created: boolean }>;
  resolveReferences: (
    references: ProductionBrandReference[],
  ) => Promise<ProductionBrandResolution>;
};

export const laboratoryIndicatorDefinitions = [
  { id: "al2o3", label: "Al2O3" },
  { id: "fe2o3", label: "Fe2O3" },
  { id: "sio2", label: "SiO2" },
  { id: "cao2", label: "CaO2" },
  { id: "p2o5", label: "P2O5" },
  { id: "loss_on_ignition", label: "ппп" },
  { id: "moisture", label: "Влажность" },
  { id: "bulk_density", label: "Насыпной вес" },
  { id: "water_absorption", label: "Водопоглощение" },
  { id: "strength", label: "Прочность" },
  { id: "grain_composition", label: "Зерновой состав" },
] as const;

export type LaboratoryIndicatorId =
  (typeof laboratoryIndicatorDefinitions)[number]["id"];

export type LaboratoryIndicatorReference = {
  id: LaboratoryIndicatorId;
  label: string;
  standard?: string;
};

export type LaboratoryProductTypeReference = {
  label: string;
  indicatorIds: LaboratoryIndicatorId[];
};

export type LaboratoryIncomingTestProfile = {
  label: string;
  indicatorIds: LaboratoryIndicatorId[];
};

export type LaboratoryReferenceData = {
  indicators: LaboratoryIndicatorReference[];
  incomingTestProfiles: LaboratoryIncomingTestProfile[];
  finishedProductTypes: LaboratoryProductTypeReference[];
};

export type LaboratoryReferenceDataSource = {
  read: () => Promise<LaboratoryReferenceData>;
};

export type BankVolumeReferenceDataSource = {
  read: () => Promise<BankVolumeReference>;
};

type FetchLike = typeof fetch;
type ReadTextFile = (path: string) => Promise<string>;

type GoogleSheetsReferenceDependencies = {
  readTextFile?: ReadTextFile;
  now?: () => number;
};

export type GoogleSheetsWorkbook = {
  spreadsheetId: string;
  rowsBySheet: Record<string, string[][]>;
};

type GoogleServiceAccountCredentials = {
  type: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type GoogleAccessTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
};

type GoogleSpreadsheetMetadataResponse = {
  sheets?: unknown;
};

type GoogleSpreadsheetValuesResponse = {
  values?: unknown;
};

type GoogleSheetMetadata = {
  properties?: {
    sheetId?: unknown;
    title?: unknown;
  };
};

const emptyReferenceData: DispatcherReferenceData = {
  incidentLocationOptions: [],
  incidentResponsibleOptions: [],
  notificationRecipients: {
    incidentAndEquipment: [],
    mechanicalDowntime: [],
    electricalDowntime: [],
    visitors: [],
  },
  maxNotificationRecipients: {
    incidentAndEquipment: [],
    mechanicalDowntime: [],
    electricalDowntime: [],
    visitors: [],
  },
  refractoryNotificationRecipients: [],
  refractoryMaxNotificationRecipients: [],
  refractoryReviewNotificationRecipients: [],
  refractoryReviewMaxNotificationRecipients: [],
};
const googleSheetsReadonlyScope =
  "https://www.googleapis.com/auth/spreadsheets.readonly";
const googleSheetsWriteScope =
  "https://www.googleapis.com/auth/spreadsheets";
const defaultGoogleTokenUri = "https://oauth2.googleapis.com/token";
const productionBrandsSheetTitle = "Номенклатура";
const laboratorySheetTitle = "Лаборатория";
const banksSheetTitle = "Банки";
/**
 * ID адресата MAX — это число или короткий идентификатор. Ограничение длины
 * отсекает токен бота, который в таблице хранится в той же колонке, что и ID.
 */
const maxRecipientIdLength = 32;
const notificationRecipientRanges = {
  incidentAndEquipment: [{ startRow: 2, endRow: 20 }],
  mechanicalDowntime: [{ startRow: 22, endRow: 25 }],
  electricalDowntime: [{ startRow: 27, endRow: 30 }],
  visitors: [{ startRow: 2, endRow: 20 }],
  refractory: [{ startRow: 2, endRow: 20 }],
} as const;

export function createGoogleSheetsReferenceDataSource(
  config: GoogleSheetsReferenceConfig,
  fetchImpl: FetchLike = fetch,
  dependencies: GoogleSheetsReferenceDependencies = {},
): DispatcherReferenceDataSource {
  let cachedData: DispatcherReferenceData | undefined;
  let cacheExpiresAt = 0;
  const readTextFile =
    dependencies.readTextFile ?? ((path) => readFile(path, "utf8"));
  const now = dependencies.now ?? Date.now;

  return {
    async read() {
      const readStartedAt = now();

      if (cachedData !== undefined && readStartedAt < cacheExpiresAt) {
        return cachedData;
      }

      try {
        const rows = await readGoogleSheetsRows(config, fetchImpl, readTextFile, now);
        cachedData = {
          incidentLocationOptions: readColumnOptionsFromRows(
            rows,
            config.locationColumn,
          ),
          incidentResponsibleOptions: readColumnOptionsFromRows(
            rows,
            config.responsibleColumn,
          ),
          notificationRecipients: readNotificationRecipientsFromRows(
            rows,
            config.notificationEmailColumns,
            config.visitorNotificationEmailColumns,
          ),
          maxNotificationRecipients: readMaxNotificationRecipientsFromRows(
            rows,
            config.maxUserIdColumns,
            config.visitorMaxUserIdColumns,
          ),
          ...readRefractoryNotificationRecipientsFromRows(
            rows,
            config.refractoryNotificationEmailColumns ?? [],
            config.refractoryMaxUserIdColumns ?? [],
            config.refractoryReviewNotificationEmailColumns ?? [],
            config.refractoryReviewMaxUserIdColumns ?? [],
          ),
        };
      } catch (error) {
        console.warn("reference_data.google_sheets_fetch_failed", error);
        cachedData = emptyReferenceData;
      }

      cacheExpiresAt = readStartedAt + config.cacheTtlMs;

      return cachedData;
    },
  };
}

export function createGoogleSheetsProductionBrandsDataSource(
  config: GoogleSheetsReferenceConfig,
  fetchImpl: FetchLike = fetch,
  dependencies: GoogleSheetsReferenceDependencies = {},
): ProductionBrandsDataSource {
  let cachedData: string[] | undefined;
  let cacheExpiresAt = 0;
  let writeQueue = Promise.resolve();
  const now = dependencies.now ?? Date.now;
  const readTextFile =
    dependencies.readTextFile ?? ((path: string) => readFile(path, "utf8"));

  async function list() {
    const readStartedAt = now();

    if (cachedData !== undefined && readStartedAt < cacheExpiresAt) {
      return cachedData;
    }

    const workbook = await readGoogleSheetsWorkbook(
      config,
      config.url,
      [productionBrandsSheetTitle],
      fetchImpl,
      dependencies,
    );
    cachedData = readProductionBrandLabels(
      workbook.rowsBySheet[productionBrandsSheetTitle] ?? [],
    );
    cacheExpiresAt = readStartedAt + config.cacheTtlMs;

    return cachedData;
  }

  async function createNow(
    rawLabel: string,
    commitCreated: (label: string) => Promise<void>,
  ) {
    const label = normalizeProductionBrandLabel(rawLabel);

    if (config.authMode !== "service_account") {
      throw new Error(
        "Adding production brands requires GOOGLE_SHEETS_AUTH=service_account.",
      );
    }
    if (config.serviceAccountKeyFile === undefined) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_KEY_FILE is required when GOOGLE_SHEETS_AUTH=service_account.",
      );
    }

    const spreadsheetId = readSpreadsheetId(new URL(config.url));

    if (spreadsheetId === undefined) {
      throw new Error("GOOGLE_SHEETS_REFERENCE_URL must be a Google Sheets URL.");
    }

    const credentials = await readGoogleServiceAccountCredentials(
      config.serviceAccountKeyFile,
      readTextFile,
    );
    const accessToken = await requestGoogleAccessToken(
      credentials,
      fetchImpl,
      now,
      googleSheetsWriteScope,
    );
    const rows = await readGoogleSheetRowsByTitle(
      spreadsheetId,
      productionBrandsSheetTitle,
      accessToken,
      fetchImpl,
      "A:A",
    );
    const labels = readProductionBrandLabels(rows);
    const normalizedLabel = normalizeOption(label);
    const existing = labels.find(
      (candidate) => normalizeOption(candidate) === normalizedLabel,
    );

    if (existing !== undefined) {
      cachedData = labels;
      cacheExpiresAt = now() + config.cacheTtlMs;
      return { label: existing, created: false };
    }

    let rowIndex = 1;

    while ((rows[rowIndex]?.[0] ?? "").trim().length > 0) {
      rowIndex += 1;
    }

    const rowNumber = rowIndex + 1;
    const range = `${quoteA1SheetName(productionBrandsSheetTitle)}!A${rowNumber}`;
    const valuesUrl = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range,
      )}`,
    );
    valuesUrl.searchParams.set("valueInputOption", "RAW");

    await fetchGoogleJson(
      valuesUrl,
      accessToken,
      fetchImpl,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          range,
          majorDimension: "ROWS",
          values: [[label]],
        }),
      },
    );

    try {
      await commitCreated(label);
    } catch (commitError) {
      const clearUrl = new URL(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          range,
        )}:clear`,
      );

      try {
        await fetchGoogleJson(clearUrl, accessToken, fetchImpl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      } catch (rollbackError) {
        throw new AggregateError(
          [commitError, rollbackError],
          "Production brand audit failed and the Google Sheets rollback failed.",
        );
      }

      cachedData = labels;
      cacheExpiresAt = now() + config.cacheTtlMs;
      throw commitError;
    }

    const updatedRows = rows.map((row) => [...row]);
    updatedRows[rowIndex] = [label];
    cachedData = readProductionBrandLabels(updatedRows);
    cacheExpiresAt = now() + config.cacheTtlMs;

    return { label, created: true };
  }

  return {
    list,
    create(label, commitCreated) {
      const operation = writeQueue.then(
        () => createNow(label, commitCreated),
        () => createNow(label, commitCreated),
      );
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    async resolveReferences(references) {
      const labelByKey = new Map(
        (await list()).map((label) => [normalizeOption(label), label]),
      );
      const missing = references.find(
        (reference) => !labelByKey.has(normalizeOption(reference.label)),
      );

      if (missing !== undefined) {
        return { ok: false, missing };
      }

      return {
        ok: true,
        references: references.map((reference) => ({
          fieldName: reference.fieldName,
          label: labelByKey.get(normalizeOption(reference.label)) ?? reference.label,
        })),
      };
    },
  };
}

export function createGoogleSheetsLaboratoryReferenceDataSource(
  config: GoogleSheetsReferenceConfig,
  fetchImpl: FetchLike = fetch,
  dependencies: GoogleSheetsReferenceDependencies = {},
): LaboratoryReferenceDataSource {
  let cachedData: LaboratoryReferenceData | undefined;
  let cacheExpiresAt = 0;
  const now = dependencies.now ?? Date.now;

  return {
    async read() {
      const readStartedAt = now();

      if (cachedData !== undefined && readStartedAt < cacheExpiresAt) {
        return cachedData;
      }

      const workbook = await readGoogleSheetsWorkbook(
        config,
        config.url,
        [laboratorySheetTitle],
        fetchImpl,
        dependencies,
      );
      cachedData = readLaboratoryReferenceFromRows(
        workbook.rowsBySheet[laboratorySheetTitle] ?? [],
      );
      cacheExpiresAt = readStartedAt + config.cacheTtlMs;
      return cachedData;
    },
  };
}

export function createGoogleSheetsBankVolumeReferenceDataSource(
  config: GoogleSheetsReferenceConfig,
  fetchImpl: FetchLike = fetch,
  dependencies: GoogleSheetsReferenceDependencies = {},
): BankVolumeReferenceDataSource {
  let cachedData: BankVolumeReference | undefined;
  let cacheExpiresAt = 0;
  const now = dependencies.now ?? Date.now;

  return {
    async read() {
      const readStartedAt = now();
      if (cachedData !== undefined && readStartedAt < cacheExpiresAt) {
        return cachedData;
      }

      const workbook = await readGoogleSheetsWorkbook(
        config,
        config.url,
        [banksSheetTitle],
        fetchImpl,
        dependencies,
      );
      cachedData = readBankVolumeReferenceFromRows(
        workbook.rowsBySheet[banksSheetTitle] ?? [],
      );
      cacheExpiresAt = readStartedAt + config.cacheTtlMs;
      return cachedData;
    },
  };
}

export async function readGoogleSheetsWorkbook(
  config: GoogleSheetsReferenceConfig,
  sourceUrl: string,
  sheetTitles: readonly string[],
  fetchImpl: FetchLike = fetch,
  dependencies: GoogleSheetsReferenceDependencies = {},
): Promise<GoogleSheetsWorkbook> {
  const parsedUrl = new URL(sourceUrl);
  const spreadsheetId = readSpreadsheetId(parsedUrl);

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "docs.google.com" ||
    spreadsheetId === undefined
  ) {
    throw new Error("Import source must be a Google Sheets URL.");
  }

  const rowsBySheet: Record<string, string[][]> = {};

  if (config.authMode === "service_account") {
    if (config.serviceAccountKeyFile === undefined) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_KEY_FILE is required when GOOGLE_SHEETS_AUTH=service_account.",
      );
    }

    const readTextFile =
      dependencies.readTextFile ?? ((path) => readFile(path, "utf8"));
    const credentials = await readGoogleServiceAccountCredentials(
      config.serviceAccountKeyFile,
      readTextFile,
    );
    const accessToken = await requestGoogleAccessToken(
      credentials,
      fetchImpl,
      dependencies.now ?? Date.now,
    );

    for (const sheetTitle of sheetTitles) {
      rowsBySheet[sheetTitle] = await readGoogleSheetRowsByTitle(
        spreadsheetId,
        sheetTitle,
        accessToken,
        fetchImpl,
      );
    }
  } else {
    for (const sheetTitle of sheetTitles) {
      rowsBySheet[sheetTitle] = await readGoogleSheetsNamedSheetCsvRows(
        sourceUrl,
        sheetTitle,
        fetchImpl,
      );
    }
  }

  return {
    spreadsheetId,
    rowsBySheet,
  };
}

async function readGoogleSheetsRows(
  config: GoogleSheetsReferenceConfig,
  fetchImpl: FetchLike,
  readTextFile: ReadTextFile,
  now: () => number,
) {
  if (config.authMode === "service_account") {
    return readGoogleSheetsApiRows(config, fetchImpl, readTextFile, now);
  }

  return readGoogleSheetsCsvRows(config.url, fetchImpl);
}

async function readGoogleSheetsCsvRows(sourceUrl: string, fetchImpl: FetchLike) {
  const csvUrl = buildGoogleSheetsCsvUrl(sourceUrl);
  const response = await fetchImpl(csvUrl, {
    headers: {
      Accept: "text/csv,text/plain;q=0.9,*/*;q=0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`Google Sheets responded with ${response.status}.`);
  }

  return parseCsvRows(await response.text());
}

async function readGoogleSheetsNamedSheetCsvRows(
  sourceUrl: string,
  sheetTitle: string,
  fetchImpl: FetchLike,
) {
  const source = new URL(sourceUrl);
  const spreadsheetId = readSpreadsheetId(source);

  if (spreadsheetId === undefined) {
    throw new Error("Import source must be a Google Sheets URL.");
  }

  const csvUrl = new URL(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq`,
  );

  csvUrl.searchParams.set("tqx", "out:csv");
  csvUrl.searchParams.set("sheet", sheetTitle);

  const response = await fetchImpl(csvUrl, {
    headers: {
      Accept: "text/csv,text/plain;q=0.9,*/*;q=0.1",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Google Sheets tab ${sheetTitle} responded with ${response.status}.`,
    );
  }

  return parseCsvRows(await response.text());
}

async function readGoogleSheetsApiRows(
  config: GoogleSheetsReferenceConfig,
  fetchImpl: FetchLike,
  readTextFile: ReadTextFile,
  now: () => number,
) {
  if (config.serviceAccountKeyFile === undefined) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY_FILE is required when GOOGLE_SHEETS_AUTH=service_account.",
    );
  }

  const sheetUrl = new URL(config.url);
  const spreadsheetId = readSpreadsheetId(sheetUrl);

  if (spreadsheetId === undefined) {
    throw new Error("GOOGLE_SHEETS_REFERENCE_URL must be a Google Sheets URL.");
  }

  const credentials = await readGoogleServiceAccountCredentials(
    config.serviceAccountKeyFile,
    readTextFile,
  );
  const accessToken = await requestGoogleAccessToken(credentials, fetchImpl, now);
  const sheetTitle = await readSheetTitleByGid(
    spreadsheetId,
    readSheetGid(sheetUrl),
    accessToken,
    fetchImpl,
  );
  const valuesUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      quoteA1SheetName(sheetTitle),
    )}`,
  );

  valuesUrl.searchParams.set("majorDimension", "ROWS");
  valuesUrl.searchParams.set("valueRenderOption", "FORMATTED_VALUE");

  const valuesResponse = await fetchGoogleJson<GoogleSpreadsheetValuesResponse>(
    valuesUrl,
    accessToken,
    fetchImpl,
  );

  return normalizeGoogleValuesRows(valuesResponse.values);
}

async function readGoogleServiceAccountCredentials(
  keyFilePath: string,
  readTextFile: ReadTextFile,
) {
  const parsed = JSON.parse(
    await readTextFile(keyFilePath),
  ) as Partial<GoogleServiceAccountCredentials>;

  if (
    parsed.type !== "service_account" ||
    typeof parsed.client_email !== "string" ||
    typeof parsed.private_key !== "string"
  ) {
    throw new Error(
      "Google service account key must contain type, client_email, and private_key.",
    );
  }

  return {
    type: parsed.type,
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    token_uri:
      typeof parsed.token_uri === "string" && parsed.token_uri.length > 0
        ? parsed.token_uri
        : defaultGoogleTokenUri,
  } satisfies GoogleServiceAccountCredentials;
}

async function requestGoogleAccessToken(
  credentials: GoogleServiceAccountCredentials,
  fetchImpl: FetchLike,
  now: () => number,
  scope = googleSheetsReadonlyScope,
) {
  const tokenUri = credentials.token_uri ?? defaultGoogleTokenUri;
  const issuedAt = Math.floor(now() / 1000);
  const assertion = createServiceAccountJwt(
    credentials,
    tokenUri,
    issuedAt,
    scope,
  );
  const response = await fetchImpl(tokenUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token endpoint responded with ${response.status}.`);
  }

  const payload = (await response.json()) as GoogleAccessTokenResponse;

  if (typeof payload.access_token !== "string") {
    throw new Error("Google OAuth token response did not contain access_token.");
  }

  return payload.access_token;
}

function createServiceAccountJwt(
  credentials: GoogleServiceAccountCredentials,
  tokenUri: string,
  issuedAt: number,
  scope: string,
) {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const claimSet = {
    iss: credentials.client_email,
    scope,
    aud: tokenUri,
    exp: issuedAt + 3600,
    iat: issuedAt,
  };
  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claimSet),
  )}`;
  const signature = createSign("RSA-SHA256")
    .update(unsignedJwt)
    .sign(credentials.private_key);

  return `${unsignedJwt}.${base64UrlEncode(signature)}`;
}

async function readSheetTitleByGid(
  spreadsheetId: string,
  gid: string,
  accessToken: string,
  fetchImpl: FetchLike,
) {
  const metadataUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
  );

  metadataUrl.searchParams.set("fields", "sheets(properties(sheetId,title))");

  const metadata = await fetchGoogleJson<GoogleSpreadsheetMetadataResponse>(
    metadataUrl,
    accessToken,
    fetchImpl,
  );
  const numericGid = Number(gid);

  if (!Number.isInteger(numericGid)) {
    throw new Error("Google Sheets gid must be an integer.");
  }

  const sheets = Array.isArray(metadata.sheets)
    ? (metadata.sheets as GoogleSheetMetadata[])
    : [];
  const sheet = sheets.find((item) => item.properties?.sheetId === numericGid);
  const title = sheet?.properties?.title;

  if (typeof title !== "string" || title.length === 0) {
    throw new Error(`Google Sheets tab with gid ${gid} was not found.`);
  }

  return title;
}

async function fetchGoogleJson<T>(
  url: URL,
  accessToken: string,
  fetchImpl: FetchLike,
  init: RequestInit = {},
) {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    throw new Error(`Google Sheets API responded with ${response.status}.`);
  }

  return (await response.json()) as T;
}

async function readGoogleSheetRowsByTitle(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string,
  fetchImpl: FetchLike,
  a1Range?: string,
) {
  const range = a1Range === undefined
    ? quoteA1SheetName(sheetTitle)
    : `${quoteA1SheetName(sheetTitle)}!${a1Range}`;
  const valuesUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}`,
  );

  valuesUrl.searchParams.set("majorDimension", "ROWS");
  valuesUrl.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");

  const response = await fetchGoogleJson<GoogleSpreadsheetValuesResponse>(
    valuesUrl,
    accessToken,
    fetchImpl,
  );

  return normalizeGoogleValuesRows(response.values);
}

export function buildGoogleSheetsCsvUrl(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const spreadsheetId = readSpreadsheetId(url);

  if (spreadsheetId === undefined) {
    return sourceUrl;
  }

  const gid = readSheetGid(url);
  const csvUrl = new URL(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export`,
  );

  csvUrl.searchParams.set("format", "csv");
  csvUrl.searchParams.set("gid", gid);

  return csvUrl.toString();
}

export function readColumnOptionsFromCsv(csv: string, columnLabel: string) {
  return readColumnOptionsFromRows(parseCsvRows(csv), columnLabel);
}

export function readNotificationRecipientsFromCsv(
  csv: string,
  columnLabels: readonly string[],
  visitorColumnLabels: readonly string[] = [],
) {
  return readNotificationRecipientsFromRows(
    parseCsvRows(csv),
    columnLabels,
    visitorColumnLabels,
  );
}

export function readMaxNotificationRecipientsFromCsv(
  csv: string,
  columnLabels: readonly string[],
  visitorColumnLabels: readonly string[] = [],
) {
  return readMaxNotificationRecipientsFromRows(
    parseCsvRows(csv),
    columnLabels,
    visitorColumnLabels,
  );
}

function readRefractoryNotificationRecipientsFromRows(
  rows: string[][],
  emailColumnLabels: readonly string[],
  maxUserIdColumnLabels: readonly string[],
  reviewEmailColumnLabels: readonly string[],
  reviewMaxUserIdColumnLabels: readonly string[],
) {
  return {
    refractoryNotificationRecipients: readEmailsFromColumnRows(
      rows,
      emailColumnLabels,
      notificationRecipientRanges.refractory,
    ),
    refractoryMaxNotificationRecipients: readMaxUserIdsFromColumnRows(
      rows,
      maxUserIdColumnLabels,
      notificationRecipientRanges.refractory,
    ),
    refractoryReviewNotificationRecipients: readEmailsFromColumnRows(
      rows,
      reviewEmailColumnLabels,
      notificationRecipientRanges.refractory,
    ),
    refractoryReviewMaxNotificationRecipients: readMaxUserIdsFromColumnRows(
      rows,
      reviewMaxUserIdColumnLabels,
      notificationRecipientRanges.refractory,
    ),
  };
}

export function readColumnOptionsFromRows(
  rows: string[][],
  columnLabel: string,
) {
  const normalizedColumnLabel = normalizeHeader(columnLabel);
  const options: string[] = [];
  const seen = new Set<string>();

  for (const [rowIndex, row] of rows.entries()) {
    for (const [columnIndex, cell] of row.entries()) {
      if (normalizeHeader(cell) !== normalizedColumnLabel) {
        continue;
      }

      for (const valueRow of rows.slice(rowIndex + 1)) {
        const value = valueRow[columnIndex]?.trim() ?? "";

        if (value.length === 0) {
          break;
        }

        const normalizedValue = normalizeOption(value);

        if (normalizedValue.length === 0 || seen.has(normalizedValue)) {
          continue;
        }

        seen.add(normalizedValue);
        options.push(value);
      }
    }
  }

  return options;
}

export function readProductionBrandLabels(rows: string[][]) {
  if (normalizeHeader(rows[0]?.[0] ?? "") !== "наименование") {
    throw new Error(
      "Google Sheets tab Номенклатура must contain Наименование in cell A1.",
    );
  }

  const labels: string[] = [];
  const seen = new Set<string>();

  for (const row of rows.slice(1)) {
    const label = (row[0] ?? "").trim().replace(/\s+/g, " ");

    if (label.length === 0 || label.length > 120) {
      continue;
    }

    const normalizedLabel = normalizeOption(label);

    if (seen.has(normalizedLabel)) {
      continue;
    }

    seen.add(normalizedLabel);
    labels.push(label);
  }

  return labels;
}

export function readLaboratoryReferenceFromRows(
  rows: string[][],
): LaboratoryReferenceData {
  const headerRowIndex = rows.findIndex(
    (row) =>
      normalizeHeader(row[0] ?? "") === "раздел" &&
      normalizeHeader(row[1] ?? "") === "материал",
  );

  if (headerRowIndex < 0) {
    throw new Error(
      "Google Sheets tab Лаборатория must contain Раздел and Материал headers.",
    );
  }

  const headerRow = rows[headerRowIndex] ?? [];
  const standardRow = rows
    .slice(headerRowIndex + 1)
    .find((row) => normalizeHeader(row[0] ?? "") === "ссылка на гост");
  const definitionByHeader = new Map(
    laboratoryIndicatorDefinitions.map((definition) => [
      normalizeHeader(definition.label),
      definition,
    ]),
  );
  const indicatorColumns = headerRow.flatMap((header, columnIndex) => {
    const definition = definitionByHeader.get(normalizeHeader(header));
    return definition === undefined ? [] : [{ columnIndex, definition }];
  });

  if (indicatorColumns.length === 0) {
    throw new Error(
      "Google Sheets tab Лаборатория does not contain supported indicators.",
    );
  }

  const result: LaboratoryReferenceData = {
    indicators: indicatorColumns.map(({ columnIndex, definition }) => {
      const standard = (standardRow?.[columnIndex] ?? "")
        .trim()
        .replace(/\s+/gu, " ");
      return {
        id: definition.id,
        label: definition.label,
        ...(standard.length === 0 ? {} : { standard }),
      };
    }),
    incomingTestProfiles: [],
    finishedProductTypes: [],
  };
  const seenIncomingTestProfiles = new Set<string>();
  const seenFinishedProductTypes = new Set<string>();

  for (const row of rows.slice(headerRowIndex + 1)) {
    const section = normalizeHeader(row[0] ?? "");
    if (section !== "сырье" && section !== "готовая продукция") continue;

    const label = (row[1] ?? "").trim().replace(/\s+/gu, " ");
    const normalizedLabel = normalizeOption(label);
    const indicatorIds = indicatorColumns.flatMap(({ columnIndex, definition }) =>
      (row[columnIndex] ?? "").trim().length === 0 ? [] : [definition.id]
    );
    const seenLabels = section === "сырье"
      ? seenIncomingTestProfiles
      : seenFinishedProductTypes;

    if (
      label.length === 0 ||
      label.length > 120 ||
      seenLabels.has(normalizedLabel)
    ) {
      continue;
    }

    seenLabels.add(normalizedLabel);
    const profile = { label, indicatorIds };
    if (section === "сырье") {
      result.incomingTestProfiles.push(profile);
    } else {
      result.finishedProductTypes.push(profile);
    }
  }

  return result;
}

export function readBankVolumeReferenceFromRows(
  rows: string[][],
): BankVolumeReference {
  const headerRowIndex = rows.findIndex((row) => {
    const first = normalizeHeader(row[0] ?? "").replace(/\s/gu, "");
    const second = normalizeHeader(row[1] ?? "").replace(/\s/gu, "");
    return (first === "h·m" || first === "h*m" || first === "н·м") &&
      (second === "m3" || second === "м3" || second === "м³");
  });

  if (headerRowIndex < 0) {
    throw new Error("Google Sheets tab Банки must contain H·m and M3 headers.");
  }

  const points = rows.slice(headerRowIndex + 1).flatMap((row) => {
    const heightMeters = readLocalizedNumber(row[0]);
    const volumeCubicMeters = readLocalizedNumber(row[1]);
    return heightMeters === undefined || volumeCubicMeters === undefined
      ? []
      : [{ heightMeters, volumeCubicMeters }];
  });

  if (points.length < 2) {
    throw new Error("Google Sheets tab Банки must contain at least two values.");
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const previous = points[index - 1];
    if (
      point.heightMeters < 0 ||
      point.volumeCubicMeters < 0 ||
      (previous !== undefined && point.heightMeters <= previous.heightMeters)
    ) {
      throw new Error("Google Sheets tab Банки contains invalid values.");
    }
  }

  return { points };
}

function readLocalizedNumber(value: string | undefined) {
  const normalized = (value ?? "").trim().replace(/\s/gu, "").replace(",", ".");
  if (normalized.length === 0) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeProductionBrandLabel(value: string) {
  const label = value.trim().replace(/\s+/gu, " ");

  if (label.length === 0) {
    throw new Error("Введите название марки.");
  }
  if (label.length > 120) {
    throw new Error("Название марки должно быть не длиннее 120 символов.");
  }

  return label;
}

export function readNotificationRecipientsFromRows(
  rows: string[][],
  columnLabels: readonly string[],
  visitorColumnLabels: readonly string[] = [],
): NotificationRecipients {
  return {
    incidentAndEquipment: readEmailsFromColumnRows(
      rows,
      columnLabels,
      notificationRecipientRanges.incidentAndEquipment,
    ),
    mechanicalDowntime: readEmailsFromColumnRows(
      rows,
      columnLabels,
      notificationRecipientRanges.mechanicalDowntime,
    ),
    electricalDowntime: readEmailsFromColumnRows(
      rows,
      columnLabels,
      notificationRecipientRanges.electricalDowntime,
    ),
    visitors: readEmailsFromColumnRows(
      rows,
      visitorColumnLabels,
      notificationRecipientRanges.visitors,
    ),
  };
}

export function readMaxNotificationRecipientsFromRows(
  rows: string[][],
  columnLabels: readonly string[],
  visitorColumnLabels: readonly string[] = [],
): MaxNotificationRecipients {
  return {
    incidentAndEquipment: readMaxUserIdsFromColumnRows(
      rows,
      columnLabels,
      notificationRecipientRanges.incidentAndEquipment,
    ),
    mechanicalDowntime: readMaxUserIdsFromColumnRows(
      rows,
      columnLabels,
      notificationRecipientRanges.mechanicalDowntime,
    ),
    electricalDowntime: readMaxUserIdsFromColumnRows(
      rows,
      columnLabels,
      notificationRecipientRanges.electricalDowntime,
    ),
    visitors: readMaxUserIdsFromColumnRows(
      rows,
      visitorColumnLabels,
      notificationRecipientRanges.visitors,
    ),
  };
}

function readEmailsFromColumnRows(
  rows: string[][],
  columnLabels: readonly string[],
  ranges: readonly { startRow: number; endRow: number }[],
) {
  const normalizedColumnLabels = new Set(columnLabels.map(normalizeHeader));
  const columnIndexes = new Set<number>();

  for (const row of rows) {
    for (const [columnIndex, cell] of row.entries()) {
      if (normalizedColumnLabels.has(normalizeHeader(cell))) {
        columnIndexes.add(columnIndex);
      }
    }
  }

  const recipients: string[] = [];
  const seen = new Set<string>();

  for (const columnIndex of columnIndexes) {
    for (const range of ranges) {
      for (
        let rowNumber = range.startRow;
        rowNumber <= range.endRow;
        rowNumber += 1
      ) {
        const cell = rows[rowNumber - 1]?.[columnIndex] ?? "";

        for (const email of readEmailAddressesFromCell(cell)) {
          const normalizedEmail = email.toLocaleLowerCase("en-US");

          if (seen.has(normalizedEmail)) {
            continue;
          }

          seen.add(normalizedEmail);
          recipients.push(email);
        }
      }
    }
  }

  return recipients;
}

function readEmailAddressesFromCell(value: string) {
  return value.match(/[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/gu) ?? [];
}

function readMaxUserIdsFromColumnRows(
  rows: string[][],
  columnLabels: readonly string[],
  ranges: readonly { startRow: number; endRow: number }[],
) {
  const normalizedColumnLabels = new Set(columnLabels.map(normalizeHeader));
  const columnIndexes = new Set<number>();

  for (const row of rows) {
    for (const [columnIndex, cell] of row.entries()) {
      if (normalizedColumnLabels.has(normalizeHeader(cell))) {
        columnIndexes.add(columnIndex);
      }
    }
  }

  const recipients: string[] = [];
  const seen = new Set<string>();

  for (const columnIndex of columnIndexes) {
    for (const range of ranges) {
      for (
        let rowNumber = range.startRow;
        rowNumber <= range.endRow;
        rowNumber += 1
      ) {
        const cell = rows[rowNumber - 1]?.[columnIndex] ?? "";

        for (const userId of readMaxUserIdsFromCell(cell)) {
          if (seen.has(userId)) {
            continue;
          }

          seen.add(userId);
          recipients.push(userId);
        }
      }
    }
  }

  return recipients;
}

function readMaxUserIdsFromCell(value: string) {
  const groupSeparatedId = readGroupSeparatedMaxUserId(value);

  if (groupSeparatedId !== undefined) {
    return [groupSeparatedId];
  }

  return value
    .split(/[\s,;|]+/u)
    .map(normalizeMaxRecipientId)
    .filter((userId): userId is string => userId !== undefined);
}

/**
 * Числовой ID, введённый в Google Sheets как число, может прийти с разрядными
 * пробелами (`334 864 352`). Такую ячейку нужно читать как один ID, а не как
 * три обрывка; несколько ID в одной ячейке разделяются группами другой длины.
 */
function readGroupSeparatedMaxUserId(value: string) {
  const trimmed = value.trim();

  return /^\d{1,3}(?:\s\d{3})+$/u.test(trimmed)
    ? trimmed.replace(/\s+/gu, "")
    : undefined;
}

function normalizeMaxRecipientId(value: string) {
  const userId = value
    .trim()
    .replace(/^[<"'([{]+/u, "")
    .replace(/[>"')\]}.,:]+$/u, "");

  if (
    userId.length === 0 ||
    userId.length > maxRecipientIdLength ||
    !/\d/u.test(userId) ||
    !/^-?[a-zA-Z0-9_][a-zA-Z0-9_-]*$/u.test(userId)
  ) {
    return undefined;
  }

  return userId;
}

function normalizeGoogleValuesRows(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((row) => {
    if (!Array.isArray(row)) {
      return [];
    }

    return row.map((cell) => String(cell ?? ""));
  });
}

function quoteA1SheetName(sheetTitle: string) {
  return `'${sheetTitle.replaceAll("'", "''")}'`;
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let isQuoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const nextCharacter = csv[index + 1];

    if (isQuoted) {
      if (character === '"' && nextCharacter === '"') {
        cell += '"';
        index += 1;
        continue;
      }

      if (character === '"') {
        isQuoted = false;
        continue;
      }

      cell += character;
      continue;
    }

    if (character === '"') {
      isQuoted = true;
      continue;
    }

    if (character === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (character === "\r") {
      continue;
    }

    cell += character;
  }

  row.push(cell);
  rows.push(row);

  return rows;
}

function readSpreadsheetId(url: URL) {
  const match = /\/spreadsheets\/d\/([^/]+)/.exec(url.pathname);

  return match?.[1];
}

function readSheetGid(url: URL) {
  const searchGid = url.searchParams.get("gid");

  if (searchGid !== null && searchGid.length > 0) {
    return searchGid;
  }

  const hashMatch = /gid=([^&]+)/.exec(url.hash);

  return hashMatch?.[1] ?? "0";
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/:+$/u, "")
    .trim()
    .toLocaleLowerCase("ru-RU");
}

function normalizeOption(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}
