import { config as loadDotenv } from "dotenv";

loadDotenv({
  path: new URL("../../.env", import.meta.url),
});

export type ServerConfig = {
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  runMigrationsOnStart: boolean;
};

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const databaseUrl = readRequired(env, "DATABASE_URL");

  return {
    port: readPort(env.PORT),
    databaseUrl,
    corsOrigins: readList(env.CORS_ORIGIN),
    runMigrationsOnStart: env.RUN_MIGRATIONS_ON_START === "true",
  };
}

function readRequired(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required env variable: ${key}`);
  }

  return value;
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

function readList(value: string | undefined) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0) ?? []
  );
}
