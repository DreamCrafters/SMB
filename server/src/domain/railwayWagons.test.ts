import assert from "node:assert/strict";
import test from "node:test";
import {
  maxRailwayWagonCargoLines,
  validateRailwayWagonCarriageTermsSubmission,
  validateRailwayWagonDispatchSubmission,
  validateRailwayWagonLocationSubmission,
  validateRailwayWagonNumberSubmission,
  validateRailwayWagonOrderSubmission,
} from "./railwayWagons.js";

test("a complete order passes with its cargo lines", () => {
  const validation = validateRailwayWagonOrderSubmission({
    contractReference: "  12/2026 от 01.09.2026 ",
    movementDirection: "На погрузку",
    destinationStation: "Абагур-Лесной",
    destinationStationRoad: "З-Сиб",
    wagonType: "КР (крытый)",
    cargoLines: [
      {
        cargoName: "ШБ-5 класс 4",
        etsngCode: "01000",
        palletCount: "12",
        palletWeight: "1,25",
        palletWidth: "1.2",
        palletHeight: "1",
        palletLength: "0.8",
        securingMethod: "Растяжки",
        securingWeight: "0.35",
      },
    ],
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) return;

  assert.equal(validation.value.contractReference, "12/2026 от 01.09.2026");
  assert.deepEqual(validation.value.cargoLines[0], {
    cargoName: "ШБ-5 класс 4",
    etsngCode: "01000",
    etsngName: null,
    palletCount: 12,
    palletWeight: 1.25,
    palletWidth: 1.2,
    palletHeight: 1,
    palletLength: 0.8,
    securingMethod: "Растяжки",
    securingWeight: 0.35,
  });
});

test("an order without cargo lines is rejected", () => {
  const validation = validateRailwayWagonOrderSubmission({
    contractReference: "12/2026",
    movementDirection: "На погрузку",
    destinationStation: "Абагур-Лесной",
    wagonType: "КР (крытый)",
    cargoLines: [],
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.errors, ["Добавьте хотя бы одну строку груза."]);
});

test("cargo lines are capped so one order cannot flood the child table", () => {
  const validation = validateRailwayWagonOrderSubmission({
    contractReference: "12/2026",
    movementDirection: "На погрузку",
    destinationStation: "Абагур-Лесной",
    wagonType: "КР (крытый)",
    cargoLines: Array.from(
      { length: maxRailwayWagonCargoLines + 1 },
      () => ({ cargoName: "ШБ-5" }),
    ),
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.match(validation.errors[0] ?? "", /не может быть больше 50/u);
});

test("an unknown field in a cargo line is rejected", () => {
  const validation = validateRailwayWagonOrderSubmission({
    contractReference: "12/2026",
    movementDirection: "На погрузку",
    destinationStation: "Абагур-Лесной",
    wagonType: "КР (крытый)",
    cargoLines: [{ cargoName: "ШБ-5", wagonNumber: "12345678" }],
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.errors, [
    "Строка груза 1 содержит неизвестное поле.",
  ]);
});

test("an unsupported direction or wagon type is rejected", () => {
  const validation = validateRailwayWagonOrderSubmission({
    contractReference: "12/2026",
    movementDirection: "На вывоз",
    destinationStation: "Абагур-Лесной",
    wagonType: "Платформа",
    cargoLines: [{ cargoName: "ШБ-5" }],
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.errors, [
    "Проверьте поле «Направление движения».",
    "Проверьте поле «Вид вагона».",
  ]);
});

test("an empty cargo line keeps only the required name", () => {
  const validation = validateRailwayWagonOrderSubmission({
    contractReference: "12/2026",
    movementDirection: "На выгрузку",
    destinationStation: "Абагур-Лесной",
    wagonType: "ПВ (полувагон)",
    cargoLines: [{ cargoName: "Глина Г-5" }],
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  assert.equal(validation.value.cargoLines[0].palletCount, null);
  assert.equal(validation.value.cargoLines[0].securingMethod, null);
});

test("carriage terms require the price, the penalty and the carrier", () => {
  assert.deepEqual(
    validateRailwayWagonCarriageTermsSubmission({
      rentCost: "120000",
      tariffCost: "85000,50",
      demurragePenalty: "3 000 руб. в сутки",
      carrier: "ПГК",
    }),
    {
      ok: true,
      value: {
        rentCost: 120000,
        tariffCost: 85000.5,
        demurragePenalty: "3 000 руб. в сутки",
        carrier: "ПГК",
      },
    },
  );

  const missing = validateRailwayWagonCarriageTermsSubmission({
    rentCost: "",
    tariffCost: "85000",
    demurragePenalty: "нет",
    carrier: "ПГК",
  });
  assert.equal(missing.ok, false);
});

test("a wagon number is numeric", () => {
  assert.deepEqual(
    validateRailwayWagonNumberSubmission({ wagonNumber: "52 345 678" }),
    { ok: true, value: { wagonNumber: "52 345 678" } },
  );
  assert.equal(
    validateRailwayWagonNumberSubmission({ wagonNumber: "вагон-1" }).ok,
    false,
  );
});

test("dispatch needs a real calendar date and may carry the location", () => {
  assert.deepEqual(
    validateRailwayWagonDispatchSubmission({
      expectedArrivalDate: "2026-09-15",
      currentLocation: "",
    }),
    {
      ok: true,
      value: { expectedArrivalDate: "2026-09-15", currentLocation: null },
    },
  );
  assert.equal(
    validateRailwayWagonDispatchSubmission({
      expectedArrivalDate: "2026-02-30",
    }).ok,
    false,
  );
});

test("the location cannot be saved empty", () => {
  assert.deepEqual(
    validateRailwayWagonLocationSubmission({ currentLocation: " Тайга " }),
    { ok: true, value: { currentLocation: "Тайга" } },
  );
  assert.equal(
    validateRailwayWagonLocationSubmission({ currentLocation: "  " }).ok,
    false,
  );
});
