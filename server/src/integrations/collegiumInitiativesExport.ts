import {
  collegiumCostVatLabels,
  collegiumDecisionLabels,
  collegiumInitiativeStatusLabels,
  collegiumMeetingFormatLabels,
  collegiumMeetingStatusLabels,
  collegiumRecurringPeriodLabels,
  collegiumResultConclusionLabels,
  type CollegiumInitiative,
  type CollegiumInitiativeDetailResponse,
  type CollegiumMeeting,
} from "../contracts/collegiumInitiatives.js";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
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
      { header: "Плановое начало", width: 13 },
      { header: "Плановый результат", width: 13 },
      { header: "Критерий успеха", width: 30 },
      { header: "Решение Коллегии", width: 34 },
      { header: "Фактический эффект, ₽", width: 18 },
      { header: "Вывод", width: 18 },
      { header: "Просрочка поручений", width: 12 },
      { header: "Изменена", width: 13 },
    ],
    rows: initiatives.map((initiative) => {
      const { card } = initiative;
      const result = initiative.workflow.result;
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
        card.expectedEffectPeriod,
        amount(card.oneTimeCostAmount),
        amount(card.recurringCostAmount),
        date(card.plannedStart),
        date(card.plannedResult),
        card.kpiCriterion,
        decision(initiative),
        amount(result?.actualEffectAmount),
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
        ["Ожидаемый эффект", [money(card.expectedEffectAmount), card.expectedEffectPeriod, card.expectedEffectKind].filter(Boolean).join(", ")],
        ["Методика расчёта", card.effectMethod],
        ["Разовые затраты", [money(card.oneTimeCostAmount), card.oneTimeCostVat === "" ? "" : collegiumCostVatLabels[card.oneTimeCostVat], card.oneTimeCostSource].filter(Boolean).join(", ")],
        ["Постоянные затраты", [money(card.recurringCostAmount), card.recurringCostPeriod === "" ? "" : collegiumRecurringPeriodLabels[card.recurringCostPeriod]].filter(Boolean).join(" ")],
        ["Внутренние ресурсы", card.internalResources],
      ]),
      ...section("Роли, сроки и KPI", [
        ["Владелец результата", name(card.ownerId)],
        ["Исполнитель", name(card.executorId)],
        ["Контролёр исполнения", name(card.executionControllerId)],
        ["Контролёр эффекта", name(card.effectControllerId)],
        ["Сроки", [date(card.plannedStart), date(card.plannedResult)].filter(Boolean).join(" — ")],
        ["Критерий успеха", card.kpiCriterion],
        ["Источник KPI", card.kpiSource],
        ["Ключевые риски", card.risks.join("; ")],
        ["Требуется от Коллегии", card.requestedDecision === "" ? "" : collegiumDecisionLabels[card.requestedDecision]],
      ]),
      ...section("Решение и исполнение", [
        ["Решение Коллегии", decision(initiative)],
        ["Поручения", detail.linkedAssignments.map((assignment) =>
          `${assignment.number}: ${assignmentStatusLabels[assignment.status as DirectorAssignment["status"]] ?? assignment.status}, срок ${date(assignment.deadline)}`).join("\n")],
        ["Фактический результат", result?.description ?? ""],
        ["Фактический эффект", money(result?.actualEffectAmount)],
        ["Вывод", result?.conclusion ? collegiumResultConclusionLabels[result.conclusion] : ""],
        ["Подтверждение эффекта", initiative.workflow.effectConfirmation === undefined
          ? ""
          : `${initiative.workflow.effectConfirmation.confirmedByDisplayName}, ${date(initiative.workflow.effectConfirmation.confirmedAt)}`],
      ]),
    ],
  });
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
