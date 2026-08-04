import { createRequire } from "node:module";
import { laboratoryProtocolTemplate } from "../config/laboratoryProtocol.js";
import type { LaboratoryProtocol } from "../domain/laboratoryProtocol.js";
import {
  laboratoryChemicalAnalysisFields,
  type LaboratoryChemicalAnalysisJournalFilters,
  type LaboratoryChemicalAnalysisJournalRecord,
  type LaboratoryChemicalAnalysisValues,
} from "../contracts/laboratoryChemicalAnalysisJournal.js";

type PdfOutput = { getBuffer: () => Promise<Buffer> };
type PdfMakeServer = {
  addFonts: (fonts: Record<string, Record<string, string>>) => void;
  setLocalAccessPolicy: (policy: (path: string) => boolean) => void;
  setUrlAccessPolicy: (policy: (url: string) => boolean) => void;
  createPdf: (definition: Record<string, unknown>) => PdfOutput;
};

const require = createRequire(import.meta.url);
const pdfMake = require("pdfmake") as PdfMakeServer;
const robotoFontPaths = {
  normal: require.resolve("pdfmake/fonts/Roboto/Roboto-Regular.ttf"),
  bold: require.resolve("pdfmake/fonts/Roboto/Roboto-Medium.ttf"),
  italics: require.resolve("pdfmake/fonts/Roboto/Roboto-Italic.ttf"),
  bolditalics: require.resolve("pdfmake/fonts/Roboto/Roboto-MediumItalic.ttf"),
};
const allowedFontPaths = new Set(Object.values(robotoFontPaths));
const chemicalAnalysisProtocolMassShareFieldIds = ["al2o3", "fe2o3"] as const;
const chemicalAnalysisProtocolMassChangeFieldId = "lossOnIgnition" as const;
const chemicalAnalysisProtocolDirectResultFieldIds = new Set<
  keyof LaboratoryChemicalAnalysisValues
>([
  ...chemicalAnalysisProtocolMassShareFieldIds,
  chemicalAnalysisProtocolMassChangeFieldId,
]);
const chemicalAnalysisProtocolOtherResultFields =
  laboratoryChemicalAnalysisFields.filter((field) =>
    (field.kind === "indicator" || field.kind === "notes") &&
    !chemicalAnalysisProtocolDirectResultFieldIds.has(field.id)
  );
const chemicalAnalysisProtocolLabelOverrides: Partial<Record<
  keyof LaboratoryChemicalAnalysisValues,
  string
>> = {
  al2o3: "Al₂O₃",
  fe2o3: "Fe₂O₃",
  sio2: "SiO₂",
  cao2: "CaO₂",
  p2o5: "P₂O₅",
  notes: "Примечание",
};

pdfMake.addFonts({ Roboto: robotoFontPaths });
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy((path) => allowedFontPaths.has(path));

export async function renderLaboratoryProtocolPdf(
  protocol: LaboratoryProtocol,
) {
  return pdfMake.createPdf(buildDocumentDefinition(protocol)).getBuffer();
}

export async function renderLaboratoryChemicalAnalysisProtocolPdf({
  records,
  filters,
  generatedAt,
}: {
  records: LaboratoryChemicalAnalysisJournalRecord[];
  filters: Pick<
    LaboratoryChemicalAnalysisJournalFilters,
    "dateFrom" | "dateTo" | "query"
  >;
  generatedAt: Date;
}) {
  return pdfMake.createPdf(buildLaboratoryChemicalAnalysisProtocolDocument({
    records,
    filters,
    generatedAt,
  })).getBuffer();
}

