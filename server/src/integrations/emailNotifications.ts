import nodemailer from "nodemailer";
import type { EmailNotificationConfig, SmbAppEnv } from "../config/env.js";
import type { DispatcherSubmission } from "../domain/dispatcherSubmission.js";
import type { RefractoryReportNotification } from "../domain/refractoryReport.js";
import {
  buildEquipmentReportNotificationSubject,
  buildEquipmentReportNotificationText,
  buildDispatcherNotificationSubject,
  buildDispatcherNotificationText,
  appendNotificationEnvironmentNote,
  readEquipmentReportNotificationRecipients,
  readDispatcherNotificationRecipients,
  type DispatcherNotificationBankContent,
  type DispatcherSubmissionNotificationKind,
  type EquipmentReportNotificationStatus,
} from "./dispatcherNotifications.js";
import type { NotificationRecipients } from "./googleSheetsReference.js";
import {
  buildRefractoryNotificationSubject,
  buildRefractoryNotificationText,
  buildRefractoryReviewRequestSubject,
  buildRefractoryReviewRequestText,
  dedupeRefractoryEmailRecipients,
  type RefractoryNotificationKind,
} from "./refractoryNotifications.js";

export type EmailMessage = {
  from: string;
  to: string[];
  subject: string;
  text: string;
};

export type EmailNotificationService = {
  sendTextNotification?: (
    recipients: readonly string[],
    subject: string,
    text: string,
  ) => Promise<void>;
  sendDispatcherSubmissionNotification: (
    submission: DispatcherSubmission,
    recipients: NotificationRecipients,
    bankContents?: readonly DispatcherNotificationBankContent[],
    kind?: DispatcherSubmissionNotificationKind,
  ) => Promise<void>;
  sendEquipmentReportNotification: (
    submissions: readonly DispatcherSubmission[],
    recipients: NotificationRecipients,
    status: EquipmentReportNotificationStatus,
  ) => Promise<void>;
  sendRefractoryReportNotification: (
    report: RefractoryReportNotification,
    recipients: readonly string[],
    notificationKind: RefractoryNotificationKind,
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
      async sendTextNotification() {
        // Email notifications are intentionally disabled by env.
      },
      async sendDispatcherSubmissionNotification() {
        // Email notifications are intentionally disabled by env.
      },
      async sendEquipmentReportNotification() {
        // Email notifications are intentionally disabled by env.
      },
      async sendRefractoryReportNotification() {
        // Email notifications are intentionally disabled by env.
      },
    };
  }

  const sendMail = dependencies.sendMail ?? createSmtpSendMail(config);

  return {
    async sendTextNotification(recipients, subject, text) {
      const to = dedupeEmailRecipients(recipients);

      if (to.length === 0) {
        return;
      }

      await sendMail({
        from: config.from,
        to,
        subject: config.subjectPrefix.length > 0
          ? `[${config.subjectPrefix}] ${subject}`
          : subject,
        text: appendNotificationEnvironmentNote(text, appEnv),
      });
    },
    async sendDispatcherSubmissionNotification(
      submission,
      recipients,
      bankContents,
      kind,
    ) {
      const message = buildDispatcherSubmissionEmail(
        submission,
        recipients,
        config.from,
        config.subjectPrefix,
        appEnv,
        bankContents,
        kind,
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
    async sendRefractoryReportNotification(
      report,
      recipients,
      notificationKind,
    ) {
      const message = notificationKind === "approved"
        ? buildRefractoryReportEmail(
            report,
            recipients,
            config.from,
            config.subjectPrefix,
            appEnv,
          )
        : buildRefractoryReviewRequestEmail(
            report,
            recipients,
            config.from,
            config.subjectPrefix,
            appEnv,
          );

      if (message !== undefined) {
        await sendMail(message);
      }
    },
  };
}

function dedupeEmailRecipients(recipients: readonly string[]) {
  return Array.from(new Set(
    recipients.map((recipient) => recipient.trim()).filter(Boolean),
  ));
}

export function buildRefractoryReviewRequestEmail(
  report: RefractoryReportNotification,
  recipients: readonly string[],
  from: string,
  subjectPrefix = "НМОУ Вектор",
  appEnv: SmbAppEnv = "production",
): EmailMessage | undefined {
  const to = dedupeRefractoryEmailRecipients(recipients);

  if (to.length === 0) {
    return undefined;
  }

  return {
    from,
    to,
    subject: buildRefractoryReviewRequestSubject(report, subjectPrefix),
    text: appendNotificationEnvironmentNote(
      buildRefractoryReviewRequestText(report),
      appEnv,
    ),
  };
}

export function buildRefractoryReportEmail(
  report: RefractoryReportNotification,
  recipients: readonly string[],
  from: string,
  subjectPrefix = "НМОУ Вектор",
  appEnv: SmbAppEnv = "production",
): EmailMessage | undefined {
  const to = dedupeRefractoryEmailRecipients(recipients);

  if (to.length === 0) {
    return undefined;
  }

  return {
    from,
    to,
    subject: buildRefractoryNotificationSubject(report, subjectPrefix),
    text: appendNotificationEnvironmentNote(
      buildRefractoryNotificationText(report),
      appEnv,
    ),
  };
}

export function buildDispatcherSubmissionEmail(
  submission: DispatcherSubmission,
  recipients: NotificationRecipients,
  from: string,
  subjectPrefix = "НМОУ Вектор",
  appEnv: SmbAppEnv = "production",
  bankContents?: readonly DispatcherNotificationBankContent[],
  kind: DispatcherSubmissionNotificationKind = "created",
): EmailMessage | undefined {
  const to = readDispatcherNotificationRecipients(submission, recipients);

  if (to.length === 0) {
    return undefined;
  }

  return {
    from,
    to,
    subject: buildDispatcherNotificationSubject(
      submission,
      subjectPrefix,
      kind,
    ),
    text: appendNotificationEnvironmentNote(
      buildDispatcherNotificationText(submission, bankContents, kind),
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
