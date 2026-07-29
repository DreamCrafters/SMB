import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("mobile board-assignment dialog fits inside its padded viewport", () => {
  const densityMatch = /--density-3:\s*(\d+)px;/u.exec(stylesSource);
  const mobileBackdropMatch =
    /@media \(max-width: 820px\)[\s\S]*?\.admin-db-modal-backdrop\s*\{[^}]*padding:\s*var\(--density-3\);/u.exec(
      stylesSource,
    );
  const mobileDialogMatch =
    /@media \(max-width: 680px\)[\s\S]*?\.board-assignment-dialog\s*\{[^}]*max-height:\s*(\d+)(vh|%);/u.exec(
      stylesSource,
    );

  assert.ok(densityMatch, "modal backdrop spacing token is missing");
  assert.ok(mobileBackdropMatch, "mobile modal backdrop padding is missing");
  assert.ok(mobileDialogMatch, "mobile dialog height limit is missing");

  const backdropPadding = Number(densityMatch[1]);

  for (const viewportHeight of [320, 375, 667, 844]) {
    const availableHeight = viewportHeight - backdropPadding * 2;
    const dialogMaxHeight = mobileDialogMatch[2] === "%"
      ? availableHeight * Number(mobileDialogMatch[1]) / 100
      : viewportHeight * Number(mobileDialogMatch[1]) / 100;

    assert.ok(
      dialogMaxHeight <= availableHeight,
      `dialog can grow to ${dialogMaxHeight}px inside ${availableHeight}px`,
    );
  }
});

test("mobile modal backdrop preserves the phone safe areas", () => {
  assert.match(
    stylesSource,
    /@media \(max-width: 820px\)[\s\S]*?\.admin-db-modal-backdrop\s*\{[^}]*padding-top:\s*max\(var\(--density-3\), env\(safe-area-inset-top\)\);[^}]*padding-bottom:\s*max\(var\(--density-3\), env\(safe-area-inset-bottom\)\);/u,
  );
});
