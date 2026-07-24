import assert from "node:assert/strict";
import test from "node:test";
import {
  equipmentDowntimeHoursRequireReasonMessage,
  equipmentDowntimeMaxHoursMessage,
  equipmentDowntimeReasonRequiresHoursMessage,
  equipmentDowntimeRequiresProductionMessage,
  equipmentReserveDowntimeRequiresEightHoursMessage,
  incidentCloseRequiresOpenIncidentMessage,
  isProductionBrandRequiredForFact,
  productionBrandFactPairMessage,
  productionDuplicateBrandMessage,
  productionRequiresIndicatorMessage,
  visitorExitRequiresEntryMessage,
  validateDispatcherPayloadForSubmit,
} from "../.test-build/src/services/dispatcherPayloadValidation.js";

const equipmentForm = {
  id: "equipment",
  title: "Оборудование",
  sheetName: "Оборудование",
  fields: [],
};

const incidentForm = {
  id: "incident",
  title: "Инцидент",
  sheetName: "Инциденты",
  fields: [],
};

const visitorExitForm = {
  id: "visitor_exit",
  title: "Выход посетителя",
  sheetName: "Посетители",
  fields: [],
};

const incidentCloseForm = {
  id: "incident_close",
  title: "Закрытие инцидента",
  sheetName: "Инциденты",
  fields: [],
};

const productionForm = {
  id: "production",
  title: "Выработка",
  sheetName: "Выработка",
  fields: [
    { name: "reportDate", label: "Дата отчета", type: "date", required: true },
    { name: "formingDay", label: "Формовка — Сутки", type: "number", required: false },
  ],
};

test("equipment payload validation requires downtime hours when reason is selected", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(equipmentForm, {
      downtimeReason: "Резерв",
      downtimeHours: "0",
      productionTons: "10",
    }),
    equipmentDowntimeReasonRequiresHoursMessage,
  );
});

test("equipment payload validation requires downtime reason when hours are positive", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(equipmentForm, {
      downtimeHours: "7",
      productionTons: "10",
    }),
    equipmentDowntimeHoursRequireReasonMessage,
  );
});

test("equipment payload validation requires 8 hours when reserve reason is selected", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(equipmentForm, {
      downtimeReason: "Резерв",
      downtimeHours: "7",
      productionTons: "10",
    }),
    equipmentReserveDowntimeRequiresEightHoursMessage,
  );
});

test("equipment payload validation accepts reserve downtime at exactly 8 hours", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(equipmentForm, {
      downtimeReason: "Резерв",
      downtimeHours: "8",
    }),
    undefined,
  );
});

test("equipment payload validation requires production when downtime is under 8 hours", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(equipmentForm, {
      downtimeReason: "Замена марки/формы",
      downtimeHours: "7",
      productionTons: "0",
    }),
    equipmentDowntimeRequiresProductionMessage,
  );
});

test("equipment payload validation accepts productive short downtime", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(equipmentForm, {
      downtimeReason: "Замена марки/формы",
      downtimeHours: "7",
      productionTons: "1",
    }),
    undefined,
  );
});

test("equipment payload validation rejects downtime over 8 hours", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(equipmentForm, {
      downtimeReason: "Замена марки/формы",
      downtimeHours: "9",
      productionTons: "1",
    }),
    equipmentDowntimeMaxHoursMessage,
  );
});

test("dispatcher payload validation does not apply equipment rules to other forms", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(incidentForm, {
      downtimeReason: "Резерв",
      downtimeHours: "0",
    }),
    undefined,
  );
});

test("production payload validation requires at least one indicator", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(productionForm, {
      reportDate: "2026-07-16",
    }),
    productionRequiresIndicatorMessage,
  );

  assert.equal(
    validateDispatcherPayloadForSubmit(productionForm, {
      reportDate: "2026-07-16",
      formingDay: "12.5",
      formingProductBrand: "МКР-1",
    }),
    undefined,
  );
});

test("production payload validation requires a brand for every brand fact", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(productionForm, {
      reportDate: "2026-07-16",
      unformedFact1: "12.5",
    }),
    productionBrandFactPairMessage,
  );
  assert.equal(
    validateDispatcherPayloadForSubmit(productionForm, {
      reportDate: "2026-07-16",
      formingProductBrand: "МКР-1",
    }),
    productionBrandFactPairMessage,
  );
});

test("every filled production fact, including zero, requires a brand", () => {
  for (const fact of ["0", "12.5", " 3 "]) {
    assert.equal(isProductionBrandRequiredForFact(fact), true);
  }

  for (const fact of [undefined, "", "   "]) {
    assert.equal(isProductionBrandRequiredForFact(fact), false);
  }

  for (const payload of [
    { formingDay: "0" },
    { sortingDay: "5" },
    { unformedFact1: "7" },
    { chamotteFact1: "9" },
  ]) {
    assert.equal(
      validateDispatcherPayloadForSubmit(productionForm, {
        reportDate: "2026-07-16",
        ...payload,
      }),
      productionBrandFactPairMessage,
    );
  }
});

test("production payload validation rejects duplicate brands within a category", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(productionForm, {
      reportDate: "2026-07-16",
      unformedBrand1: "МКР-1",
      unformedFact1: "10",
      unformedBrand2: "  мкр-1  ",
      unformedFact2: "5",
    }),
    productionDuplicateBrandMessage,
  );
});

test("production payload validation applies dynamic column rules to forming and sorting", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(productionForm, {
      reportDate: "2026-07-16",
      formingBrand1: "ФЛ-1",
      formingFact1: "4",
      formingBrand2: " фл-1 ",
      formingFact2: "3",
    }),
    productionDuplicateBrandMessage,
  );
  assert.equal(
    validateDispatcherPayloadForSubmit(productionForm, {
      reportDate: "2026-07-16",
      sortingFact1: "0",
    }),
    productionBrandFactPairMessage,
  );
});

test("production payload validation allows a blank forming fact on weekends with sorting data", () => {
  for (const reportDate of ["2026-07-18", "2026-07-19"]) {
    assert.equal(
      validateDispatcherPayloadForSubmit(productionForm, {
        reportDate,
        formingBrand1: "ФЛ-1",
        sortingBrand1: "СО-1",
        sortingFact1: "5",
      }),
      undefined,
    );
  }

  assert.equal(
    validateDispatcherPayloadForSubmit(productionForm, {
      reportDate: "2026-07-20",
      formingBrand1: "ФЛ-1",
      sortingBrand1: "СО-1",
      sortingFact1: "5",
    }),
    productionBrandFactPairMessage,
  );
});

test("dynamic brand fact is a production indicator", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(productionForm, {
      reportDate: "2026-07-16",
      chamotteBrand7: "Шамот А",
      chamotteFact7: "8",
    }),
    undefined,
  );
});

test("visitor exit validation requires an open visitor entry id", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(visitorExitForm, {}),
    visitorExitRequiresEntryMessage,
  );
  assert.equal(
    validateDispatcherPayloadForSubmit(visitorExitForm, {
      visitorEntryId: "visitor-entry-id",
    }),
    undefined,
  );
});

test("incident close validation requires an open incident number", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(incidentCloseForm, {}),
    incidentCloseRequiresOpenIncidentMessage,
  );
  assert.equal(
    validateDispatcherPayloadForSubmit(incidentCloseForm, {
      incidentNumber: "INC-2026-1",
    }),
    undefined,
  );
});
