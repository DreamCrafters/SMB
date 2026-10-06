import {
  collegiumCostVatLabels,
  collegiumDecisionLabels,
  collegiumEconomicsOverrideFields,
  collegiumEconomicsOverrideLabels,
  collegiumEffectPeriodLabels,
  collegiumEffectStatusLabels,
  collegiumPassportAmountFields,
  collegiumPassportFieldLabels,
  collegiumPassportScenarioFields,
  collegiumInitiativeStatusLabels,
  collegiumMeetingFormatLabels,
  collegiumMeetingStatusLabels,
  collegiumRecurringPeriodLabels,
  collegiumResultConclusionLabels,
  collegiumYesNoLabels,
  type CollegiumDashboard,
  type CollegiumInitiative,
  type CollegiumInitiativeDetailResponse,
  type CollegiumMeeting,
  type CollegiumPassport,
  type CollegiumYesNo,
} from "../contracts/collegiumInitiatives.js";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import { calculateCollegiumEconomics, fromKopecks } from "../domain/collegiumEconomics.js";
import { buildCollegiumEffectControlRows, readCollegiumConfirmedKopecks } from "../domain/collegiumEffectControl.js";
import { renderPdfDocument } from "./pdfRenderer.js";
import { buildXlsxWorkbook } from "./xlsxWriter.js";

type Names = (accountId: string) => string;

const assignmentStatusLabels: Record<DirectorAssignment["status"], string> = {
  in_progress: "В работе",
  under_review: "На проверке",
  revision_requested: "На доработке",
  completed: "Завершено",
};

function date(value: string | undefined) {
  return value !== undefined && /^\d{4}-\d{2}-\d{2}/u.test(value)
    ? value.slice(0, 10).split("-").reverse().join(".")
    : "";
}

function amount(value: string | undefined) {
  return value === undefined || value === "" ? undefined : Number(value);
}

function money(value: string | undefined) {
  return value === undefined || value === ""
    ? ""
    : `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} ₽`;
}

function confirmedRubles(initiative: CollegiumInitiative) {
  const kopecks = readCollegiumConfirmedKopecks(initiative);
  return kopecks === undefined ? undefined : fromKopecks(kopecks);
}

function confirmedAmount(initiative: CollegiumInitiative) {
  return amount(confirmedRubles(initiative));
}

/** Период эффекта: подпись из списка или прежний свободный текст. */
function effectPeriod(value: string) {
  return (collegiumEffectPeriodLabels as Record<string, string>)[value] ?? value;
}

function yesNo(value: CollegiumYesNo | "") {
  return value === "" ? "" : collegiumYesNoLabels[value];
}

function risks(card: CollegiumInitiative["card"]) {
  return card.risks
    .map((risk) => (risk.levelLabel === "" ? risk.text : `${risk.text} (${risk.levelLabel.toLocaleLowerCase("ru-RU")})`))
    .join("; ");
}

function decision(initiative: CollegiumInitiative) {
  const last = initiative.workflow.lastDecision;
  return last === undefined
    ? ""
    : `${collegiumDecisionLabels[last.decision]}, протокол № ${last.protocolNumber} от ${date(last.meetingDate)}`;
}

