import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { GoogleSheetsReferenceConfig } from "../config/env.js";

export type DispatcherReferenceData = {
  incidentResponsibleOptions: string[];
};

export type DispatcherReferenceDataSource = {
  read: () => Promise<DispatcherReferenceData>;
};

type FetchLike = typeof fetch;
type ReadTextFile = (path: string) => Promise<string>;

type GoogleSheetsReferenceDependencies = {
  readTextFile?: ReadTextFile;
  now?: () => number;
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
  incidentResponsibleOptions: [],
};
const googleSheetsReadonlyScope =
  "https://www.googleapis.com/auth/spreadsheets.readonly";
const defaultGoogleTokenUri = "https://oauth2.googleapis.com/token";

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
          incidentResponsibleOptions: readColumnOptionsFromRows(
            rows,
            config.responsibleColumn,
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
) {
  const tokenUri = credentials.token_uri ?? defaultGoogleTokenUri;
  const issuedAt = Math.floor(now() / 1000);
  const assertion = createServiceAccountJwt(credentials, tokenUri, issuedAt);
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
) {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const claimSet = {
    iss: credentials.client_email,
    scope: googleSheetsReadonlyScope,
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
) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google Sheets API responded with ${response.status}.`);
  }

  return (await response.json()) as T;
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
