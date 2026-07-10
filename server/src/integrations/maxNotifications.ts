import { readFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import type { MaxNotificationConfig } from "../config/env.js";
import type { DispatcherSubmission } from "../domain/dispatcherSubmission.js";
import {
  buildEquipmentReportNotificationText,
  buildDispatcherNotificationText,
  readEquipmentReportNotificationRecipients,
  readDispatcherNotificationRecipients,
  type EquipmentReportNotificationStatus,
} from "./dispatcherNotifications.js";
import type { MaxNotificationRecipients } from "./googleSheetsReference.js";

export type MaxNotificationService = {
  sendDispatcherSubmissionNotification: (
    submission: DispatcherSubmission,
    recipients: MaxNotificationRecipients,
  ) => Promise<void>;
  sendEquipmentReportNotification: (
    submissions: readonly DispatcherSubmission[],
    recipients: MaxNotificationRecipients,
    status: EquipmentReportNotificationStatus,
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
};

const maxMessageLength = 4000;

export function createMaxNotificationService(
  config: MaxNotificationConfig,
  dependencies: MaxNotificationDependencies = {},
): MaxNotificationService {
  if (!config.enabled) {
    return {
      async sendDispatcherSubmissionNotification() {
        // MAX notifications are intentionally disabled by env.
      },
      async sendEquipmentReportNotification() {
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
    dependencies.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const caCertificatePromise =
    config.caCertFile === undefined
      ? Promise.resolve(undefined)
      : readTextFile(config.caCertFile);

  return {
    async sendDispatcherSubmissionNotification(submission, recipients) {
      const userIds = readDispatcherNotificationRecipients(
        submission,
        recipients,
      );

      if (userIds.length === 0) {
        if (isMaxNotifiableSubmission(submission)) {
          console.warn("dispatcher_notifications.max_no_recipients", {
            formId: submission.formId,
          });
        }

        return;
      }

      const text = trimMaxMessageText(
        withMaxSubjectPrefix(config.subjectPrefix, buildDispatcherNotificationText(submission)),
      );
      const caCertificate = await caCertificatePromise;

      await Promise.all(
        userIds.map((userId) =>
          sendMaxMessage(httpClient, config, userId, text, caCertificate),
        ),
      );
      console.info("dispatcher_notifications.max_sent", {
        formId: submission.formId,
        recipientIdType: config.recipientIdType,
        recipientCount: userIds.length,
      });
    },
    async sendEquipmentReportNotification(submissions, recipients, status) {
      if (submissions.length === 0) {
        return;
      }

      const userIds = readEquipmentReportNotificationRecipients(
        submissions,
        recipients,
      );

      if (userIds.length === 0) {
        console.warn("dispatcher_notifications.max_no_recipients", {
          formId: "equipment",
        });
        return;
      }

      const text = trimMaxMessageText(
        withMaxSubjectPrefix(
          config.subjectPrefix,
          buildEquipmentReportNotificationText(submissions, status),
        ),
      );
      const caCertificate = await caCertificatePromise;

      await Promise.all(
        userIds.map((userId) =>
          sendMaxMessage(httpClient, config, userId, text, caCertificate),
        ),
      );
      console.info("dispatcher_notifications.max_sent", {
        formId: "equipment",
        recipientIdType: config.recipientIdType,
        recipientCount: userIds.length,
      });
    },
  };
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
    throw new Error(
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

function trimMaxMessageText(value: string) {
  if (value.length <= maxMessageLength) {
    return value;
  }

  return `${value.slice(0, maxMessageLength - 3)}...`;
}

async function readMaxErrorBody(response: MaxHttpResponse) {
  const body = await response.text();
  const trimmed = body.trim().replace(/\s+/g, " ");

  if (trimmed.length === 0) {
    return "empty response body";
  }

  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;
}
