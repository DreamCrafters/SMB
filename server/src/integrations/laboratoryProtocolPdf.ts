import { createRequire } from "node:module";
import { laboratoryProtocolTemplate } from "../config/laboratoryProtocol.js";
import type { LaboratoryProtocol } from "../domain/laboratoryProtocol.js";
import {
  laboratoryChemicalAnalysisFields,
  type LaboratoryChemicalAnalysisJournalFilters,
  type LaboratoryChemicalAnalysisJournalRecord,
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
  const filterRows = [
    metadataRow("Период анализа", formatProtocolPeriod(filters)),
    ...(filters.query === undefined
      ? []
      : [metadataRow("Поиск", filters.query)]),
    metadataRow("Количество позиций", String(records.length)),
  ];
  const recordRows = records.map((record) => [
    record.laboratorySampleCode,
    record.sampleNumber,
    record.sampleName,
    ...laboratoryChemicalAnalysisFields.map((field) => {
      const value = record[field.id];
      return value === undefined
        ? "—"
        : field.kind === "date"
          ? formatCalendarDate(value)
          : value;
    }),
  ]);

  return {
    info: {
      title: `Протокол отбора проб от ${formatInstantDate(generatedAt)}`,
      author: laboratoryProtocolTemplate.organizationName,
      subject: "Отфильтрованные записи журнала химических анализов",
      keywords: "лаборатория, отбор проб, химические анализы",
    },
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [24, 24, 24, 34],
    defaultStyle: { font: "Roboto", fontSize: 6.5, lineHeight: 1.08 },
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "center",
      fontSize: 7,
      color: "#555555",
      margin: [0, 9, 0, 0],
    }),
    content: [
      {
        stack: [
          { text: laboratoryProtocolTemplate.organizationName, bold: true, fontSize: 10 },
          { text: laboratoryProtocolTemplate.organizationShortName, bold: true },
          { text: laboratoryProtocolTemplate.address },
          { text: laboratoryProtocolTemplate.laboratoryName, bold: true },
          { text: laboratoryProtocolTemplate.accreditation },
        ],
        alignment: "center",
      },
      {
        text: `ПРОТОКОЛ ОТБОРА ПРОБ ОТ ${formatInstantDate(generatedAt)}`,
        bold: true,
        fontSize: 11,
        alignment: "center",
        margin: [0, 11, 0, 7],
      },
      {
        table: { widths: [92, "*"], body: filterRows },
        layout: "noBorders",
        margin: [0, 0, 0, 7],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [52, 38, 82, 46, 44, 58, 46, 28, 28, 28, 28, 28, 28, 32, "*"],
          body: [[
            tableHeader("Код лабораторной пробы"),
            tableHeader("№ пробы"),
            tableHeader("Наименование пробы"),
            ...laboratoryChemicalAnalysisFields.map((field) =>
              tableHeader(field.label)
            ),
          ], ...recordRows],
        },
        layout: {
          hLineWidth: () => 0.6,
          vLineWidth: () => 0.6,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
          paddingLeft: () => 2,
          paddingRight: () => 2,
          paddingTop: () => 2,
          paddingBottom: () => 2,
        },
      },
      {
        text: laboratoryProtocolTemplate.disclaimer,
        italics: true,
        fontSize: 7,
        margin: [0, 8, 0, 12],
      },
      {
        text: `${laboratoryProtocolTemplate.laboratoryManagerRole}  ${laboratoryProtocolTemplate.laboratoryManagerName}`,
        bold: true,
      },
    ],
  };
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
    return `${formatCalendarDate(filters.dateFrom)} — ${formatCalendarDate(filters.dateTo)}`;
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
