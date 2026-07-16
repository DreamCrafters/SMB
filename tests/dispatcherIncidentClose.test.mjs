import assert from "node:assert/strict";
import test from "node:test";
import {
  incidentClosedWhileEditingMessage,
  initialIncidentCloseSelectionState,
  reduceIncidentCloseSelection,
} from "../.test-build/src/services/dispatcherIncidentClose.js";

const firstIncident = {
  incidentNumber: "INC-2026-1",
  label: "INC-2026-1",
  openedAt: "16.07.2026, 10:00",
  location: "Цех 1",
};
const secondIncident = {
  incidentNumber: "INC-2026-2",
  label: "INC-2026-2",
  openedAt: "16.07.2026, 11:00",
  location: "Цех 2",
};

test("incident close flow opens the form after selection and returns to the list", () => {
  const selected = reduceIncidentCloseSelection(
    initialIncidentCloseSelectionState,
    { type: "select", incident: firstIncident },
  );

  assert.equal(selected.selectedIncident, firstIncident);
  assert.equal(selected.notice, "");
  assert.deepEqual(reduceIncidentCloseSelection(selected, { type: "reset" }), {
    notice: "",
  });
});

test("incident close flow preserves the selected form during a feed error", () => {
  const selected = reduceIncidentCloseSelection(
    initialIncidentCloseSelectionState,
    { type: "select", incident: firstIncident },
  );

  assert.equal(
    reduceIncidentCloseSelection(selected, { type: "feed_unavailable" }),
    selected,
  );
  assert.equal(
    reduceIncidentCloseSelection(selected, {
      type: "feed_ready",
      openIncidents: [firstIncident, secondIncident],
    }),
    selected,
  );
});

test("incident close flow returns to the list when another user closes the incident", () => {
  const selected = reduceIncidentCloseSelection(
    initialIncidentCloseSelectionState,
    { type: "select", incident: firstIncident },
  );
  const reconciled = reduceIncidentCloseSelection(selected, {
    type: "feed_ready",
    openIncidents: [secondIncident],
  });

  assert.equal(reconciled.selectedIncident, undefined);
  assert.equal(reconciled.notice, incidentClosedWhileEditingMessage);
});
