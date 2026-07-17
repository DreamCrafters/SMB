import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { DispatcherSpreadsheetImportRecord } from "../domain/dispatcherSpreadsheetImport.js";
import { buildDispatcherSubmissionDedupeKey } from "../domain/dispatcherSubmission.js";
import type { DatabasePool } from "../db/pool.js";

export type DispatcherSpreadsheetImportRepository = {
  findExistingSourceKeys: (
    records: readonly DispatcherSpreadsheetImportRecord[],
  ) => Promise<Set<string>>;
  importRecords: (value: {
    submittedByAccountId: string;
    records: readonly DispatcherSpreadsheetImportRecord[];
  }) => Promise<{ inserted: number; skipped: number }>;
};

type ExistingImportRow = RowDataPacket & {
  import_source_key: string | null;
  dedupe_key: string | null;
};

type ExistingNaturalRow = RowDataPacket & {
  form_id: string;
  payload: unknown;
};

type QueryExecutor = Pick<DatabasePool, "query">;

const queryChunkSize = 200;
const insertChunkSize = 100;

export function createDispatcherSpreadsheetImportRepository(
  pool: DatabasePool,
): DispatcherSpreadsheetImportRepository {
  return {
    async findExistingSourceKeys(records) {
      return readExistingSourceKeys(pool, records);
    },

    async importRecords({
      submittedByAccountId,
      records,
    }) {
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();
        const existing = await readExistingSourceKeys(
          connection,
          records,
        );
        const newRecords = records.filter(
          (record) => !existing.has(record.sourceKey),
        );
        let inserted = 0;

        for (const chunk of chunkValues(newRecords, insertChunkSize)) {
          const rowPlaceholders = chunk
            .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?)")
            .join(", ");
          const values = chunk.flatMap((record) => [
            record.id,
            record.period,
            record.formId,
            record.rawValue,
            record.comment,
            record.formId,
            JSON.stringify(record.payload),
            record.summary,
            buildImportDedupeKey(record),
            record.sourceKey,
            submittedByAccountId,
            record.occurredAt,
            record.occurredAt,
          ]);
          const [result] = await connection.query<ResultSetHeader>(
            `
              insert ignore into dispatcher_submissions (
                id,
                period,
                metric_code,
                raw_value,
                comment,
                form_id,
                payload,
                summary,
                dedupe_key,
                import_source_key,
                status,
                submitted_by_account_id,
                submitted_at,
                received_at
              ) values ${rowPlaceholders}
            `,
            values,
          );

          inserted += result.affectedRows;
        }

        await connection.commit();

        return {
          inserted,
          skipped: records.length - inserted,
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}

async function readExistingSourceKeys(
  executor: QueryExecutor,
  records: readonly DispatcherSpreadsheetImportRecord[],
) {
  const existing = new Set<string>();

  for (const chunk of chunkValues(records, queryChunkSize)) {
    const sourceKeys = chunk.map((record) => record.sourceKey);
    const dedupeKeys = chunk
      .map(buildImportDedupeKey)
      .filter((value): value is string => value !== null);
    const clauses = [
      `import_source_key in (${sourceKeys.map(() => "?").join(", ")})`,
    ];
    const values: string[] = [...sourceKeys];

    if (dedupeKeys.length > 0) {
      clauses.push(`dedupe_key in (${dedupeKeys.map(() => "?").join(", ")})`);
      values.push(...dedupeKeys);
    }

    const [rows] = await executor.query<ExistingImportRow[]>(
      `
        select import_source_key, dedupe_key
        from dispatcher_submissions
        where ${clauses.join(" or ")}
      `,
      values,
    );
    const existingSourceKeys = new Set(
      rows
        .map((row) => row.import_source_key)
        .filter((value): value is string => value !== null),
    );
    const existingDedupeKeys = new Set(
      rows
        .map((row) => row.dedupe_key)
        .filter((value): value is string => value !== null),
    );

    for (const record of chunk) {
      const dedupeKey = buildImportDedupeKey(record);

      if (
        existingSourceKeys.has(record.sourceKey) ||
        (dedupeKey !== null && existingDedupeKeys.has(dedupeKey))
      ) {
        existing.add(record.sourceKey);
      }
    }
  }

  const naturalKeyByRecord = new Map(
    records
      .map((record) => [record, buildNaturalKey(record)] as const)
      .filter((entry): entry is readonly [DispatcherSpreadsheetImportRecord, string] =>
        entry[1] !== undefined,
      ),
  );

  if (naturalKeyByRecord.size === 0) {
    return existing;
  }

  const [naturalRows] = await executor.query<ExistingNaturalRow[]>(
    `
      select form_id, payload
      from dispatcher_submissions
      where form_id in ('incident', 'incident_close', 'visitor', 'visitor_exit')
    `,
  );
  const existingNaturalKeys = new Set(
    naturalRows
      .map((row) => buildNaturalKeyFromStoredRow(row))
      .filter((value): value is string => value !== undefined),
  );

  for (const [record, naturalKey] of naturalKeyByRecord) {
    const relatedVisitorEntryKey =
      record.formId === "visitor_exit"
        ? buildVisitorNaturalKey(
            "visitor",
            record.payload.entryAt,
            record.payload.fio,
            record.payload.organization,
          )
        : undefined;

    if (
      existingNaturalKeys.has(naturalKey) ||
      (relatedVisitorEntryKey !== undefined &&
        existingNaturalKeys.has(relatedVisitorEntryKey))
    ) {
      existing.add(record.sourceKey);
    }
  }

  return existing;
}

function buildImportDedupeKey(
  record: DispatcherSpreadsheetImportRecord,
) {
  return buildDispatcherSubmissionDedupeKey({
    formId: record.formId,
    payload: record.payload,
  });
}

function buildNaturalKey(record: DispatcherSpreadsheetImportRecord) {
  return buildNaturalKeyFromPayload(record.formId, record.payload);
}

function buildNaturalKeyFromStoredRow(row: ExistingNaturalRow) {
  const payload = readStoredPayload(row.payload);

  return payload === undefined
    ? undefined
    : buildNaturalKeyFromPayload(row.form_id, payload);
}

function buildNaturalKeyFromPayload(
  formId: string,
  payload: Record<string, unknown>,
) {
  if (formId === "incident" || formId === "incident_close") {
    const incidentNumber = readPayloadString(payload.incidentNumber);

    return incidentNumber === undefined
      ? undefined
      : `${formId}:${normalizeKeyPart(incidentNumber)}`;
  }

  if (formId === "visitor") {
    return buildVisitorNaturalKey(
      formId,
      payload.entryAt,
      payload.fio,
      payload.organization,
    );
  }

  if (formId === "visitor_exit") {
    return buildVisitorNaturalKey(
      formId,
      payload.exitAt,
      payload.fio,
      payload.organization,
    );
  }

  return undefined;
}

function buildVisitorNaturalKey(
  formId: string,
  timestampValue: unknown,
  fioValue: unknown,
  organizationValue: unknown,
) {
  const timestamp = readPayloadString(timestampValue);
  const fio = readPayloadString(fioValue);

  if (timestamp === undefined || fio === undefined) {
    return undefined;
  }

  return [
    formId,
    normalizeKeyPart(timestamp),
    normalizeKeyPart(fio),
    normalizeKeyPart(readPayloadString(organizationValue) ?? ""),
  ].join(":");
}

function readStoredPayload(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      return readStoredPayload(JSON.parse(value) as unknown);
    } catch {
      return undefined;
    }
  }

  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readPayloadString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizeKeyPart(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}

function chunkValues<T>(values: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}
