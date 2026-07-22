import { createRequire } from "node:module";
import { laboratoryProtocolTemplate } from "../config/laboratoryProtocol.js";
import type { LaboratoryProtocol } from "../domain/laboratoryProtocol.js";

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
