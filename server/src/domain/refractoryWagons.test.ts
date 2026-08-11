import assert from "node:assert/strict";
import test from "node:test";
import { validateRefractoryWagonSubmission } from "./refractoryWagons.js";

test("refractory wagon submission normalizes the wagon turnover fields", () => {
  assert.deepEqual(
    validateRefractoryWagonSubmission({
      number: "  В-17  ",
      loadingDate: "2026-08-06",
      productBrand: "  ШКУ-32  ",
      pressDate: "2026-08-05",
      pieceCount: " 480 ",
      setter: "  Иванов   И.И. ",
      pressOperator: " Петров П.П. ",
      firingOperator: "  Зайцев   З.З. ",
      sorter: " Орлова О.О. ",
      postFiringCondition: "  Пригоден к  эксплуатации ",
      serviceApprovalDate: "2026-08-14",
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
        firingOperator: "Зайцев З.З.",
        sorter: "Орлова О.О.",
        postFiringCondition: "Пригоден к эксплуатации",
        serviceApprovalDate: "2026-08-14",
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
      pressOperator: "",
      firingOperator: 17,
      sorter: null,
      postFiringCondition: null,
      serviceApprovalDate: "2026-13-01",
    }),
    {
      ok: false,
      errors: [
        "Проверьте поле «№ вагона».",
        "Проверьте поле «Дата садки».",
        "Проверьте поле «Марка».",
        "Проверьте поле «Дата пресса».",
        "Проверьте поле «Кол-во шт.».",
        "Проверьте поле «Обжигальщик».",
        "Проверьте поле «Дата одобрения на продолжение эксплуатации».",
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

test("refractory wagon submission keeps the turnover fields optional", () => {
  assert.deepEqual(
    validateRefractoryWagonSubmission({
      number: "В-17",
      loadingDate: "2026-08-06",
      productBrand: "ШКУ-32",
      pressDate: "",
      pieceCount: " ",
      setter: " ",
      pressOperator: null,
      serviceApprovalDate: null,
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
        firingOperator: null,
        sorter: null,
        postFiringCondition: null,
        serviceApprovalDate: null,
      },
    },
  );
});
