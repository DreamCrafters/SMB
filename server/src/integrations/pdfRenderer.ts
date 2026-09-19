import { createRequire } from "node:module";

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

export async function renderPdfDocument(definition: Record<string, unknown>) {
  return pdfMake.createPdf(definition).getBuffer();
}
