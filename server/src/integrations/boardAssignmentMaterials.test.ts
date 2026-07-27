import assert from "node:assert/strict";
import test from "node:test";
import { createBoardAssignmentMaterialsSource } from "./boardAssignmentMaterials.js";

test("board assignment materials expose protocol 369 only through the allowlisted key", async () => {
  const source = createBoardAssignmentMaterialsSource();
  const material = await source.read("protocol-369-2026-07-10");

  assert.equal(material?.fileName, "Протокол 369 10.07.2026 v2.pdf");
  assert.equal(material?.pdf.subarray(0, 4).toString("ascii"), "%PDF");
  assert.equal(await source.read("unknown-material"), undefined);
});