function buildDocumentDefinition(protocol: LaboratoryProtocol) {
  const metadataRows = [
    metadataRow("Наименование объекта испытаний", protocol.objectName),
    metadataRow("Цель испытаний", protocol.purpose),
    ...protocol.optionalFields.map((field) =>
      metadataRow(field.label, field.value)
    ),
    metadataRow("Дата проведения испытаний", protocol.testDate),
  ];
  const resultRows = protocol.sampleGroups.flatMap((group) =>
    group.rows.map((row, index) => [
      index === 0
        ? { text: group.identifier, rowSpan: group.rows.length, alignment: "center" }
        : {},
      row.indicatorLabel,
      row.standard,
      { text: row.value, alignment: "center" },
      row.note,
    ])
  );

  return {
    info: {
      title: `Протокол лабораторных испытаний от ${protocol.protocolDate}`,
      author: laboratoryProtocolTemplate.organizationName,
      subject: protocol.objectName,
      keywords: "лаборатория, протокол испытаний",
    },
    pageSize: "A4",
    pageMargins: [36, 30, 36, 38],
    defaultStyle: { font: "Roboto", fontSize: 8.5, lineHeight: 1.12 },
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "center",
      fontSize: 7,
      color: "#555555",
      margin: [0, 10, 0, 0],
    }),
    content: [
      {
        stack: [
          { text: laboratoryProtocolTemplate.organizationName, bold: true, fontSize: 11 },
          { text: laboratoryProtocolTemplate.organizationShortName, bold: true },
          { text: laboratoryProtocolTemplate.address },
          { text: laboratoryProtocolTemplate.laboratoryName, bold: true },
          { text: laboratoryProtocolTemplate.accreditation },
        ],
        alignment: "center",
      },
      {
        text: `ПРОТОКОЛ ОТ ${protocol.protocolDate}`,
        bold: true,
        fontSize: 12,
        alignment: "center",
        margin: [0, 14, 0, 8],
      },
      {
        table: { widths: [180, "*"], body: metadataRows },
        layout: "noBorders",
        margin: [0, 0, 0, 8],
      },
      {
        text: "Результаты испытаний",
        bold: true,
        fontSize: 10,
        alignment: "center",
        margin: [0, 5, 0, 5],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [70, "*", 98, 66, 54],
          body: [
            [
              tableHeader("Номер пробы / транспорт"),
              tableHeader("Наименование показателя"),
              tableHeader("НД на метод испытаний"),
              tableHeader("Результат испытаний"),
              tableHeader("Примечание"),
            ],
            ...resultRows,
          ],
        },
        layout: {
          hLineWidth: () => 0.7,
          vLineWidth: () => 0.7,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
          paddingLeft: () => 3,
          paddingRight: () => 3,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
      },
      {
        text: laboratoryProtocolTemplate.disclaimer,
        italics: true,
        fontSize: 7.5,
        margin: [0, 9, 0, 6],
      },
      ...(protocol.protocolNote.length === 0
        ? []
        : [{
            text: [
              { text: "Примечание: ", bold: true },
              protocol.protocolNote,
            ],
            margin: [0, 0, 0, 12],
          }]),
      {
        table: {
          widths: ["*", "*"],
          body: [[
            {
              stack: [
                { text: "Лаборант", bold: true },
                { text: protocol.laboratoryAssistantDisplayName, margin: [0, 12, 0, 0] },
              ],
            },
            {
              stack: [
                { text: laboratoryProtocolTemplate.laboratoryManagerRole, bold: true },
                { text: laboratoryProtocolTemplate.laboratoryManagerName, margin: [0, 12, 0, 0] },
              ],
            },
          ]],
        },
        layout: "noBorders",
      },
    ],
  };
}

