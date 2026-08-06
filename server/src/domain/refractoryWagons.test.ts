import assert from "node:assert/strict";
import test from "node:test";
import { validateRefractoryWagonSubmission } from "./refractoryWagons.js";

test("refractory wagon submission normalizes the wagon and production crew", () => {
  assert.deepEqual(
    validateRefractoryWagonSubmission({
      number: "  В-17  ",
      loadingDate: "2026-08-06",
      productBrand: "  ШКУ-32  ",
      setter: "  Иванов   И.И. ",
      pressOperator: " Петров П.П. ",
    }),
    {
      ok: true,
      value: {
        number: "В-17",
        loadingDate: "2026-08-06",
        productBrand: "ШКУ-32",
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
      setter: null,
      pressOperator: "",
    }),
    {
      ok: false,
      errors: [
        "Проверьте поле «№ вагона».",
        "Проверьте поле «Дата садки».",
        "Проверьте поле «Марка».",
      ],
    },
  );
});

test("refractory wagon submission keeps empty production crew optional", () => {
  assert.deepEqual(
    validateRefractoryWagonSubmission({
      number: "В-17",
      loadingDate: "2026-08-06",
      productBrand: "ШКУ-32",
      setter: " ",
      pressOperator: null,
    }),
    {
      ok: true,
      value: {
        number: "В-17",
        loadingDate: "2026-08-06",
        productBrand: "ШКУ-32",
        setter: null,
        pressOperator: null,
      },
    },
  );
});
