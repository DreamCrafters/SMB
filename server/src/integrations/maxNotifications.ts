import { readFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import type { MaxNotificationConfig, SmbAppEnv } from "../config/env.js";
import type { DispatcherSubmission } from "../domain/dispatcherSubmission.js";
import type { RefractoryReportNotification } from "../domain/refractoryReport.js";
import {
  buildEquipmentReportNotificationText,
  buildDispatcherNotificationText,
  appendNotificationEnvironmentNote,
  readEquipmentReportNotificationRecipients,
  readDispatcherNotificationRecipients,
  type DispatcherNotificationBankContent,
  type EquipmentReportNotificationStatus,
  testNotificationNote,
} from "./dispatcherNotifications.js";
import type { MaxNotificationRecipients } from "./googleSheetsReference.js";
import {
  buildRefractoryNotificationText,
  buildRefractoryReviewRequestText,
  dedupeRefractoryMaxRecipients,
  type RefractoryNotificationKind,
} from "./refractoryNotifications.js";

export type MaxNotificationService = {
  sendTextNotification?: (
    recipients: readonly string[],
    text: string,
  ) => Promise<void>;
  sendDispatcherSubmissionNotification: (
    submission: DispatcherSubmission,
    recipients: MaxNotificationRecipients,
    bankContents?: readonly DispatcherNotificationBankContent[],
  ) => Promise<void>;
  sendEquipmentReportNotification: (
    submissions: readonly DispatcherSubmission[],
    recipients: MaxNotificationRecipients,
    status: EquipmentReportNotificationStatus,
  ) => Promise<void>;
  sendRefractoryReportNotification: (
    report: RefractoryReportNotification,
    recipients: readonly string[],
    notificationKind: RefractoryNotificationKind,
  ) => Promise<void>;
};

type MaxHttpRequest = {
  headers: Record<string, string>;
  body: string;
  ca?: string;
};

type MaxHttpResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

type MaxHttpClient = (
  url: URL,
  request: MaxHttpRequest,
) => Promise<MaxHttpResponse>;

export type MaxNotificationDependencies = {
  fetchImpl?: typeof fetch;
  httpClient?: MaxHttpClient;
  readTextFile?: (path: string) => Promise<string>;
  sleep?: (milliseconds: number) => Promise<void>;
};

const maxMessageLength = 4000;
const maxSendAttempts = 3;
const maxRetryDelayMs = 1000;

export function createMaxNotificationService(
  config: MaxNotificationConfig,
  dependencies: MaxNotificationDependencies = {},
  appEnv: SmbAppEnv = "production",
): MaxNotificationService {
  if (!config.enabled) {
    return {
      async sendTextNotification() {
        // MAX notifications are intentionally disabled by env.
      },
      async sendDispatcherSubmissionNotification() {
        // MAX notifications are intentionally disabled by env.
      },
      async sendEquipmentReportNotification() {
        // MAX notifications are intentionally disabled by env.
      },
      async sendRefractoryReportNotification() {
        // MAX notifications are intentionally disabled by env.
      },
    };
  }

  const httpClient =
    dependencies.httpClient ??
    (config.caCertFile !== undefined
      ? sendMaxHttpsRequest
      : createMaxFetchClient(dependencies.fetchImpl ?? fetch));
  const readTextFile =
    dependencies.readTextFile ?? ((path: string) => readFile(path, "utf8"));
  const sleep = dependencies.sleep ?? defaultSleep;
  const caCertificatePromise =
    config.caCertFile === undefined
      ? Promise.resolve(undefined)
      : readTextFile(config.caCertFile);

  return {
    async sendTextNotification(recipients, text) {
      const logContext = { notificationType: "account_notification" };
      const userIds = readMaxDeliveryTargets(
        Array.from(new Set(
          recipients.map((recipient) => recipient.trim()).filter(Boolean),
        )),
        config,
        "account_notifications",
        logContext,
      );

      if (userIds.length === 0) {
        return;
      }

      const caCertificate = await caCertificatePromise;
      await deliverMaxMessages(
        httpClient,
        config,
        userIds,
        buildMaxMessageTexts(
          withMaxSubjectPrefix(config.subjectPrefix, text),
          appEnv,
        ),
        caCertificate,
        sleep,
        "account_notifications",
        logContext,
      );
    },
    async sendDispatcherSubmissionNotification(
      submission,
      recipients,
      bankContents,
    ) {
      const logContext = { formId: submission.formId };
      const userIds = readMaxDeliveryTargets(
        readDispatcherNotificationRecipients(submission, recipients),
        config,
        "dispatcher_notifications",
        logContext,
      );

      if (userIds.length === 0) {
        if (isMaxNotifiableSubmission(submission)) {
          console.warn("dispatcher_notifications.max_no_recipients", logContext);
        }

        return;
      }

      const text = buildMaxMessageText(
        withMaxSubjectPrefix(
          config.subjectPrefix,
          buildDispatcherNotificationText(submission, bankContents),
        ),
        appEnv,
      );
      const caCertificate = await caCertificatePromise;

      await deliverMaxMessages(
        httpClient,
        config,
        userIds,
        [text],
        caCertificate,
        sleep,
        "dispatcher_notifications",
        logContext,
      );
    },
    async sendEquipmentReportNotification(submissions, recipients, status) {
      if (submissions.length === 0) {
        return;
      }

      const logContext = { formId: "equipment" };
      const userIds = readMaxDeliveryTargets(
        readEquipmentReportNotificationRecipients(submissions, recipients),
        config,
        "dispatcher_notifications",
        logContext,
      );

      if (userIds.length === 0) {
        console.warn("dispatcher_notifications.max_no_recipients", logContext);
        return;
      }

      const text = buildMaxMessageText(
        withMaxSubjectPrefix(
          config.subjectPrefix,
          buildEquipmentReportNotificationText(submissions, status),
        ),
        appEnv,
      );
      const caCertificate = await caCertificatePromise;

      await deliverMaxMessages(
        httpClient,
        config,
        userIds,
        [text],
        caCertificate,
        sleep,
        "dispatcher_notifications",
        logContext,
      );
    },
    async sendRefractoryReportNotification(
      report,
      recipients,
      notificationKind,
    ) {
      const logPrefix = notificationKind === "approved"
        ? "refractory_notifications"
        : "refractory_review_notifications";
      const logContext = { reportType: report.reportType };
      const userIds = readMaxDeliveryTargets(
        dedupeRefractoryMaxRecipients(recipients),
        config,
        logPrefix,
        logContext,
      );

      if (userIds.length === 0) {
        console.warn(`${logPrefix}.max_no_recipients`, logContext);
        return;
      }

      const texts = notificationKind === "approved"
        ? buildMaxMessageTexts(
            withMaxSubjectPrefix(
              config.subjectPrefix,
              buildRefractoryNotificationText(report),
            ),
            appEnv,
          )
        : [
            buildMaxMessageText(
              withMaxSubjectPrefix(
                config.subjectPrefix,
                buildRefractoryReviewRequestText(report),
              ),
              appEnv,
            ),
          ];
      const caCertificate = await caCertificatePromise;

      await deliverMaxMessages(
        httpClient,
        config,
        userIds,
        texts,
        caCertificate,
        sleep,
        logPrefix,
        logContext,
      );
    },
  };
}

/**
 * Каждый адресат получает сообщение отдельно и по очереди: групповая
 * параллельная отправка теряла последние ID списка, а один недоступный
 * адресат обрывал общий результат и скрывал остальные ошибки.
 */
async function deliverMaxMessages(
  httpClient: MaxHttpClient,
  config: MaxNotificationConfig,
  userIds: readonly string[],
  texts: readonly string[],
  caCertificate: string | undefined,
  sleep: (milliseconds: number) => Promise<void>,
  logPrefix: string,
  logContext: Record<string, string>,
) {
  const failures: unknown[] = [];
  let deliveredCount = 0;

  for (const userId of userIds) {
    try {
      for (const text of texts) {
        await sendMaxMessageWithRetry(
          httpClient,
          config,
          userId,
          text,
          caCertificate,
          sleep,
        );
      }

      deliveredCount += 1;
    } catch (error) {
      const safeError = buildSafeMaxDeliveryError(error);
      failures.push(safeError);
      console.warn(`${logPrefix}.max_recipient_failed`, {
        ...logContext,
        recipientIdType: config.recipientIdType,
        error: safeError.message,
      });
    }
  }

  console.info(`${logPrefix}.max_sent`, {
    ...logContext,
    recipientIdType: config.recipientIdType,
    recipientCount: userIds.length,
    deliveredCount,
    messageCount: texts.length,
  });

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `MAX delivery failed for ${failures.length} of ${
        userIds.length
      } recipients.`,
    );
  }
}