export function buildLaboratoryChemicalAnalysisProtocolDocument({
  records,
  filters,
  generatedAt,
}: {
  records: LaboratoryChemicalAnalysisJournalRecord[];
  filters: Pick<
    LaboratoryChemicalAnalysisJournalFilters,
    "dateFrom" | "dateTo" | "query"
  >;
  generatedAt: Date;
}) {
  const sampleDescription = joinProtocolValues(records.map((record) =>
    `${record.sampleNumber} (${record.sampleName})`
  ));
  const batchNumbers = joinProtocolValues(records.map((record) =>
    record.batchNumber
  ));
  const analysisDates = joinProtocolValues(records.map((record) =>
    record.chemicalAnalysisDate === undefined
      ? undefined
      : formatCalendarDate(record.chemicalAnalysisDate)
  )) || formatInstantDate(generatedAt);
  const laboratoryRepresentatives = joinProtocolValues(records.map((record) =>
    record.chemicalAnalysisLaboratoryAssistant
  ));
  const recordRows = records.map(buildChemicalAnalysisResultRow);
  const blankRows = Array.from(
    { length: Math.max(10 - recordRows.length, 0) },
    buildBlankChemicalAnalysisResultRow,
  );

  return {
    info: {
      title: `Протокол отбора проб от ${formatInstantDate(generatedAt)}`,
      author: laboratoryProtocolTemplate.organizationName,
      subject: [
        `Отфильтрованные записи журнала химических анализов: ${formatProtocolPeriod(filters)}`,
        ...(filters.query === undefined ? [] : [`поиск ${filters.query}`]),
      ].join(", "),
      keywords: "лаборатория, отбор проб, химические анализы",
    },
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [28, 28, 28, 32],
    defaultStyle: { font: "Roboto", fontSize: 8.5, lineHeight: 1.08 },
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "center",
      fontSize: 6.5,
      color: "#555555",
      margin: [0, 8, 0, 0],
    }),
    content: [
      {
        text: "ПРОТОКОЛ ОТБОРА ПРОБ",
        bold: true,
        fontSize: 13,
        alignment: "center",
        margin: [0, 0, 0, 12],
      },
      {
        table: {
          widths: ["auto", "*"],
          body: [
            [
              formCell("Направляем Вам для испытаний пробы"),
              formLineCell(sampleDescription),
            ],
            [
              formCell(""),
              formCaptionCell("(указать номера проб)"),
            ],
          ],
        },
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          widths: ["auto", 135, "*", 92],
          body: [[
            formCell("отобранные от партии №"),
            formLineCell(batchNumbers),
            formCell(""),
            formLineCell(`${analysisDates} г.`, "center"),
          ]],
        },
        margin: [0, 0, 0, 10],
      },
      buildProtocolSignatureBlock("Контролер ОТК", ""),
      {
        table: {
          widths: ["auto", "*"],
          body: [[
            formCell("Лабораторная проба и протокол получены"),
            formLineCell(""),
          ]],
        },
        margin: [0, 14, 0, 9],
      },
      buildProtocolSignatureBlock(
        "Представитель лаборатории",
        laboratoryRepresentatives,
      ),
      {
        table: {
          headerRows: 3,
          dontBreakRows: true,
          widths: [78, 50, 52, 52, 96, 65, "*"],
          body: [
            ...chemicalAnalysisProtocolHeaderRows(),
            ...recordRows,
            ...blankRows,
          ],
        },
        layout: {
          hLineWidth: () => 0.7,
          vLineWidth: () => 0.7,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
          paddingLeft: () => 2,
          paddingRight: () => 2,
          paddingTop: () => 2,
          paddingBottom: () => 2,
        },
        margin: [0, 12, 0, 18],
      },
      buildProtocolSignatureBlock(
        "Представитель лаборатории",
        laboratoryRepresentatives,
        true,
      ),
      buildProtocolSignatureBlock("Результаты получил контролер ОТК", "", true),
    ],
  };
}

function chemicalAnalysisProtocolHeaderRows() {
  return [
    [
      protocolHeaderCell("Код лабораторной пробы", { rowSpan: 3 }),
      protocolHeaderCell("№ анализа", { rowSpan: 3 }),
      protocolHeaderCell("Результаты испытаний", { colSpan: 5 }),
      {},
      {},
      {},
      {},
    ],
    [
      {},
      {},
      protocolHeaderCell("Массовая доля в прокаленном веществе, %", {
        colSpan: 2,
      }),
      {},
      protocolHeaderCell(
        "Массовая доля изменения массы при прокаливании, %",
        { rowSpan: 2 },
      ),
      protocolHeaderCell("Огнеупорность, °C", { rowSpan: 2 }),
      protocolHeaderCell("Прочие показатели", { rowSpan: 2 }),
    ],
    [
      {},
      {},
      ...chemicalAnalysisProtocolMassShareFieldIds.map((fieldId) =>
        protocolHeaderCell(readChemicalAnalysisProtocolFieldLabel(fieldId))
      ),
      {},
      {},
      {},
    ],
  ];
}

function buildChemicalAnalysisResultRow(
  record: LaboratoryChemicalAnalysisJournalRecord,
) {
  return [
    protocolResultCell(record.laboratorySampleCode),
    protocolResultCell(record.laboratoryAnalysisNumber),
    ...chemicalAnalysisProtocolMassShareFieldIds.map((fieldId) =>
      protocolResultCell(record[fieldId])
    ),
    protocolResultCell(record[chemicalAnalysisProtocolMassChangeFieldId]),
    protocolResultCell(undefined),
    protocolResultCell(formatOtherChemicalIndicators(record), "left"),
  ];
}

function buildBlankChemicalAnalysisResultRow() {
  return Array.from({ length: 7 }, () => protocolResultCell(" ", "center", 5));
}

