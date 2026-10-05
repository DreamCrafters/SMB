import { randomUUID } from "node:crypto";
import {
  collegiumReferenceKindLabels,
  collegiumReferenceKinds,
  type CollegiumReferenceKind,
  type CollegiumSettingsInput,
  type CollegiumSettingsResponse,
} from "../contracts/collegiumInitiatives.js";
import type { AuditEventAction } from "../contracts/audit.js";
import type { DatabaseTransactionRunner } from "../db/transactionContext.js";
import type { AuditRepository } from "../repositories/auditRepository.js";
import type { CollegiumSettingsRepository } from "../repositories/collegiumSettingsRepository.js";
import type { ServerUserProfile } from "./auth.js";
import {
  CollegiumInitiativeError,
  collegiumInitiativePermissions,
  readCollegiumAmount,
} from "./collegiumInitiative.js";

const maxLabelLength = 160;
const maxUnitLength = 40;
const maxImportanceValues = 20;
const maxImportanceLength = 100;
const maxReferenceValues = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, label: string, maxLength: number) {
  if (value !== undefined && typeof value !== "string") {
    throw new CollegiumInitiativeError(`Проверьте поле «${label}».`);
  }
  const trimmed = (value ?? "").trim();
  if (trimmed.length > maxLength) {
    throw new CollegiumInitiativeError(`Поле «${label}» длиннее ${maxLength} символов.`);
  }
  return trimmed;
}

/** Положительное число с ограниченной дробной частью в каноническом виде, или «не задано». */
function readDecimal(value: unknown, label: string, maxFraction: number, max: number) {
  const normalized = text(value, label, 20).replace(/\s/gu, "").replace(",", ".");
  if (normalized === "") return "";
  const match = new RegExp(`^(\\d{1,4})(?:\\.(\\d{1,${maxFraction}}))?$`, "u").exec(normalized);
  const number = Number(normalized);
  if (match === null || number <= 0 || number > max) {
    throw new CollegiumInitiativeError(
      `«${label}» — число больше 0 и не больше ${max}, до ${maxFraction} знаков после запятой.`,
    );
  }
  const fraction = (match[2] ?? "").replace(/0+$/u, "");
  return `${match[1].replace(/^0+(?=\d)/u, "")}${fraction === "" ? "" : `.${fraction}`}`;
}

function normalizeImportance(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}

export function readCollegiumSettingsInput(input: unknown): CollegiumSettingsInput {
  if (!isRecord(input)) throw new CollegiumInitiativeError("Передайте настройки.");
  const amount = (value: unknown, label: string) => {
    try {
      return readCollegiumAmount(text(value, label, 30));
    } catch {
      throw new CollegiumInitiativeError(`«${label}» — неотрицательная сумма в рублях.`);
    }
  };
  const rawImportance = input.criticalImportance ?? [];
  if (!Array.isArray(rawImportance) || rawImportance.length > maxImportanceValues) {
    throw new CollegiumInitiativeError(`Укажите не больше ${maxImportanceValues} критичных значений «Важности».`);
  }
  const seen = new Set<string>();
  const criticalImportance: string[] = [];
  for (const item of rawImportance) {
    const value = text(item, "Критичная «Важность»", maxImportanceLength);
    const key = normalizeImportance(value);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    criticalImportance.push(value);
  }
  return {
    oneTimeCostThreshold: amount(input.oneTimeCostThreshold, "Порог разовых затрат"),
    capexThreshold: amount(input.capexThreshold, "Порог CAPEX"),
    paybackNormMonths: readDecimal(input.paybackNormMonths, "Норматив окупаемости", 1, 600),
    discountRatePercent: readDecimal(input.discountRatePercent, "Ставка дисконтирования", 2, 100),
    criticalImportance,
  };
}

const settingsLabels: Record<keyof CollegiumSettingsInput, string> = {
  oneTimeCostThreshold: "Порог разовых затрат, ₽",
  capexThreshold: "Порог CAPEX, ₽",
  paybackNormMonths: "Норматив окупаемости, мес.",
  discountRatePercent: "Ставка дисконтирования, %",
  criticalImportance: "Критичная «Важность» поручений",
};