/**
 * Токен бота лежит в той же колонке таблицы, что и ID адресатов, поэтому его
 * нужно отбросить: иначе каждое уведомление уходило ещё и на несуществующего
 * адресата и всегда завершалось ошибкой.
 */
function readMaxDeliveryTargets(
  userIds: readonly string[],
  config: MaxNotificationConfig,
  logPrefix: string,
  logContext: Record<string, string>,
) {
  const botToken = config.botToken?.trim() ?? "";
  const targets = userIds.filter(
    (userId) => botToken.length === 0 || userId !== botToken,
  );

  if (targets.length !== userIds.length) {
    console.warn(`${logPrefix}.max_bot_token_recipient_skipped`, logContext);
  }

  return targets;
}

async function sendMaxMessageWithRetry(
  httpClient: MaxHttpClient,
  config: MaxNotificationConfig,
  userId: string,
  text: string,
  caCertificate: string | undefined,
  sleep: (milliseconds: number) => Promise<void>,
) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await sendMaxMessage(httpClient, config, userId, text, caCertificate);
      return;
    } catch (error) {
      if (attempt >= maxSendAttempts || !isRetryableMaxError(error)) {
        throw error;
      }

      await sleep(maxRetryDelayMs * attempt);
    }
  }
}

function isRetryableMaxError(error: unknown) {
  if (error instanceof MaxResponseError) {
    return error.status === 429 || error.status >= 500;
  }

  return true;
}