/** Реестр инициатив в Excel: те же строки, что видит пользователь по фильтрам. */
export function buildCollegiumRegistryXlsx(
  initiatives: readonly CollegiumInitiative[],
  name: Names,
  overdueIds: ReadonlySet<string>,
  passportRequiredIds: ReadonlySet<string> = new Set(),
) {
  return buildXlsxWorkbook([{
    name: "Инициативы Коллегии",
    columns: [
      { header: "Номер", width: 14 },
      { header: "Дата создания", width: 13 },
      { header: "Наименование", width: 40 },
      { header: "Статус", width: 24 },
      { header: "Направление", width: 16 },
      { header: "Тип эффекта", width: 24 },
      { header: "Инициатор", width: 22 },
      { header: "Владелец", width: 22 },
      { header: "Исполнитель", width: 22 },
      { header: "Контролёр исполнения", width: 22 },
      { header: "Контролёр эффекта", width: 22 },
      { header: "Ожидаемый эффект, ₽", width: 18 },
      { header: "Период эффекта", width: 14 },
      { header: "Разовые затраты, ₽", width: 18 },
      { header: "Постоянные затраты, ₽", width: 18 },
      { header: "CAPEX, ₽", width: 16 },
      { header: "Чистый годовой эффект, ₽", width: 18 },
      { header: "Окупаемость, мес.", width: 14 },
      { header: "ROI, %", width: 10 },
      { header: "Полный паспорт", width: 12 },
      { header: "Риски", width: 34 },
      { header: "Плановое начало", width: 13 },
      { header: "Плановый результат", width: 13 },
      { header: "Критерий успеха", width: 30 },
      { header: "Решение Коллегии", width: 34 },
      { header: "Подтверждённый эффект, ₽", width: 18 },
      { header: "Вывод", width: 18 },
      { header: "Просрочка поручений", width: 12 },
      { header: "Изменена", width: 13 },
    ],
    rows: initiatives.map((initiative) => {
      const { card } = initiative;
      const result = initiative.workflow.result;
      const { economics } = calculateCollegiumEconomics(card);
      return [
        initiative.number,
        date(initiative.createdAt),
        card.title,
        collegiumInitiativeStatusLabels[initiative.status],
        card.directionLabel,
        card.effectTypeLabels.join(", "),
        name(card.initiatorId),
        name(card.ownerId),
        name(card.executorId),
        name(card.executionControllerId),
        name(card.effectControllerId),
        amount(card.expectedEffectAmount),
        effectPeriod(card.expectedEffectPeriod),
        amount(card.oneTimeCostAmount),
        amount(card.recurringCostAmount),
        amount(card.capexAmount),
        amount(economics.netAnnualEffect),
        economics.paybackStatus === "not_paying" ? "не окупается" : amount(economics.paybackMonths),
        amount(economics.roiPercent),
        passportRequiredIds.has(initiative.id) ? "требуется" : "",
        risks(card),
        date(card.plannedStart),
        date(card.plannedResult),
        card.kpiCriterion,
        decision(initiative),
        confirmedAmount(initiative),
        result?.conclusion ? collegiumResultConclusionLabels[result.conclusion] : "",
        overdueIds.has(initiative.id) ? "да" : "",
        date(initiative.updatedAt),
      ];
    }),
  }]);
}

const baseDocument = {
  pageSize: "A4",
  defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.2 },
  footer: (page: number, count: number) => ({ text: `${page} / ${count}`, alignment: "center", fontSize: 8, margin: [0, 12, 0, 0] }),
};

export async function renderCollegiumRegistryPdf(
  initiatives: readonly CollegiumInitiative[],
  name: Names,
  overdueIds: ReadonlySet<string>,
) {
  const header = ["Номер", "Наименование", "Статус", "Владелец", "Ожидаемый эффект", "Срок", "Решение Коллегии"]
    .map((text) => ({ text, bold: true, fillColor: "#eeeeee" }));
  return renderPdfDocument({
    ...baseDocument,
    pageOrientation: "landscape",
    pageMargins: [30, 30, 30, 40],
    info: { title: "Реестр инициатив Коллегии" },
    content: [
      { text: "Реестр инициатив Коллегии", bold: true, fontSize: 15, margin: [0, 0, 0, 4] },
      { text: `Инициатив: ${initiatives.length}`, margin: [0, 0, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: [62, "*", 90, 95, 80, 55, 120],
          body: [
            header,
            ...initiatives.map((initiative) => [
              initiative.number,
              initiative.card.title,
              `${collegiumInitiativeStatusLabels[initiative.status]}${overdueIds.has(initiative.id) ? "\nпросрочены поручения" : ""}`,
              name(initiative.card.ownerId) || "—",
              money(initiative.card.expectedEffectAmount) || "—",
              date(initiative.card.plannedResult) || "—",
              decision(initiative) || "—",
            ]),
          ],
        },
        layout: { paddingTop: () => 4, paddingBottom: () => 4 },
      },
    ],
  });
}

