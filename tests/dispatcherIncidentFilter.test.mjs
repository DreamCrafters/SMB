import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const emptyProductionReportTables = {
  forming: [],
  sorting: [],
  unformed: [],
  chamotte: [],
  jars: [],
  granulation: [],
};

const emptyProductionReportTableTotals = {
  forming: { rowCount: 0 },
  sorting: { rowCount: 0 },
  unformed: { rowCount: 0 },
  chamotte: { rowCount: 0 },
  jars: { rowCount: 0 },
  granulation: { rowCount: 0 },
};

test("dispatcher incidents render every unclosed incident with one active filter", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { DispatcherFeedPanel } = await vite.ssrLoadModule("/src/App.tsx");
    const html = renderToStaticMarkup(
      React.createElement(DispatcherFeedPanel, {
        dispatcherFeed: {
          status: "ready",
          submissions: [
            buildSubmission("old-open", "incident", {
              incidentNumber: "INC-2025-1",
              datetime: "10.12.2025 10:00",
            }),
            buildSubmission("closed", "incident", {
              incidentNumber: "INC-2026-1",
              datetime: "01.07.2026 10:00",
            }),
            buildSubmission("closed-event", "incident_close", {
              incidentNumber: "INC-2026-1",
              closureDateTime: "02.07.2026 10:00",
            }),
          ],
          productionReportTables: emptyProductionReportTables,
          productionReportTableTotals: emptyProductionReportTableTotals,
          productionMonthOverview: null,
          openIncidents: [
            {
              incidentNumber: "INC-2025-1",
              openedAt: "10.12.2025 10:00",
            },
          ],
          bankContents: [],
          receivedAt: "2026-07-20T10:00:00.000Z",
          summary: { total: 3, byForm: [] },
          source: "remote",
        },
        dispatcherForms: { status: "loading", message: "" },
        filters: {
          group: "incidents",
          period: "current_month",
          dateFrom: "2026-07-01",
          dateTo: "2026-07-20",
          incidentView: "all_open",
        },
        onFiltersChange: () => {},
      }),
    );

    assert.match(html, /aria-pressed="true">Все незакрытые<\/button>/u);
    assert.match(html, /INC-2025-1/u);
    assert.doesNotMatch(html, /INC-2026-1/u);
    assert.doesNotMatch(html, /type="date"/u);
  } finally {
    await vite.close();
  }
});

function buildSubmission(id, formId, payload) {
  return {
    id,
    formId,
    formTitle: formId,
    payload,
    summary: id,
    status: "received",
    submittedByAccountId: "dispatcher",
    submittedAt: "2026-07-20T10:00:00.000Z",
    receivedAt: "2026-07-20T10:00:00.000Z",
  };
}
