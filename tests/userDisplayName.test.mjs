import assert from "node:assert/strict";
import test from "node:test";
import { formatUserShortName } from "../.test-build/src/services/userDisplayName.js";

test("formatUserShortName shortens a conventional full Russian name", () => {
  assert.equal(formatUserShortName("Иванов Иван Иванович"), "Иванов И.");
  assert.equal(formatUserShortName("Мария Ивановна Сидорова"), "Сидорова М.");
  assert.equal(formatUserShortName("  Иванов   Иван   "), "Иванов И.");
});

test("formatUserShortName recognizes a two-part first-name surname value", () => {
  assert.equal(formatUserShortName("Мария Сидорова"), "Сидорова М.");
  assert.equal(formatUserShortName("Петров Пётр"), "Петров П.");
});

test("formatUserShortName preserves already shortened and service values", () => {
  assert.equal(formatUserShortName("Иванов И."), "Иванов И.");
  assert.equal(formatUserShortName("Dev administrator"), "Dev administrator");
  assert.equal(formatUserShortName("Диспетчер"), "Диспетчер");
  assert.equal(formatUserShortName(""), "");
});