/** Печатная форма карточки идеи (ТЗ 13.2). */
export async function renderCollegiumInitiativeCardPdf(
  detail: CollegiumInitiativeDetailResponse,
  name: Names,
) {
  const { initiative } = detail;
  const { card } = initiative;
  const row = (label: string, value: string) => [
    { text: label, bold: true, fillColor: "#f4f4f4" },
    { text: value === "" ? "—" : value },
  ];
  const section = (title: string, rows: Array<[string, string]>) => [
    { text: title, bold: true, fontSize: 11, margin: [0, 10, 0, 4] },
    {
      table: { widths: [170, "*"], body: rows.map(([label, value]) => row(label, value)) },
      layout: { paddingTop: () => 3, paddingBottom: () => 3 },
    },
  ];
  const result = initiative.workflow.result;
  return renderPdfDocument({
    ...baseDocument,
    pageOrientation: "portrait",
    pageMargins: [40, 40, 40, 45],
    info: { title: `Инициатива ${initiative.number}` },
    content: [
      { text: `Инициатива ${initiative.number}`, bold: true, fontSize: 14 },
      { text: card.title, fontSize: 12, margin: [0, 2, 0, 2] },
      { text: `Статус: ${collegiumInitiativeStatusLabels[initiative.status]} · создана ${date(initiative.createdAt)}`, margin: [0, 0, 0, 4] },
      ...section("Идентификация", [
        ["Инициатор", name(card.initiatorId)],
        ["Направление", card.directionLabel],
        ["Тип эффекта", card.effectTypeLabels.join(", ")],
      ]),
      ...section("Проблема и решение", [
        ["Проблема / возможность", card.problem],
        ["Базовая линия", [card.baselineValue, card.baselinePeriod].filter(Boolean).join(", ")],
        ["Источник подтверждения", card.baselineSource],
        ["Предлагаемое решение", card.solution],
        ["Что меняется", card.changeScope],
      ]),
      ...section("Эффект и ресурсы", [
        ["Ожидаемый эффект", [money(card.expectedEffectAmount), effectPeriod(card.expectedEffectPeriod), card.expectedEffectKind].filter(Boolean).join(", ")],
        ["Методика расчёта", card.effectMethod],
        ["Разовые затраты", [money(card.oneTimeCostAmount), card.oneTimeCostVat === "" ? "" : collegiumCostVatLabels[card.oneTimeCostVat], card.oneTimeCostSource].filter(Boolean).join(", ")],
        ["Постоянные затраты", [money(card.recurringCostAmount), card.recurringCostPeriod === "" ? "" : collegiumRecurringPeriodLabels[card.recurringCostPeriod]].filter(Boolean).join(" ")],
        ["CAPEX", money(card.capexAmount)],
        ["Внутренние ресурсы", card.internalResources],
        ["Чистый годовой эффект", money(detail.economics.netAnnualEffect)],
        ["Срок окупаемости", detail.economics.paybackStatus === "not_paying"
          ? "не окупается"
          : detail.economics.paybackMonths === "" ? "" : `${detail.economics.paybackMonths.replace(".", ",")} мес.`],
        ["ROI", detail.economics.roiPercent === "" ? "" : `${detail.economics.roiPercent.replace(".", ",")} %`],
        ["Полный паспорт", detail.passportReasons.length === 0
          ? "не требуется"
          : `требуется: ${detail.passportReasons.map((reason) => reason.label.toLocaleLowerCase("ru-RU")).join("; ")}`],
      ]),
      ...section("Роли, сроки и KPI", [
        ["Владелец результата", name(card.ownerId)],
        ["Исполнитель", name(card.executorId)],
        ["Контролёр исполнения", name(card.executionControllerId)],
        ["Контролёр эффекта", name(card.effectControllerId)],
        ["Сроки", [date(card.plannedStart), date(card.plannedResult)].filter(Boolean).join(" — ")],
        ["Критерий успеха", card.kpiCriterion],
        ["Источник KPI", card.kpiSource],
        ["Ключевые риски", risks(card)],
        ["Требуется от Коллегии", card.requestedDecision === "" ? "" : collegiumDecisionLabels[card.requestedDecision]],
        ["Меняется технология или контроль качества", yesNo(card.changesTechnology)],
        ["Новый продукт, рынок или клиент", yesNo(card.newProductOrMarket)],
        ["Требуется решение СД", yesNo(card.boardDecisionRequired)],
      ]),
      ...(card.passport === undefined ? [] : passportSections(card.passport, section)),
      ...section("Решение и исполнение", [
        ["Решение Коллегии", decision(initiative)],
        ["Поручения", detail.linkedAssignments.map((assignment) =>
          `${assignment.number}: ${assignmentStatusLabels[assignment.status as DirectorAssignment["status"]] ?? assignment.status}, срок ${date(assignment.deadline)}`).join("\n")],
        ["Фактический результат", result?.description ?? ""],
        ["Подтверждённый эффект", money(confirmedRubles(initiative))],
        ["Контроль эффекта", buildCollegiumEffectControlRows(initiative).map((row) =>
          `${row.label}: план ${money(row.plannedAnnual) || "—"}, факт ${money(row.fact?.actualAmount) || "—"}, ${collegiumEffectStatusLabels[row.status].toLocaleLowerCase("ru-RU")}`).join("\n")],
        ["Вывод", result?.conclusion ? collegiumResultConclusionLabels[result.conclusion] : ""],
        ["Подтверждение эффекта", initiative.workflow.effectConfirmation === undefined
          ? ""
          : `${initiative.workflow.effectConfirmation.confirmedByDisplayName}, ${date(initiative.workflow.effectConfirmation.confirmedAt)}`],
      ]),
    ],
  });
}

