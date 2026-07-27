import { readFile } from "node:fs/promises";

export type BoardAssignmentMaterial = {
  fileName: string;
  pdf: Buffer;
};

export type BoardAssignmentMaterialsSource = {
  read: (key: string) => Promise<BoardAssignmentMaterial | undefined>;
};

const protocol369Key = "protocol-369-2026-07-10";
const protocol369FileName = "Протокол 369 10.07.2026 v2.pdf";
const protocol369Url = new URL(
  "../../assets/board-assignments/protocol-369-2026-07-10.pdf",
  import.meta.url,
);

export function createBoardAssignmentMaterialsSource(): BoardAssignmentMaterialsSource {
  return {
    async read(key) {
      if (key !== protocol369Key) {
        return undefined;
      }

      return {
        fileName: protocol369FileName,
        pdf: await readFile(protocol369Url),
      };
    },
  };
}