function buildSafeMaxDeliveryError(error: unknown) {
  if (error instanceof MaxResponseError) {
    return new Error(`MAX responded with status ${error.status}.`);
  }

  return new Error(
    error instanceof Error
      ? `MAX delivery failed with ${error.name}.`
      : "MAX delivery failed.",
  );
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

class MaxResponseError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "MaxResponseError";
    this.status = status;
  }
}

async function sendMaxMessage(
  httpClient: MaxHttpClient,
  config: MaxNotificationConfig,
  userId: string,
  text: string,
  caCertificate: string | undefined,
) {
  const url = new URL("/messages", config.apiBaseUrl);
  const body = JSON.stringify({
    text,
    notify: true,
  });

  url.searchParams.set(config.recipientIdType, userId);

  const response = await httpClient(url, {
    headers: {
      Accept: "application/json",
      Authorization: config.botToken ?? "",
      "Content-Type": "application/json",
    },
    body,
    ca: caCertificate,
  });

  if (!response.ok) {
    throw new MaxResponseError(
      response.status,
      `MAX responded with ${response.status}: ${await readMaxErrorBody(
        response,
      )}`,
    );
  }
}

function createMaxFetchClient(fetchImpl: typeof fetch): MaxHttpClient {
  return async (url, request) => {
    const response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });

    return {
      ok: response.ok,
      status: response.status,
      text: () => response.text(),
    };
  };
}

function sendMaxHttpsRequest(
  url: URL,
  request: MaxHttpRequest,
): Promise<MaxHttpResponse> {
  return new Promise((resolve, reject) => {
    const outboundRequest = httpsRequest(
      url,
      {
        method: "POST",
        headers: request.headers,
        ca: request.ca,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          const body = Buffer.concat(chunks).toString("utf8");

          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: async () => body,
          });
        });
      },
    );

    outboundRequest.on("error", reject);
    outboundRequest.end(request.body);
  });
}

function isMaxNotifiableSubmission(submission: DispatcherSubmission) {
  return (
    submission.formId === "equipment" ||
    submission.formId === "incident" ||
    submission.formId === "incident_close" ||
    submission.formId === "visitor" ||
    submission.formId === "visitor_exit"
  );
}

function withMaxSubjectPrefix(subjectPrefix: string, text: string) {
  return subjectPrefix.length > 0 ? `[${subjectPrefix}] ${text}` : text;
}

function buildMaxMessageText(value: string, appEnv: SmbAppEnv) {
  const noteLength = appEnv === "test" ? testNotificationNote.length + 2 : 0;
  const text = trimMaxMessageText(value, maxMessageLength - noteLength);

  return appendNotificationEnvironmentNote(text, appEnv);
}

function buildMaxMessageTexts(value: string, appEnv: SmbAppEnv) {
  const noteLength = appEnv === "test" ? testNotificationNote.length + 2 : 0;
  const singleMessageLimit = maxMessageLength - noteLength;

  if (value.length <= singleMessageLimit) {
    return [appendNotificationEnvironmentNote(value, appEnv)];
  }

  const chunks = splitNotificationText(value, singleMessageLimit - 32);

  return chunks.map((chunk, index) =>
    appendNotificationEnvironmentNote(
      `Часть ${index + 1} из ${chunks.length}\n${chunk}`,
      appEnv,
    ),
  );
}

function splitNotificationText(value: string, maxLength: number) {
  const chunks: string[] = [];
  let remaining = value;

  while (remaining.length > maxLength) {
    const newlineIndex = remaining.lastIndexOf("\n", maxLength);
    const splitIndex = newlineIndex > 0 ? newlineIndex : maxLength;

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex + (newlineIndex > 0 ? 1 : 0));
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function trimMaxMessageText(value: string, maxLength = maxMessageLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

async function readMaxErrorBody(response: MaxHttpResponse) {
  const body = await response.text();
  const trimmed = body.trim().replace(/\s+/g, " ");

  if (trimmed.length === 0) {
    return "empty response body";
  }

  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;
}