function passportSections(
  passport: CollegiumPassport,
  section: (title: string, rows: Array<[string, string]>) => unknown[],
) {
  const label = collegiumPassportFieldLabels;
  const signed = (value: string) => (value.startsWith("-") ? `−${money(value.slice(1))}` : money(value));
  return [
    ...section("Полный паспорт: альтернативы и прогноз", [
      [label.alternatives, passport.alternatives],
      ...collegiumPassportAmountFields.map((field): [string, string] => [label[field], money(passport[field])]),
      ...collegiumPassportScenarioFields.map((field): [string, string] => [label[field], signed(passport[field])]),
      ["Плановые эффекты", (passport.effects ?? []).map((effect, index) => [
        `${index + 1}. ${[effect.effectTypeLabel, effect.directionLabel, effect.kpiLabel, effect.siteLabel].filter(Boolean).join(", ")}`,
        `${money(effect.annualAmount)} в год; база ${effect.baselineValue} (${effect.baselinePeriod})${effect.targetValue === "" ? "" : `, цель ${effect.targetValue}`}`,
        `измерение с ${date(effect.measurementStart)}${effect.measurementEnd === "" ? "" : ` по ${date(effect.measurementEnd)}`}`,
      ].join("; ")).join("\n")],
      [label.schedule, passport.schedule.map((row) =>
        `${row.month.split("-").reverse().join(".")}: затраты ${money(row.cost)}, эффект ${money(row.effect)}`).join("\n")],
      ...collegiumEconomicsOverrideFields.flatMap((field): Array<[string, string]> => {
        const override = passport.overrides[field];
        return override === undefined ? [] : [[`${collegiumEconomicsOverrideLabels[field]} (вручную)`, `${override.value}: ${override.explanation}`]];
      }),
    ]),
    ...section("Полный паспорт: условия и решение", [
      [label.requirements, passport.requirements],
      [label.impacts, passport.impacts],
      [label.dependencies, passport.dependencies],
      [label.pilotPlan, passport.pilotPlan],
      [label.pilotStopConditions, passport.pilotStopConditions],
      [label.milestones, passport.milestones.map((item) => `${date(item.date)} — ${item.text}`).join("\n")],
      [label.requiredAssignments, passport.requiredAssignments],
      [label.ceoPosition, passport.ceoPosition],
      [label.draftDecision, passport.draftDecision],
    ]),
  ];
}

/** Протокол заседания; неутверждённый печатается с пометкой «Проект». */
export async function renderCollegiumProtocolPdf(meeting: CollegiumMeeting) {
  const protocol = meeting.protocol;
  const isApproved = protocol.approvedAt !== undefined;
  return renderPdfDocument({
    ...baseDocument,
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.3 },
    pageOrientation: "portrait",
    pageMargins: [56, 50, 42, 50],
    info: { title: `Протокол ${meeting.number}` },
    ...(isApproved ? {} : { watermark: { text: "ПРОЕКТ", opacity: 0.08, bold: true } }),
    content: [
      { text: protocol.text === "" ? `Протокол заседания Коллегии № ${meeting.number}` : protocol.text, preserveLeadingSpaces: true },
      {
        text: isApproved
          ? `Утверждён ${date(protocol.approvedAt)}: ${protocol.approvedByDisplayName ?? ""}`
          : `${collegiumMeetingStatusLabels[meeting.status]} · ${collegiumMeetingFormatLabels[meeting.format]} · проект не утверждён`,
        italics: true,
        margin: [0, 16, 0, 0],
      },
    ],
  });
}

