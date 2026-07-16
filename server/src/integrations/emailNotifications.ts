import nodemailer from "nodemailer";
import type { EmailNotificationConfig, SmbAppEnv } from "../config/env.js";
import type { DispatcherSubmission } from "../domain/dispatcherSubmission.js";
import {
  buildEquipmentReportNotificationSubject,
  buildEquipmentReportNotificationText,
  buildDispatcherNotificationSubject,
  buildDispatcherNotificationText,
  appendNotificationEnvironmentNote,
  readEquipmentReportNotificationRecipients,
  readDispatcherNotificationRecipients,
  type EquipmentReportNotificationStatus,
} from "./dispatcherNotifications.js";
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
  sendEquipmentReportNotification: (
    submissions: readonly DispatcherSubmission[],
    recipients: NotificationRecipients,
    status: EquipmentReportNotificationStatus,
  ) => Promise<void>;
};

export type EmailNotificationDependencies = {
  sendMail?: (message: EmailMessage) => Promise<void>;
};

export function createEmailNotificationService(
  config: EmailNotificationConfig,
  dependencies: EmailNotificationDependencies = {},
  appEnv: SmbAppEnv = "production",
): EmailNotificationService {
  if (!config.enabled) {
    return {
      async sendDispatcherSubmissionNotification() {
        // Email notifications are intentionally disabled by env.
      },
      async sendEquipmentReportNotification() {
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
        appEnv,
      );

      if (message === undefined) {
        return;
      }

      await sendMail(message);
    },
    async sendEquipmentReportNotification(submissions, recipients, status) {
      const message = buildEquipmentReportEmail(
        submissions,
        recipients,
        config.from,
        config.subjectPrefix,
        status,
        appEnv,
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
  subjectPrefix = "НМОУ Вектор",
  appEnv: SmbAppEnv = "production",
): EmailMessage | undefined {
  const to = readDispatcherNotificationRecipients(submission, recipients);

  if (to.length === 0) {
    return undefined;
  }

  return {
    from,
    to,
    subject: buildDispatcherNotificationSubject(submission, subjectPrefix),
    text: appendNotificationEnvironmentNote(
      buildDispatcherNotificationText(submission),
      appEnv,
    ),
  };
}

export function buildEquipmentReportEmail(
  submissions: readonly DispatcherSubmission[],
  recipients: NotificationRecipients,
  from: string,
  subjectPrefix = "НМОУ Вектор",
  status: EquipmentReportNotificationStatus = "created",
  appEnv: SmbAppEnv = "production",
): EmailMessage | undefined {
  if (submissions.length === 0) {
    return undefined;
  }

  const to = readEquipmentReportNotificationRecipients(submissions, recipients);

  if (to.length === 0) {
    return undefined;
  }

  return {
    from,
    to,
    subject: buildEquipmentReportNotificationSubject(
      submissions,
      subjectPrefix,
      status,
    ),
    text: appendNotificationEnvironmentNote(
      buildEquipmentReportNotificationText(submissions, status),
      appEnv,
    ),
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
