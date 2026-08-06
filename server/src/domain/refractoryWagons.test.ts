import assert from "node:assert/strict";
import test from "node:test";
import { validateRefractoryWagonSubmission } from "./refractoryWagons.js";

test("refractory wagon submission normalizes the number, loading date, and product brand", () => {
  assert.deepEqual(
    validateRefractoryWagonSubmission({
      number: "  В-17  ",
      loadingDate: "2026-08-06",
      productBrand: "  ШКУ-32  ",
    }),
    {
      ok: true,
      value: {
        number: "В-17",
        loadingDate: "2026-08-06",
        productBrand: "ШКУ-32",
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