/**
 * Справочники и настройки модуля (ТЗ 14). Справочники правит `secretary`+,
 * пороги, ставку и значимость уровней риска — `chair`. Код значения неизменяем,
 * значения не удаляются, только архивируются.
 */
export function createCollegiumSettingsService({
  repository,
  transaction,
  audit,
  now = () => new Date(),
}: {
  repository: CollegiumSettingsRepository;
  transaction: DatabaseTransactionRunner;
  audit: AuditRepository;
  now?: () => Date;
}) {
  function requireManage(profile: ServerUserProfile) {
    const permissions = collegiumInitiativePermissions(profile);
    if (!permissions.canManage) {
      throw new CollegiumInitiativeError("Настройки Коллегии доступны секретарю и председателю.", 403);
    }
    return permissions;
  }

  function requireApprove(profile: ServerUserProfile) {
    if (!requireManage(profile).canApprove) {
      throw new CollegiumInitiativeError("Пороги и значимость рисков меняет председатель Коллегии.", 403);
    }
  }

  function record(
    profile: ServerUserProfile,
    action: Extract<AuditEventAction, `collegium_settings.${string}` | `collegium_reference.${string}`>,
    summary: string,
    details: Array<{ label: string; value: string }>,
    targetId: string,
  ) {
    return audit.record({
      actor: {
        userId: profile.userId,
        accountId: profile.activeAccess.accountId,
        displayName: profile.displayName,
        positionDisplayName: profile.activeAccess.positionDisplayName,
      },
      category: "data_change",
      action,
      summary,
      details,
      targetType: "collegium_settings",
      targetId,
    });
  }

  function readKind(value: unknown): CollegiumReferenceKind {
    if (typeof value !== "string" || !(collegiumReferenceKinds as readonly string[]).includes(value)) {
      throw new CollegiumInitiativeError("Выберите справочник.");
    }
    return value as CollegiumReferenceKind;
  }

  return {
    async read(profile: ServerUserProfile): Promise<CollegiumSettingsResponse> {
      const permissions = requireManage(profile);
      const [settings, reference] = await Promise.all([repository.readSettings(), repository.listReference()]);
      return { settings, reference, canEditReference: true, canEditSettings: permissions.canApprove };
    },

    async updateSettings(profile: ServerUserProfile, body: unknown) {
      requireApprove(profile);
      if (!isRecord(body) || !Number.isInteger(body.revision)) {
        throw new CollegiumInitiativeError("Передайте ревизию настроек.");
      }
      const next = readCollegiumSettingsInput(body.settings);
      return transaction.run(async () => {
        const current = await repository.readSettings(true);
        if (current.revision !== body.revision) {
          throw new CollegiumInitiativeError("Настройки уже изменены. Обновите страницу.", 409);
        }
        const changes = (Object.keys(settingsLabels) as Array<keyof CollegiumSettingsInput>)
          .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(next[key]))
          .map((key) => {
            const show = (value: string | string[]) =>
              (Array.isArray(value) ? value.join(", ") : value) || "не задано";
            return { label: settingsLabels[key], value: `${show(current[key])} → ${show(next[key])}` };
          });
        if (changes.length === 0) return current;
        if (!await repository.updateSettings(current.revision, next, profile.displayName, now())) {
          throw new CollegiumInitiativeError("Настройки уже изменены. Обновите страницу.", 409);
        }
        await record(profile, "collegium_settings.update", "Изменены настройки Инициатив Коллегии", changes, "settings");
        return repository.readSettings();
      });
    },

    async createReference(profile: ServerUserProfile, body: unknown) {
      requireManage(profile);
      if (!isRecord(body)) throw new CollegiumInitiativeError("Передайте значение справочника.");
      const kind = readKind(body.kind);
      const label = text(body.label, "Наименование", maxLabelLength);
      if (label === "") throw new CollegiumInitiativeError("Укажите наименование.");
      const unit = kind === "kpi" ? text(body.unit, "Единица измерения", maxUnitLength) : "";
      return transaction.run(async () => {
        const options = (await repository.listReference(true))[kind];
        if (options.length >= maxReferenceValues) {
          throw new CollegiumInitiativeError(`В справочнике не больше ${maxReferenceValues} значений.`);
        }
        const key = label.toLocaleLowerCase("ru-RU");
        if (options.some((option) => option.label.toLocaleLowerCase("ru-RU") === key)) {
          throw new CollegiumInitiativeError("Такое значение уже есть в справочнике.", 409);
        }
        const code = randomUUID();
        await repository.insertReference(kind, code, label, unit);
        await record(profile, "collegium_reference.create", "Добавлено значение справочника Коллегии", [
          { label: "Справочник", value: collegiumReferenceKindLabels[kind] },
          { label: "Значение", value: unit === "" ? label : `${label}, ${unit}` },
        ], `${kind}:${code}`);
        return repository.listReference();
      });
    },

    async updateReference(profile: ServerUserProfile, kindValue: string, code: string, body: unknown) {
      const permissions = requireManage(profile);
      const kind = readKind(kindValue);
      if (!isRecord(body)) throw new CollegiumInitiativeError("Передайте изменения.");
      if (body.significant !== undefined) {
        if (kind !== "risk_level" || typeof body.significant !== "boolean") {
          throw new CollegiumInitiativeError("Значимость задаётся только уровню риска.");
        }
        if (!permissions.canApprove) {
          throw new CollegiumInitiativeError("Значимость уровней риска меняет председатель Коллегии.", 403);
        }
      }
      if (body.archived !== undefined && typeof body.archived !== "boolean") {
        throw new CollegiumInitiativeError("Проверьте признак архива.");
      }
      if (body.move !== undefined && body.move !== "up" && body.move !== "down") {
        throw new CollegiumInitiativeError("Проверьте перемещение.");
      }
      return transaction.run(async () => {
        const options = (await repository.listReference(true))[kind];
        const index = options.findIndex((option) => option.code === code);
        if (index < 0) throw new CollegiumInitiativeError("Значение справочника не найдено.", 404);
        const current = options[index];
        const label = body.label === undefined ? current.label : text(body.label, "Наименование", maxLabelLength);
        if (label === "") throw new CollegiumInitiativeError("Укажите наименование.");
        const key = label.toLocaleLowerCase("ru-RU");
        if (options.some((option) => option.code !== code && option.label.toLocaleLowerCase("ru-RU") === key)) {
          throw new CollegiumInitiativeError("Такое значение уже есть в справочнике.", 409);
        }
        const next = {
          label,
          unit: kind === "kpi" && body.unit !== undefined
            ? text(body.unit, "Единица измерения", maxUnitLength)
            : current.unit ?? "",
          archived: body.archived === undefined ? current.archived === true : body.archived as boolean,
          significant: body.significant === undefined ? current.significant === true : body.significant as boolean,
        };
        const details = [{ label: "Справочник", value: collegiumReferenceKindLabels[kind] }, { label: "Значение", value: current.label }];
        if (next.label !== current.label) details.push({ label: "Наименование", value: `${current.label} → ${next.label}` });
        if (next.unit !== (current.unit ?? "")) details.push({ label: "Единица измерения", value: `${current.unit || "—"} → ${next.unit || "—"}` });
        if (next.archived !== (current.archived === true)) details.push({ label: "Архив", value: next.archived ? "в архиве" : "возвращено" });
        if (next.significant !== (current.significant === true)) details.push({ label: "Значимый риск", value: next.significant ? "да" : "нет" });
        const target = body.move === "up" ? index - 1 : body.move === "down" ? index + 1 : index;
        if (target !== index && target >= 0 && target < options.length) {
          const codes = options.map((option) => option.code);
          [codes[index], codes[target]] = [codes[target], codes[index]];
          await repository.reorderReference(kind, codes);
          details.push({ label: "Порядок", value: `позиция ${index + 1} → ${target + 1}` });
        }
        if (details.length === 2) return repository.listReference();
        await repository.updateReference(kind, code, next);
        await record(profile, "collegium_reference.update", "Изменено значение справочника Коллегии", details, `${kind}:${code}`);
        return repository.listReference();
      });
    },
  };
}

export type CollegiumSettingsService = ReturnType<typeof createCollegiumSettingsService>;
