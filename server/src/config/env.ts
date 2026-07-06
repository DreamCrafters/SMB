import { config as loadDotenv } from "dotenv";

loadDotenv({
  path: new URL("../../.env", import.meta.url),
});

export type ServerConfig = {
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  runMigrationsOnStart: boolean;
  googleSheetsReference: GoogleSheetsReferenceConfig;
};

export type GoogleSheetsReferenceConfig = {
  url: string;
  responsibleColumn: string;
  cacheTtlMs: number;
  authMode: GoogleSheetsAuthMode;
  serviceAccountKeyFile?: string;
};

export type GoogleSheetsAuthMode = "public_csv" | "service_account";

const defaultGoogleSheetsReferenceUrl =
  "https://docs.google.com/spreadsheets/d/1JYz_03AW4j9VXNfdNSBFfdFyxq0Dun_0QnYGvVesGyg/edit?gid=981703922#gid=981703922";
const defaultResponsibleColumn = "Ответственный за регистрацию";
const defaultGoogleSheetsCacheTtlMs = 0;

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const databaseUrl = readRequired(env, "DATABASE_URL");

  return {
    port: readPort(env.PORT),
    databaseUrl,
    corsOrigins: readList(env.CORS_ORIGIN),
    runMigrationsOnStart: env.RUN_MIGRATIONS_ON_START === "true",
    googleSheetsReference: {
      url:
        readOptional(env.GOOGLE_SHEETS_REFERENCE_URL) ??
        defaultGoogleSheetsReferenceUrl,
      responsibleColumn:
        readOptional(env.GOOGLE_SHEETS_RESPONSIBLE_COLUMN) ??
        defaultResponsibleColumn,
      cacheTtlMs: readNonNegativeInteger(
        env.GOOGLE_SHEETS_CACHE_TTL_MS,
        defaultGoogleSheetsCacheTtlMs,
      ),
      authMode: readGoogleSheetsAuthMode(env.GOOGLE_SHEETS_AUTH),
      serviceAccountKeyFile: readOptional(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE),
    },
  };
}

function readRequired(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required env variable: ${key}`);
  }

  return value;
}

function readOptional(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function readPort(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return 3000;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return parsed;
}

function readNonNegativeInteger(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      "GOOGLE_SHEETS_CACHE_TTL_MS must be a non-negative integer.",
    );
  }

  return parsed;
}

function readGoogleSheetsAuthMode(value: string | undefined): GoogleSheetsAuthMode {
  const authMode = readOptional(value) ?? "public_csv";

  if (authMode === "public_csv" || authMode === "service_account") {
    return authMode;
  }

  throw new Error("GOOGLE_SHEETS_AUTH must be public_csv or service_account.");
}

function readList(value: string | undefined) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0) ?? []
  );
}
