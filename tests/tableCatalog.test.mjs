import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

test("site tables and cells must use the shared typed rendering boundary", async () => {
  const violations = [];
  for (const name of await readdir(new URL("../src/", import.meta.url))) {
    if (!name.endsWith(".tsx") || ["ManagedTable.tsx", "TableCell.tsx"].includes(name)) continue;
    const source = await readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(file);
        const role = node.attributes.properties.find((prop) => prop.name?.getText(file) === "role")?.initializer?.getText(file);
        if (["table", "td", "th"].includes(tag)
          || (role === '"table"' && tag !== "ManagedTable")
          || (['"cell"', '"columnheader"'].includes(role) && tag !== "AriaTableCell")) {
          violations.push(`${name}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  assert.deepEqual(violations, []);
});
