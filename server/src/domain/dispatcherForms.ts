export type DispatcherFormId =
  | "equipment"
  | "incident"
  | "incident_close"
  | "visitor"
  | "gas_oc"
  | "gas_cosh";

export type DispatcherFormFieldType =
  | "text"
  | "number"
  | "date"
  | "month"
  | "datetime-local"
  | "select"
  | "textarea";

export type DispatcherFormField = {
  name: string;
  label: string;
  type: DispatcherFormFieldType;
  required: boolean;
  options?: readonly string[];
  maxLength?: number;
};

export type DispatcherFormDefinition = {
  id: DispatcherFormId;
  title: string;
  sheetName: string;
  summaryFields: readonly string[];
  fields: readonly DispatcherFormField[];
};

export type PublicDispatcherFormDefinition = Omit<
  DispatcherFormDefinition,
  "summaryFields"
>;

const equipmentOptions = [
  "Пресс №1",
  "Пресс №2",
  "Пресс №3",
  "Пресс №4",
  "Пресс №5",
  "Пресс №6",
  "Бегуны №1",
  "Бегуны №2",
  "Бегуны №3",
  "Бегуны №4",
  "Бегуны №5",
  "Бегуны №6",
  "Дезинтегратор №2",
  "Сушильный №2",
  "Шаровая №1",
  "Шаровая №2",
] as const;

const downtimeReasonOptions = [
  "Резерв",
  "Замена марки/формы",
  "Простой по мех. эл. части",
] as const;

const severityOptions = ["Низкий", "Средний", "Высокий"] as const;

function buildGasForm(
  id: "gas_oc" | "gas_cosh",
  title: "Газ ОЦ" | "Газ ЦОШ",
): DispatcherFormDefinition {
  return {
    id,
    title,
    sheetName: title,
    summaryFields: ["date", "meterReading", "dailyConsumption"],
    fields: [
      {
        name: "date",
        label: "Дата",
        type: "date",
        required: true,
      },
      {
        name: "meterReading",
        label: "Показание счетчика ГРП 1 (ОЦ+Котельная)",
        type: "number",
        required: false,
      },
      {
        name: "dailyConsumption",
        label: "Расход за сутки, м3",
        type: "number",
        required: false,
      },
      {
        name: "monthlyConsumption",
        label: "Расход с начала месяца, м3",
        type: "number",
        required: false,
      },
      {
        name: "dailyLimit",
        label: "Лимит суточный, м3",
        type: "number",
        required: false,
      },
      {
        name: "dailyUnderuse",
        label: "Недобор газа суточный, м3",
        type: "number",
        required: false,
      },
      {
        name: "monthlyUnderuse",
        label: "Недобор газа месячный, м3",
        type: "number",
        required: false,
      },
      {
        name: "dailyOveruse",
        label: "Перебор газа суточный, м3",
        type: "number",
        required: false,
      },
      {
        name: "monthlyOveruse",
        label: "Перебор газа месячный, м3",
        type: "number",
        required: false,
      },
      {
        name: "monthYear",
        label: "Месяц год",
        type: "month",
        required: true,
      },
    ],
  };
}

export const dispatcherForms: readonly DispatcherFormDefinition[] = [
  {
    id: "equipment",
    title: "Оборудование",
    sheetName: "Оборудование",
    summaryFields: ["equipment", "reportDate", "productionTons"],
    fields: [
      {
        name: "reportDate",
        label: "Дата отчета",
        type: "date",
        required: true,
      },
      {
        name: "reportMonth",
        label: "Месяц отчета",
        type: "month",
        required: true,
      },
      {
        name: "equipment",
        label: "Оборудование",
        type: "select",
        required: true,
        options: equipmentOptions,
      },
      {
        name: "productionTons",
        label: "Выработка, тонн",
        type: "number",
        required: false,
      },
      {
        name: "downtimeReason",
        label: "Причина простоя",
        type: "select",
        required: false,
        options: downtimeReasonOptions,
      },
      {
        name: "downtimeHours",
        label: "Время простоя, часов",
        type: "number",
        required: false,
      },
      {
        name: "note",
        label: "Примечание",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
    ],
  },
  {
    id: "incident",
    title: "Инцидент",
    sheetName: "Инциденты",
    summaryFields: ["place", "incidentType", "severity"],
    fields: [
      {
        name: "happenedAt",
        label: "Дата и время",
        type: "datetime-local",
        required: true,
      },
      {
        name: "place",
        label: "Место",
        type: "text",
        required: true,
      },
      {
        name: "incidentType",
        label: "Тип",
        type: "text",
        required: true,
      },
      {
        name: "description",
        label: "Описание",
        type: "textarea",
        required: true,
        maxLength: 2_000,
      },
      {
        name: "severity",
        label: "Крит.",
        type: "select",
        required: true,
        options: severityOptions,
      },
      {
        name: "registrar",
        label: "Ответственный за регистрацию",
        type: "text",
        required: true,
      },
      {
        name: "operationalMeasures",
        label: "Меры оперативные",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
      {
        name: "note",
        label: "Примечание",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
    ],
  },
  {
    id: "incident_close",
    title: "Закрытие инцидента",
    sheetName: "Инциденты",
    summaryFields: ["incidentNumber", "closedAt", "closingResponsible"],
    fields: [
      {
        name: "incidentNumber",
        label: "№",
        type: "text",
        required: true,
      },
      {
        name: "closedAt",
        label: "Дата и время закрытия",
        type: "datetime-local",
        required: true,
      },
      {
        name: "cause",
        label: "Причины",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
      {
        name: "closeMeasures",
        label: "Меры после закрытия",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
      {
        name: "expenses",
        label: "Расходы на инцидент",
        type: "number",
        required: false,
      },
      {
        name: "closingResponsible",
        label: "Ответственный о внесении записи о закрытии",
        type: "text",
        required: true,
      },
      {
        name: "closeRecord",
        label: "Запись о закрытии",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
      {
        name: "note",
        label: "Примечание",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
    ],
  },
  {
    id: "visitor",
    title: "Посетитель",
    sheetName: "Посетители",
    summaryFields: ["visitorName", "organization", "host"],
    fields: [
      {
        name: "entryAt",
        label: "Дата время",
        type: "datetime-local",
        required: true,
      },
      {
        name: "visitorName",
        label: "ФИО посетителя",
        type: "text",
        required: true,
      },
      {
        name: "position",
        label: "Должность",
        type: "text",
        required: false,
      },
      {
        name: "organization",
        label: "Организация",
        type: "text",
        required: false,
      },
      {
        name: "visitPurpose",
        label: "Цель визита",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
      {
        name: "host",
        label: "Кого посещает",
        type: "text",
        required: false,
      },
      {
        name: "exitAt",
        label: "Дата время выхода",
        type: "datetime-local",
        required: false,
      },
      {
        name: "note",
        label: "Примечание",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
    ],
  },
  buildGasForm("gas_oc", "Газ ОЦ"),
  buildGasForm("gas_cosh", "Газ ЦОШ"),
];

export function getDispatcherFormDefinition(formId: string) {
  return dispatcherForms.find((form) => form.id === formId);
}

export function getDispatcherFormTitle(formId: string) {
  return getDispatcherFormDefinition(formId)?.title ?? formId;
}

export function isDispatcherFormId(value: unknown): value is DispatcherFormId {
  return (
    typeof value === "string" &&
    dispatcherForms.some((form) => form.id === value)
  );
}

export function getPublicDispatcherForms(): PublicDispatcherFormDefinition[] {
  return dispatcherForms.map(({ summaryFields: _summaryFields, ...form }) => form);
}
