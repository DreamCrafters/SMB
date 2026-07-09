import assert from "node:assert/strict";
import test from "node:test";
import { readShortUserMessage } from "../.test-build/src/services/userFacingMessages.js";

test("readShortUserMessage hides technical network details", () => {
  assert.equal(
    readShortUserMessage(
      "Не удалось отправить данные. Проверьте /health и CORS_ORIGIN backend.",
      "Не удалось отправить. Попробуйте ещё раз.",
    ),
    "Не удалось отправить. Попробуйте ещё раз.",
  );
});

test("readShortUserMessage translates known domain errors", () => {
  assert.equal(
    readShortUserMessage(
      "incident closure requires an open incident.",
      "Не удалось отправить.",
    ),
    "Выберите незакрытый инцидент.",
  );
});

test("readShortUserMessage keeps clear user copy", () => {
  assert.equal(
    readShortUserMessage("Выберите незакрытый инцидент.", "Не удалось отправить."),
    "Выберите незакрытый инцидент.",
  );
});