function formatOtherChemicalIndicators(
  record: LaboratoryChemicalAnalysisJournalRecord,
) {
  return chemicalAnalysisProtocolOtherResultFields
    .flatMap((field) => {
      const value = record[field.id];
      return value === undefined
        ? []
        : [`${readChemicalAnalysisProtocolFieldLabel(field.id)}: ${value}`];
    })
    .join("; ");
}

function readChemicalAnalysisProtocolFieldLabel(
  fieldId: keyof LaboratoryChemicalAnalysisValues,
) {
  const field = laboratoryChemicalAnalysisFields.find(({ id }) => id === fieldId);
  return chemicalAnalysisProtocolLabelOverrides[fieldId] ?? field?.label ?? fieldId;
}

function protocolHeaderCell(
  text: string,
  spans: { rowSpan?: number; colSpan?: number } = {},
) {
  return {
    text,
    ...spans,
    bold: true,
    alignment: "center",
    fontSize: 7.5,
    margin: [0, 2, 0, 2],
  };
}

function protocolResultCell(
  value: string | undefined,
  alignment: "left" | "center" = "center",
  verticalMargin = 2,
) {
  return {
    text: value ?? "",
    alignment,
    fontSize: 7.5,
    margin: [0, verticalMargin, 0, verticalMargin],
  };
}

function buildProtocolSignatureBlock(
  label: string,
  signatoryName: string,
  includeDate = false,
) {
  return {
    table: {
      widths: includeDate
        ? [150, 88, "*", 84]
        : ["*", 88, 150],
      body: [
        includeDate
          ? [
              formCell(label),
              formLineCell(""),
              formLineCell(signatoryName),
              formLineCell(""),
            ]
          : [
              formCell(label, "right"),
              formLineCell(""),
              formLineCell(signatoryName),
            ],
        includeDate
          ? [
              formCell(""),
              formCaptionCell("(подпись)"),
              formCaptionCell("(расшифровка подписи)"),
              formCaptionCell("(дата)"),
            ]
          : [
              formCell(""),
              formCaptionCell("(подпись)"),
              formCaptionCell("(расшифровка подписи)"),
            ],
      ],
    },
    margin: includeDate ? [0, 5, 0, 14] : [0, 0, 0, 0],
  };
}

function formCell(text: string, alignment: "left" | "right" = "left") {
  return {
    text,
    alignment,
    border: [false, false, false, false],
    margin: [0, 1, 4, 1],
  };
}

function formLineCell(
  text: string,
  alignment: "left" | "center" = "left",
) {
  return {
    text: text || " ",
    alignment,
    border: [false, false, false, true],
    borderColor: ["#000000", "#000000", "#000000", "#000000"],
    margin: [3, 1, 3, 1],
  };
}

function formCaptionCell(text: string) {
  return {
    text,
    alignment: "center",
    italics: true,
    fontSize: 6.5,
    border: [false, false, false, false],
    margin: [0, 1, 0, 0],
  };
}

function joinProtocolValues(values: Array<string | undefined>) {
  return [...new Set(values
    .map((value) => value?.trim())
    .filter((value): value is string => value !== undefined && value !== ""))]
    .join(", ");
}

function metadataRow(label: string, value: string) {
  return [
    { text: `${label}:`, bold: true, margin: [0, 1, 6, 1] },
    { text: value, margin: [0, 1, 0, 1] },
  ];
}

function tableHeader(text: string) {
  return {
    text,
    bold: true,
    alignment: "center",
    fillColor: "#eeeeee",
  };
}

function formatProtocolPeriod(
  filters: Pick<
    LaboratoryChemicalAnalysisJournalFilters,
    "dateFrom" | "dateTo"
  >,
) {
  if (filters.dateFrom !== undefined && filters.dateTo !== undefined) {
    return `${formatCalendarDate(filters.dateFrom)} - ${formatCalendarDate(filters.dateTo)}`;
  }
  if (filters.dateFrom !== undefined) {
    return `с ${formatCalendarDate(filters.dateFrom)}`;
  }
  if (filters.dateTo !== undefined) {
    return `по ${formatCalendarDate(filters.dateTo)}`;
  }
  return "Без ограничений";
}

function formatCalendarDate(value: string) {
  const [year, month, day] = value.split("-");
  return year !== undefined && month !== undefined && day !== undefined
    ? `${day}.${month}.${year}`
    : value;
}

function formatInstantDate(value: Date) {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("day")}.${read("month")}.${read("year")}`;
}
