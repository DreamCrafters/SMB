import nodemailer from "nodemailer";
import type { EmailNotificationConfig } from "../config/env.js";
import type { DispatcherSubmission } from "../domain/dispatcherSubmission.js";
import {
  buildDispatcherNotificationSubject,
  buildDispatcherNotificationText,
  readDispatcherNotificationRecipients,
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
  const to = readDispatcherNotificationRecipients(submission, recipients);

  if (to.length === 0) {
    return undefined;
  }

  return {
    from,
    to,
    subject: buildDispatcherNotificationSubject(submission, subjectPrefix),
    text: buildDispatcherNotificationText(submission),
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
