import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  formatRefractoryFormErrors,
  markRefractoryServerFieldErrors,
  validateRefractoryForm,
} from "../.test-build/src/services/refractoryFormValidation.js";

test("refractory validation puts every error on a separate line", () => {
  assert.equal(
    formatRefractoryFormErrors([
      { message: "Первая ошибка." },
      { message: "Вторая ошибка." },
    ]),
    "Проверьте выделенные поля.\nПервая ошибка.\nВторая ошибка.",
  );
});

test("refractory numeric validation covers integer, precision, and range rules", () => {
  const { form, document } = buildForm(`
    <input aria-label="Дробное поле" data-refractory-label="Дробное поле"
      data-refractory-number="decimal" value="12.345">
    <input aria-label="Целое поле" data-refractory-label="Целое поле"
      data-refractory-number="integer" value="15">
    <input aria-label="Большое число" data-refractory-label="Большое число"
      data-refractory-number="decimal" value="1000000000">
  `);

  assert.deepEqual(validateRefractoryForm(form), []);

  const decimal = document.querySelector('[aria-label="Дробное поле"]');
  const integer = document.querySelector('[aria-label="Целое поле"]');
  const maximum = document.querySelector('[aria-label="Большое число"]');
  decimal.value = "12.3456";
  integer.value = "1.5";
  maximum.value = "1000000001";

  const errors = validateRefractoryForm(form);
  assert.equal(errors.length, 3);
  assert.match(errors[0].message, /не более трёх знаков после запятой/u);
  assert.match(errors[1].message, /целое число без знаков после запятой/u);
  assert.match(errors[2].message, /число от 0 до 1 000 000 000/u);
  assert.equal(decimal.getAttribute("aria-invalid"), "true");
  assert.equal(integer.getAttribute("aria-invalid"), "true");
  assert.equal(maximum.getAttribute("aria-invalid"), "true");
});

test("refractory validation requires a brand for a filled product row", () => {
  const { form, document } = buildForm(`
    <table><tbody><tr>
      <td><select aria-label="Марка изделия, строка 1"
        data-refractory-label="Марка изделия, строка 1"
        data-refractory-row-brand><option value=""></option></select></td>
      <td><input data-refractory-label="Кол-во, шт., строка 1"
        data-refractory-number="integer" value="12"></td>
    </tr></tbody></table>
  `);

  const errors = validateRefractoryForm(form);
  const brand = document.querySelector("[data-refractory-row-brand]");
  assert.deepEqual(errors.map((error) => error.message), [
    "Марка изделия, строка 1: укажите марку изделия.",
  ]);
  assert.equal(brand.getAttribute("aria-invalid"), "true");
});

test("refractory validation requires output for a selected COSH brand", () => {
  const { form, document } = buildForm(`
    <table><tbody><tr>
      <td><input aria-label="Марка изделия, строка 1"
        data-refractory-row-brand value="ШБО"></td>
      <td><input aria-label="Выпуск, т, строка 1"
        data-refractory-label="Выпуск, т, строка 1"
        data-refractory-number="decimal"
        data-refractory-row-quantity value=""></td>
    </tr></tbody></table>
  `);

  const errors = validateRefractoryForm(form);
  const quantity = document.querySelector("[data-refractory-row-quantity]");
  assert.deepEqual(errors.map((error) => error.message), [
    "Выпуск, т, строка 1: укажите выпуск в тоннах.",
  ]);
  assert.equal(quantity.getAttribute("aria-invalid"), "true");
});

test("refractory validation rejects duplicate COSH brands", () => {
  const { form, document } = buildForm(`
    <table data-refractory-unique-brands><tbody>
      <tr><td><input data-refractory-label="Марка изделия, строка 1"
        data-refractory-row-brand value=" ШБО "></td></tr>
      <tr><td><input data-refractory-label="Марка изделия, строка 2"
        data-refractory-row-brand value="шбо"></td></tr>
    </tbody></table>
  `);

  const errors = validateRefractoryForm(form);
  const brands = document.querySelectorAll("[data-refractory-row-brand]");
  assert.deepEqual(errors.map((error) => error.message), [
    "Марка изделия, строка 2: марка уже выбрана в этой таблице.",
  ]);
  assert.equal(brands[0].hasAttribute("aria-invalid"), false);
  assert.equal(brands[1].getAttribute("aria-invalid"), "true");
});

