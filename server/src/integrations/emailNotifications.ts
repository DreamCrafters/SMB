import nodemailer from "nodemailer";
import type { EmailNotificationConfig } from "../config/env.js";
import {
  getDispatcherFormDefinition,
  type DispatcherFormField,
} from "../domain/dispatcherForms.js";
import type { DispatcherSubmission } from "../domain/dispatcherSubmission.js";
import type { NotificationRecipients } from "./googleSheetsReference.js";

export type EmailMessage = {
  from: string;
  to: string[];
  subject: string;
  text: string;
};

export type EmailNotificationService = {
  sendDispatcherSubmissionNotification: (
    submission: DispatcherSubmission,
    recipients: NotificationRecipients,
  ) => Promise<void>;
};

export type EmailNotificationDependencies = {
  sendMail?: (message: EmailMessage) => Promise<void>;
};

export function createEmailNotificationService(
  config: EmailNotificationConfig,
  dependencies: EmailNotificationDependencies = {},
): EmailNotificationService {
  if (!config.enabled) {
    return {
      async sendDispatcherSubmissionNotification() {
        // Email notifications are intentionally disabled by env.
      },
    };
  }

  const sendMail = dependencies.sendMail ?? createSmtpSendMail(config);

  return {
    async sendDispatcherSubmissionNotification(submission, recipients) {
      const message = buildDispatcherSubmissionEmail(
        submission,
        recipients,
        config.from,
        config.subjectPrefix,
      );

      if (message === undefined) {
        return;
      }

      await sendMail(message);
    },
  };
}

export function buildDispatcherSubmissionEmail(
  submission: DispatcherSubmission,
  recipients: NotificationRecipients,
  from: string,
  subjectPrefix = "SMB Monitor",
): EmailMessage | undefined {
  const to = readNotificationRecipients(submission, recipients);

  if (to.length === 0) {
    return undefined;
  }

  return {
    from,
    to,
    subject: buildNotificationSubject(submission, subjectPrefix),
    text: buildNotificationText(submission),
  };
}

function createSmtpSendMail(config: EmailNotificationConfig) {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth:
      config.smtpUser !== undefined && config.smtpPass !== undefined
        ? {
            user: config.smtpUser,
            pass: config.smtpPass,
          }
        : undefined,
  });

  return async (message: EmailMessage) => {
    await transporter.sendMail({
      from: message.from,
      to: message.to.join(", "),
      subject: message.subject,
      text: message.text,
    });
  };
}

function readNotificationRecipients(
  submission: DispatcherSubmission,
  recipients: NotificationRecipients,
) {
  if (submission.formId !== "equipment" && !isIncidentForm(submission.formId)) {
    return [];
  }

  const emails = [...recipients.incidentAndEquipment];

  if (submission.formId === "equipment") {
    const downtimeReason = submission.payload.downtimeReason ?? "";

    if (isMechanicalDowntimeReason(downtimeReason)) {
      emails.push(...recipients.mechanicalDowntime);
    }

    if (isElectricalDowntimeReason(downtimeReason)) {
      emails.push(...recipients.electricalDowntime);
    }
  }

  return dedupeEmails(emails);
}

function isIncidentForm(formId: DispatcherSubmission["formId"]) {
  return formId === "incident" || formId === "incident_close";
}

function isMechanicalDowntimeReason(value: string) {
  return normalizeRussianText(value).includes("мех");
}

function isElectricalDowntimeReason(value: string) {
  return normalizeRussianText(value).includes("эл");
}

function buildNotificationSubject(
  submission: DispatcherSubmission,
  subjectPrefix: string,
) {
  const prefix = subjectPrefix.length > 0 ? `[${subjectPrefix}] ` : "";

  if (submission.formId === "incident") {
    return `${prefix}Открытие инцидента ${readIncidentNumber(submission)}`;
  }

  if (submission.formId === "incident_close") {
    return `${prefix}Закрытие инцидента ${readIncidentNumber(submission)}`;
  }

  if (submission.formId === "equipment") {
    const equipment = submission.payload.equipment?.trim();

    return `${prefix}Отчет по оборудованию${
      equipment === undefined || equipment.length === 0 ? "" : `: ${equipment}`
    }`;
  }

  return `${prefix}${submission.formTitle}`;
}

function buildNotificationText(submission: DispatcherSubmission) {
  const form = getDispatcherFormDefinition(submission.formId);
  const payloadLines = Object.entries(submission.payload).map(([key, value]) => {
    const field = form?.fields.find((item) => item.name === key);

    return `${readFieldLabel(field, key)}: ${value}`;
  });

  return [
    `Форма: ${submission.formTitle}`,
    `Статус: ${submission.status}`,
    `Бизнес-аккаунт: ${submission.businessAccountId}`,
    `Кратко: ${submission.summary}`,
    `Получено: ${submission.receivedAt}`,
    "",
    "Данные:",
    ...payloadLines,
  ].join("\n");
}

function readIncidentNumber(submission: DispatcherSubmission) {
  const incidentNumber = submission.payload.incidentNumber?.trim();

  return incidentNumber === undefined || incidentNumber.length === 0
    ? submission.id
    : incidentNumber;
}

function readFieldLabel(field: DispatcherFormField | undefined, fallback: string) {
  return field?.label ?? fallback;
}

function dedupeEmails(emails: readonly string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const email of emails) {
    const normalizedEmail = email.trim().toLocaleLowerCase("en-US");

    if (normalizedEmail.length === 0 || seen.has(normalizedEmail)) {
      continue;
    }

    seen.add(normalizedEmail);
    result.push(email.trim());
  }

  return result;
}

function normalizeRussianText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}
