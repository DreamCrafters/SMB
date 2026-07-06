export type DispatcherFormId =
  | "equipment"
  | "incident"
  | "incident_close"
  | "visitor"
  | "visitor_exit"
  | "gas_oc"
  | "gas_cosh";

export type DispatcherFormFieldType =
  | "text"
  | "number"
  | "integer"
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

export type PublicDispatcherFormOptions = {
  incidentLocationOptions?: readonly string[];
  incidentResponsibleOptions?: readonly string[];
};

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
  "Замена марки/формы",
  "Простой по мех, эл. части",
  "Резерв",
] as const;

const incidentTypeOptions = [
  "Травма",
  "Поломка оборудования по эл. части",
  "Поломка оборудования по мех. части",
  "Утечка данных",
  "Пожар",
  "Разлив химикатов",
  "Нарушение безопасности",
  "Микротравма",
  "Нарушение регламента",
] as const;

const criticalityOptions = ["Высокий", "Средний", "Низкий"] as const;

const knownDispatcherFormIds = [
  "equipment",
  "incident",
  "incident_close",
  "visitor",
  "visitor_exit",
  "gas_oc",
  "gas_cosh",
] as const satisfies readonly DispatcherFormId[];

const legacyDispatcherFormTitles: Partial<Record<DispatcherFormId, string>> = {
  gas_oc: "Газ ОЦ",
  gas_cosh: "Газ ЦОШ",
};

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
        type: "integer",
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
    title: "Открытие инцидента",
    sheetName: "Инциденты",
    summaryFields: ["incidentNumber", "location", "incidentType", "criticality"],
    fields: [
      {
        name: "datetime",
        label: "Дата и время инцидента",
        type: "datetime-local",
        required: true,
      },
      {
        name: "location",
        label: "Место (цех/участок)",
        type: "text",
        required: true,
      },
      {
        name: "incidentType",
        label: "Тип инцидента",
        type: "select",
        required: true,
        options: incidentTypeOptions,
      },
      {
        name: "description",
        label: "Описание",
        type: "textarea",
        required: true,
        maxLength: 2_000,
      },
      {
        name: "criticality",
        label: "Критичность",
        type: "select",
        required: true,
        options: criticalityOptions,
      },
      {
        name: "responsible",
        label: "Ответственный за регистрацию",
        type: "text",
        required: true,
      },
      {
        name: "immediateActions",
        label: "Оперативные меры",
        type: "textarea",
        required: true,
        maxLength: 2_000,
      },
    ],
  },
  {
    id: "incident_close",
    title: "Закрытие инцидента",
    sheetName: "Инциденты",
    summaryFields: ["incidentNumber", "closureDateTime", "approvedBy"],
    fields: [
      {
        name: "incidentNumber",
        label: "№",
        type: "text",
        required: true,
      },
      {
        name: "rootCauses",
        label: "Корневые причины",
        type: "textarea",
        required: true,
        maxLength: 2_000,
      },
      {
        name: "preventiveMeasures",
        label: "Предотвращающие меры",
        type: "textarea",
        required: true,
        maxLength: 2_000,
      },
      {
        name: "closureDateTime",
        label: "Дата и время закрытия",
        type: "datetime-local",
        required: true,
      },
      {
        name: "costs",
        label: "Затраты (убытки), руб",
        type: "number",
        required: false,
      },
      {
        name: "approvedBy",
        label: "Кто утвердил закрытие",
        type: "text",
        required: true,
      },
      {
        name: "closureNote",
        label: "Примечание",
        type: "textarea",
        required: false,
        maxLength: 2_000,
      },
    ],
  },
  {
    id: "visitor",
    title: "Вход посетителя",
    sheetName: "Посетители",
    summaryFields: ["fio", "organization", "whom"],
    fields: [
      {
        name: "fio",
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
        name: "purpose",
        label: "Цель визита",
        type: "text",
        required: false,
      },
      {
        name: "whom",
        label: "Кого посещает",
        type: "text",
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
    id: "visitor_exit",
    title: "Выход посетителя",
    sheetName: "Посетители",
    summaryFields: ["fio", "organization"],
    fields: [
      {
        name: "visitorEntryId",
        label: "Посетитель",
        type: "text",
        required: true,
      },
    ],
  },
];

export function getDispatcherFormDefinition(formId: string) {
  return dispatcherForms.find((form) => form.id === formId);
}

export function getDispatcherFormTitle(formId: string) {
  return (
    getDispatcherFormDefinition(formId)?.title ??
    legacyDispatcherFormTitles[formId as DispatcherFormId] ??
    formId
  );
}

export function isDispatcherFormId(value: unknown): value is DispatcherFormId {
  return (
    typeof value === "string" &&
    knownDispatcherFormIds.includes(value as DispatcherFormId)
  );
}

export function getPublicDispatcherForms(
  options: PublicDispatcherFormOptions = {},
): PublicDispatcherFormDefinition[] {
  return dispatcherForms.map(({ summaryFields: _summaryFields, ...form }) => ({
    ...form,
    fields: form.fields.map((field) =>
      readPublicDispatcherFormField(form.id, field, options),
    ),
  }));
}

function readPublicDispatcherFormField(
  formId: DispatcherFormId,
  field: DispatcherFormField,
  options: PublicDispatcherFormOptions,
) {
  if (
    formId === "incident" &&
    field.name === "location" &&
    options.incidentLocationOptions !== undefined &&
    options.incidentLocationOptions.length > 0
  ) {
    return {
      ...field,
      type: "select" as const,
      options: options.incidentLocationOptions,
    };
  }

  if (
    formId === "incident" &&
    field.name === "responsible" &&
    options.incidentResponsibleOptions !== undefined &&
    options.incidentResponsibleOptions.length > 0
  ) {
    return {
      ...field,
      type: "select" as const,
      options: options.incidentResponsibleOptions,
    };
  }

  return field;
}