/** Печатная сводка дашборда Коллегии (ТЗ 13.1): те же цифры, что на экране. */
export async function renderCollegiumDashboardPdf(dashboard: CollegiumDashboard) {
  const table = (header: string[], widths: Array<number | string>, rows: string[][]) => ({
    table: {
      headerRows: 1,
      widths,
      body: [header.map((text) => ({ text, bold: true, fillColor: "#eeeeee" })), ...rows],
    },
    layout: { paddingTop: () => 3, paddingBottom: () => 3 },
  });
  const heading = (text: string) => ({ text, bold: true, fontSize: 11, margin: [0, 12, 0, 4] });
  const list = (title: string, items: Array<{ number: string; title: string }>) => items.length === 0
    ? []
    : [heading(title), { ul: items.map((item) => `${item.number} «${item.title}»`) }];
  const meeting = dashboard.nextMeeting;
  return renderPdfDocument({
    ...baseDocument,
    pageOrientation: "portrait",
    pageMargins: [40, 40, 40, 45],
    info: { title: "Сводка инициатив Коллегии" },
    content: [
      { text: "Сводка инициатив Коллегии", bold: true, fontSize: 14 },
      { text: `На ${date(dashboard.generatedOn)} · инициатив: ${dashboard.total}`, margin: [0, 2, 0, 4] },
      table(["Показатель", "Значение"], ["*", 120], [
        ["Ожидают предварительной оценки", String(dashboard.awaitingReview)],
        ["На доработке", `${dashboard.rework}${dashboard.reworkOverdue > 0 ? `, просрочено ${dashboard.reworkOverdue}` : ""}`],
        ["В пилоте", String(dashboard.inPilot)],
        ["Во внедрении", String(dashboard.inImplementation)],
        ["Просроченные поручения", String(dashboard.overdueAssignments)],
        ["Плановый эффект", money(dashboard.plannedEffect)],
        ["Подтверждённый эффект", money(dashboard.confirmedEffect)],
      ]),
      heading("Инициативы по статусам"),
      table(["Статус", "Количество"], ["*", 120], dashboard.statusCounts.map((entry) =>
        [collegiumInitiativeStatusLabels[entry.status], String(entry.count)])),
      ...(dashboard.effectByDirection.length === 0 ? [] : [
        heading("Эффект по направлениям"),
        table(["Направление", "Плановый", "Подтверждённый"], ["*", 110, 110], dashboard.effectByDirection.map((entry) =>
          [entry.directionLabel, money(entry.planned), money(entry.confirmed)])),
      ]),
      ...(meeting === undefined ? [] : [
        heading(`Ближайшее заседание ${meeting.number}: ${date(meeting.meetingDate)} в ${meeting.meetingTime}`),
        meeting.items.length === 0
          ? { text: "Повестка пока пуста." }
          : { ol: meeting.items.map((item) => `${item.number} «${item.title}»`) },
      ]),
      ...list("Требуют решения Совета директоров", dashboard.boardDecisions),
      ...list("Завершены без подтверждённого эффекта", dashboard.unconfirmed),
      ...(dashboard.topByEffect.length === 0 ? [] : [
        heading("Топ-10 по ожидаемому эффекту"),
        table(["Номер", "Наименование", "Статус", "Эффект"], [62, "*", 110, 90], dashboard.topByEffect.map((item) =>
          [item.number, item.title, collegiumInitiativeStatusLabels[item.status], money(item.expectedEffect)])),
      ]),
      ...(dashboard.topRisks.length === 0 ? [] : [
        heading("Топ-10 рисков"),
        table(["Номер", "Инициатива", "Уровень", "Риск"], [62, 150, 70, "*"], dashboard.topRisks.map((item) =>
          [item.number, item.title, item.levelLabel || "—", item.risk])),
      ]),
    ],
  });
}
