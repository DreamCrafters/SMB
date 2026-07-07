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
  emailNotifications: EmailNotificationConfig;
  maxNotifications: MaxNotificationConfig;
};

export type GoogleSheetsReferenceConfig = {
  url: string;
  responsibleColumn: string;
  locationColumn: string;
  notificationEmailColumns: readonly string[];
  maxUserIdColumns: readonly string[];
  visitorNotificationEmailColumns: readonly string[];
  visitorMaxUserIdColumns: readonly string[];
  cacheTtlMs: number;
  authMode: GoogleSheetsAuthMode;
  serviceAccountKeyFile?: string;
};

export type GoogleSheetsAuthMode = "public_csv" | "service_account";

export type EmailNotificationConfig = {
  enabled: boolean;
  from: string;
  subjectPrefix: string;
  smtpHost?: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPass?: string;
};

export type MaxNotificationConfig = {
  enabled: boolean;
  botToken?: string;
  apiBaseUrl: string;
  recipientIdType: "user_id" | "chat_id";
  subjectPrefix: string;
  caCertFile?: string;
};

const defaultGoogleSheetsReferenceUrl =
  "https://docs.google.com/spreadsheets/d/1JYz_03AW4j9VXNfdNSBFfdFyxq0Dun_0QnYGvVesGyg/edit?gid=981703922#gid=981703922";
const defaultResponsibleColumn = "Ответственный за регистрацию";
const defaultLocationColumn = "Места (цех/участок)";
const defaultNotificationEmailColumns = [
  "Адресаты по инцидентам и оборуджованию (емейлы)",
  "Адресаты по инцидентам и оборудованию (емейлы)",
] as const;
const defaultMaxUserIdColumns = [
  "Чаты пользователей",
  "ТОКЕН МАКС и Чаты пользователей",
  "Адресаты по инцидентам и оборуджованию (MAX ID)",
  "Адресаты по инцидентам и оборудованию (MAX ID)",
] as const;
const defaultVisitorNotificationEmailColumns = [
  "Адресаты по посетителям (емейлы)",
] as const;
const defaultVisitorMaxUserIdColumns = [
  "Адресаты по посетителям (МАКС)",
] as const;
const defaultGoogleSheetsCacheTtlMs = 0;
const defaultEmailSubjectPrefix = "SMB Monitor";
const defaultMaxApiBaseUrl = "https://platform-api2.max.ru";
const defaultMaxSubjectPrefix = "SMB Monitor";

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
      locationColumn:
        readOptional(env.GOOGLE_SHEETS_INCIDENT_LOCATION_COLUMN) ??
        defaultLocationColumn,
      notificationEmailColumns:
        readList(env.GOOGLE_SHEETS_NOTIFICATION_EMAILS_COLUMN).length > 0
          ? readList(env.GOOGLE_SHEETS_NOTIFICATION_EMAILS_COLUMN)
          : defaultNotificationEmailColumns,
      maxUserIdColumns:
        readList(env.GOOGLE_SHEETS_MAX_USER_IDS_COLUMN).length > 0
          ? readList(env.GOOGLE_SHEETS_MAX_USER_IDS_COLUMN)
          : defaultMaxUserIdColumns,
      visitorNotificationEmailColumns:
        readList(env.GOOGLE_SHEETS_VISITOR_NOTIFICATION_EMAILS_COLUMN).length > 0
          ? readList(env.GOOGLE_SHEETS_VISITOR_NOTIFICATION_EMAILS_COLUMN)
          : defaultVisitorNotificationEmailColumns,
      visitorMaxUserIdColumns:
        readList(env.GOOGLE_SHEETS_VISITOR_MAX_USER_IDS_COLUMN).length > 0
          ? readList(env.GOOGLE_SHEETS_VISITOR_MAX_USER_IDS_COLUMN)
          : defaultVisitorMaxUserIdColumns,
      cacheTtlMs: readNonNegativeInteger(
        env.GOOGLE_SHEETS_CACHE_TTL_MS,
        defaultGoogleSheetsCacheTtlMs,
      ),
      authMode: readGoogleSheetsAuthMode(env.GOOGLE_SHEETS_AUTH),
      serviceAccountKeyFile: readOptional(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE),
    },
    emailNotifications: readEmailNotificationConfig(env),
    maxNotifications: readMaxNotificationConfig(env),
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

  return readPortNumber(value, "PORT");
}

function readSmtpPort(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return 587;
  }

  return readPortNumber(value, "SMTP_PORT");
}

function readPortNumber(value: string, key: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${key} must be an integer between 1 and 65535.`);
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

function readEmailNotificationConfig(env: NodeJS.ProcessEnv): EmailNotificationConfig {
  const enabled = env.EMAIL_NOTIFICATIONS_ENABLED === "true";
  const from = readOptional(env.EMAIL_FROM);
  const smtpHost = readOptional(env.SMTP_HOST);
  const smtpUser = readOptional(env.SMTP_USER);
  const smtpPass = readOptional(env.SMTP_PASS);

  if (enabled && from === undefined) {
    throw new Error("EMAIL_FROM is required when EMAIL_NOTIFICATIONS_ENABLED=true.");
  }

  if (enabled && smtpHost === undefined) {
    throw new Error("SMTP_HOST is required when EMAIL_NOTIFICATIONS_ENABLED=true.");
  }

  if (
    enabled &&
    ((smtpUser === undefined && smtpPass !== undefined) ||
      (smtpUser !== undefined && smtpPass === undefined))
  ) {
    throw new Error("SMTP_USER and SMTP_PASS must be set together.");
  }

  return {
    enabled,
    from: from ?? "",
    subjectPrefix:
      readOptional(env.EMAIL_SUBJECT_PREFIX) ?? defaultEmailSubjectPrefix,
    smtpHost,
    smtpPort: readSmtpPort(env.SMTP_PORT),
    smtpSecure: env.SMTP_SECURE === "true",
    smtpUser,
    smtpPass,
  };
}

function readMaxNotificationConfig(env: NodeJS.ProcessEnv): MaxNotificationConfig {
  const enabled = env.MAX_NOTIFICATIONS_ENABLED === "true";
  const botToken = readOptional(env.MAX_BOT_TOKEN);

  if (enabled && botToken === undefined) {
    throw new Error("MAX_BOT_TOKEN is required when MAX_NOTIFICATIONS_ENABLED=true.");
  }

  return {
    enabled,
    botToken,
    apiBaseUrl: readUrl(
      readOptional(env.MAX_API_BASE_URL) ?? defaultMaxApiBaseUrl,
      "MAX_API_BASE_URL",
    ),
    recipientIdType: readMaxRecipientIdType(env.MAX_RECIPIENT_ID_TYPE),
    subjectPrefix:
      readOptional(env.MAX_SUBJECT_PREFIX) ?? defaultMaxSubjectPrefix,
    caCertFile: readOptional(env.MAX_CA_CERT_FILE),
  };
}

function readMaxRecipientIdType(value: string | undefined) {
  const recipientIdType = readOptional(value) ?? "user_id";

  if (recipientIdType === "user_id" || recipientIdType === "chat_id") {
    return recipientIdType;
  }

  throw new Error("MAX_RECIPIENT_ID_TYPE must be user_id or chat_id.");
}

function readUrl(value: string, key: string) {
  try {
    return new URL(value).toString().replace(/\/$/u, "");
  } catch {
    throw new Error(`${key} must be a valid URL.`);
  }
}

function readList(value: string | undefined) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0) ?? []
  );
}