test("server validation details highlight the matching visible field", () => {
  const { form, document } = buildForm(`
    <table><tbody><tr>
      <td><input data-refractory-label="Пресс СМ-1085 №1: Отработано, ч"
        name="formed.0.workedHours"></td>
    </tr></tbody></table>
  `);

  const invalidInputs = markRefractoryServerFieldErrors(form, [
    {
      fieldPath: "formed.0.workedHours",
      message: "Строка 1, «Отработано, ч»: укажите число от 0 до 24.",
    },
  ]);
  const workedHours = document.querySelector("input");

  assert.deepEqual(invalidInputs, [workedHours]);
  assert.equal(workedHours.getAttribute("aria-invalid"), "true");
});

test("server validation details keep scalar and COSH section context", () => {
  const { form, document } = buildForm(`
    <input data-refractory-label="Время прогонки, час(а)" name="calcinationHours">
    <section data-refractory-section="Заполнение ж/д бункеров">
      <input data-refractory-label="Кол-во, т" name="bunker.I.quantity">
      <input data-refractory-label="Кол-во, т" name="bunker.II.quantity">
    </section>
    <section data-refractory-section="Подача шамота в огнеупорный цех, тн">
      <input data-refractory-label="Кол-во, т" name="supply.I.quantity">
    </section>
  `);

  const invalidInputs = markRefractoryServerFieldErrors(form, [
    {
      fieldPath: "calcinationHours",
      message: "Поле «Время прогонки, час(а)»: укажите число от 0 до 24.",
    },
    {
      fieldPath: "bunker.II.quantity",
      message:
        "Заполнение ж/д бункеров, строка 2, «Кол-во, т»: укажите число от 0 до 1 000 000 000.",
    },
  ]);
  const inputs = Array.from(document.querySelectorAll("input"));

  assert.deepEqual(invalidInputs, [inputs[0], inputs[2]]);
  assert.equal(inputs[3].hasAttribute("aria-invalid"), false);
});

test("server field paths distinguish bagging and filled dynamic rows", () => {
  const { form, document } = buildForm(`
    <input name="bunker.I.quantity" value="2">
    <input name="bagging.quantity" value="3">
    <table><tbody>
      <tr>
        <td><input name="firing.0.productBrand"></td>
        <td><input name="firing.0.goodTonsWeighed"></td>
      </tr>
      <tr>
        <td><input name="firing.1.productBrand"></td>
        <td><input name="firing.1.goodTonsWeighed"></td>
      </tr>
      <tr>
        <td><input name="firing.2.productBrand" value="ША"></td>
        <td><input name="firing.2.goodTonsWeighed" value="12.3456"></td>
      </tr>
    </tbody></table>
  `);

  const invalidInputs = markRefractoryServerFieldErrors(form, [
    { fieldPath: "bagging.quantity", message: "Ошибка фасовки." },
    {
      fieldPath: "firing.0.goodTonsWeighed",
      message: "Ошибка первой заполненной строки.",
    },
  ]);

  assert.deepEqual(invalidInputs, [
    document.querySelector('[name="bagging.quantity"]'),
    document.querySelector('[name="firing.2.goodTonsWeighed"]'),
  ]);
  assert.equal(
    document.querySelector('[name="bunker.I.quantity"]')
      .hasAttribute("aria-invalid"),
    false,
  );
});

function buildForm(contents) {
  const dom = new JSDOM(`<form>${contents}</form>`);
  return {
    document: dom.window.document,
    form: dom.window.document.querySelector("form"),
  };
}
