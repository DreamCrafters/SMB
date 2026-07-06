import assert from "node:assert/strict";
import test from "node:test";
import {
  equipmentDowntimeReasonRequiresHoursMessage,
  equipmentDowntimeRequiresProductionMessage,
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

test("equipment payload validation requires production when downtime is under 8 hours", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(equipmentForm, {
      downtimeHours: "7",
      productionTons: "0",
    }),
    equipmentDowntimeRequiresProductionMessage,
  );
});

test("equipment payload validation accepts productive short downtime", () => {
  assert.equal(
    validateDispatcherPayloadForSubmit(equipmentForm, {
      downtimeReason: "Резерв",
      downtimeHours: "7",
      productionTons: "1",
    }),
    undefined,
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
