const knownUserMessages: readonly [RegExp, string][] = [
  [/incident closure requires an open incident/i, "Выберите незакрытый инцидент."],
  [/visitor is already inside/i, "Посетитель уже отмечен на вход."],
  [
    /visitor exit requires an open visitor entry/i,
    "Выберите посетителя без отметки выхода.",
  ],
  [/equipment report must include all equipment/i, "Внесите все позиции оборудования."],
  [/equipment report contains duplicates/i, "Уберите повтор оборудования."],
  [/equipment report requires production/i, "Заполните данные по оборудованию."],
  [
    /downtime hours must be greater than zero when downtime reason is selected/i,
    "Укажите время простоя больше 0 часов.",
  ],
  [
    /downtime reason is required when downtime hours are greater than zero/i,
    "Укажите причину простоя.",
  ],
  [/reserve downtime requires exactly 8/i, "Для резерва укажите 8 часов простоя."],
  [/downtime hours must be 8 hours or less/i, "Простой не может быть больше 8 часов."],
  [
    /production must be greater than zero when downtime is less than 8 hours/i,
    "Укажите выработку больше 0.",
  ],
  [/items\[\d+\] is invalid/i, "Проверьте данные оборудования."],
];

const technicalMessagePatterns: readonly RegExp[] = [
  /\bCORS\b/i,
  /CORS_ORIGIN/i,
  /\bVITE_/i,
  /\bbackend\b/i,
  /\bfrontend\b/i,
  /\bremote\b/i,
  /\bfeed\b/i,
  /\bendpoint\b/i,
  /\bpayload\b/i,
  /\bJSON\b/i,
  /\blocalStorage\b/i,
  /\bsessionStorage\b/i,
  /\blocalhost\b/i,
  /127\.0\.0\.1/i,
  /\/api\b/i,
  /\/health\b/i,
  /access\/profile/i,
  /dev[- ]?session/i,
  /server session/i,
  /\bserver\b/i,
  /сервер/i,
  /удал[её]н/i,
  /неподдерживаем/i,
  /businessAccountId/i,
  /formId/i,
  /items\[/i,
  /primaryKey/i,
  /MariaDB|MySQL/i,
];

export function readShortUserMessage(message: string, fallback: string) {
  const normalizedMessage = message.trim().replace(/\s+/g, " ");

  if (normalizedMessage.length === 0) {
    return fallback;
  }

  const knownMessage = readKnownUserMessage(normalizedMessage);

  if (knownMessage !== undefined) {
    return knownMessage;
  }

  if (
    hasTechnicalDetails(normalizedMessage) ||
    isLikelyEnglishDiagnostic(normalizedMessage)
  ) {
    return fallback;
  }

  return normalizedMessage;
}

function readKnownUserMessage(message: string) {
  return knownUserMessages.find(([pattern]) => pattern.test(message))?.[1];
}

function hasTechnicalDetails(message: string) {
  return technicalMessagePatterns.some((pattern) => pattern.test(message));
}

function isLikelyEnglishDiagnostic(message: string) {
  return /^[\x00-\x7F]+$/.test(message) && /[A-Za-z]/.test(message);
}
