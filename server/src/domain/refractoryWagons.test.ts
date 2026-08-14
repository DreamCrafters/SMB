import assert from "node:assert/strict";
import test from "node:test";
import {
  validateRefractoryWagonCatalogSubmission,
  validateRefractoryWagonInspectionSubmission,
  validateRefractoryWagonSubmission,
} from "./refractoryWagons.js";

test("refractory wagon catalog submission registers only the number", () => {
  assert.deepEqual(
    validateRefractoryWagonCatalogSubmission({ number: "  В-17  " }),
    {
      ok: true,
      value: {
        number: "В-17",
        loadingDate: null,
        productBrand: null,
        pressDate: null,
        pieceCount: null,
        setter: null,
        pressOperator: null,
      },
    },
  );
});

test("refractory wagon catalog submission ignores fields outside the number", () => {
  assert.deepEqual(
    validateRefractoryWagonCatalogSubmission({
      number: "В-17",
      loadingDate: "2026-08-06",
      productBrand: "ШКУ-32",
    }),
    {
      ok: true,
      value: {
        number: "В-17",
        loadingDate: null,
        productBrand: null,
        pressDate: null,
        pieceCount: null,
        setter: null,
        pressOperator: null,
      },
    },
  );
});

test("refractory wagon catalog submission rejects a missing number", () => {
  assert.deepEqual(
    validateRefractoryWagonCatalogSubmission({ number: "  " }),
    { ok: false, errors: ["Проверьте поле «№ вагона»."] },
  );
});

test("refractory wagon submission normalizes the fields entered by the shop", () => {
  assert.deepEqual(
    validateRefractoryWagonSubmission({
      number: "  В-17  ",
      loadingDate: "2026-08-06",
      productBrand: "  ШКУ-32  ",
      pressDate: "2026-08-05",
      pieceCount: " 480 ",
      setter: "  Иванов   И.И. ",
      pressOperator: " Петров П.П. ",
    }),
    {
      ok: true,
      value: {
        number: "В-17",
        loadingDate: "2026-08-06",
        productBrand: "ШКУ-32",
        pressDate: "2026-08-05",
        pieceCount: 480,
        setter: "Иванов И.И.",
        pressOperator: "Петров П.П.",
      },
    },
  );
});

test("refractory wagon submission rejects missing and invalid fields", () => {
  assert.deepEqual(
    validateRefractoryWagonSubmission({
      number: " ",
      loadingDate: "2026-02-30",
      productBrand: "",
      pressDate: "06.08.2026",
      pieceCount: "480 шт",
      setter: null,
      pressOperator: 17,
    }),
    {
      ok: false,
      errors: [
        "Проверьте поле «№ вагона».",
        "Проверьте поле «Дата садки».",
        "Проверьте поле «Марка».",
        "Проверьте поле «Дата пресса».",
        "Проверьте поле «Кол-во шт.».",
        "Проверьте поле «Прессовщик».",
      ],
    },
  );
});

test("refractory wagon submission rejects a negative piece count", () => {
  assert.deepEqual(
    validateRefractoryWagonSubmission({
      number: "В-17",
      loadingDate: "2026-08-06",
      productBrand: "ШКУ-32",
      pieceCount: -1,
    }),
    { ok: false, errors: ["Проверьте поле «Кол-во шт.»."] },
  );
});

test("refractory wagon submission keeps the press and crew fields optional", () => {
  assert.deepEqual(
    validateRefractoryWagonSubmission({
      number: "В-17",
      loadingDate: "2026-08-06",
      productBrand: "ШКУ-32",
      pressDate: "",
      pieceCount: " ",
      setter: " ",
      pressOperator: null,
    }),
    {
      ok: true,
      value: {
        number: "В-17",
        loadingDate: "2026-08-06",
        productBrand: "ШКУ-32",
        pressDate: null,
        pieceCount: null,
        setter: null,
        pressOperator: null,
      },
    },
  );
});

test("wagon inspection submission accepts only the two server-owned verdicts", () => {
  assert.deepEqual(
    validateRefractoryWagonInspectionSubmission({
      wagonId: " wagon-17 ",
      condition: "Можно эксплуатировать",
      approvalDate: "2026-08-14",
    }),
    {
      ok: true,
      value: {
        wagonId: "wagon-17",
        condition: "Можно эксплуатировать",
        approvalDate: "2026-08-14",
      },
    },
  );
  assert.deepEqual(
    validateRefractoryWagonInspectionSubmission({
      wagonId: "",
      condition: "Требуется ремонт футеровки",
      approvalDate: "14.08.2026",
    }),
    {
      ok: false,
      errors: [
        "Выберите вагон для осмотра.",
        "Проверьте поле «Состояние вагона после обжига».",
        "Проверьте поле «Дата осмотра».",
      ],
    },
  );
});
