import assert from "node:assert/strict";
import test from "node:test";
import {
  equipmentDowntimeHoursRequireReasonMessage,
  equipmentDowntimeMaxHoursMessage,
  equipmentDowntimeReasonRequiresHoursMessage,
  equipmentDowntimeRequiresProductionMessage,
  equipmentReserveDowntimeRequiresEightHoursMessage,
  incidentCloseRequiresOpenIncidentMessage,
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
