import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

test.after(async () => {
  await vite.close();
});

/**
 * Доработка задачи 77: тумблер «Посетители» должности должен скрывать раздел
 * и в `Диспетчерской`, иначе должность без посетителей (начальник
 * производства) видит их данные, как только получает эту вкладку.
 */
test("dispatcher feed hides the visitors group for a position without the capability", async () => {
  const { DispatcherFeedPanel } = await vite.ssrLoadModule("/src/App.tsx");

  const restrictedHtml = renderToStaticMarkup(
    React.createElement(DispatcherFeedPanel, {
      ...buildPanelProps(),
      canViewVisitors: false,
    }),
  );
  const restricted = new JSDOM(restrictedHtml).window.document;

  assert.deepEqual(readGroupTabs(restricted), [
    "Выработка",
    "Оборудование",
    "Инциденты",
  ]);
  assert.equal(restricted.querySelector(".visitor-summary-table"), null);
  assert.doesNotMatch(restrictedHtml, /Фридману/u);

  const allowedHtml = renderToStaticMarkup(
    React.createElement(DispatcherFeedPanel, {
      ...buildPanelProps(),
      canViewVisitors: true,
    }),
  );

  assert.deepEqual(readGroupTabs(new JSDOM(allowedHtml).window.document), [
    "Выработка",
    "Оборудование",
    "Инциденты",
    "Посетители",
  ]);
});

/**
 * Рабочее место диспетчера само вносит визиты и капабилити обзора не имеет,
 * поэтому без явного запрета раздел остаётся на месте.
 */
test("dispatcher feed keeps the visitors group when no restriction is passed", async () => {
  const { DispatcherFeedPanel } = await vite.ssrLoadModule("/src/App.tsx");
  const html = renderToStaticMarkup(
    React.createElement(DispatcherFeedPanel, buildPanelProps()),
  );

  assert.deepEqual(readGroupTabs(new JSDOM(html).window.document), [
    "Выработка",
    "Оборудование",
    "Инциденты",
    "Посетители",
  ]);
});

/**
 * Раздел мог остаться выбранным ещё до снятия тумблера, поэтому лента
 * обязана откатиться на «Выработку», а не показать данные посетителей.
 */
test("dispatcher feed falls back to production when visitors stay selected without access", async () => {
  const { DispatcherFeedPanel } = await vite.ssrLoadModule("/src/App.tsx");
  const html = renderToStaticMarkup(
    React.createElement(DispatcherFeedPanel, {
      ...buildPanelProps({ group: "visitors" }),
      canViewVisitors: false,
    }),
  );
  const document = new JSDOM(html).window.document;

  assert.doesNotMatch(html, /Фридману/u);
  assert.equal(
    document.querySelector(".dispatcher-feed-group-button.is-active")
      ?.textContent,
    "Выработка",
  );
});

function buildPanelProps({ group = "production" } = {}) {
  return {
    dispatcherFeed: {
      status: "ready",
      source: "remote",
      submissions: [
        {
          id: "visit-1",
          formId: "visitors",
          submittedAt: "2026-07-23T09:00:00.000Z",
          values: {
            reportDate: "23.07.2026",
            visitorName: "Иванов",
            hostName: "Фридману",
            arrivedAt: "09:00",
          },
        },
      ],
      summary: { total: 1, byForm: { visitors: 1 } },
      productionReportTables: {
        forming: [],
        sorting: [],
        unformed: [],
        chamotte: [],
        jars: [],
        granulation: [],
      },
      productionReportTableTotals: {
        forming: { rowCount: 0 },
        sorting: { rowCount: 0 },
        unformed: { rowCount: 0 },
        chamotte: { rowCount: 0 },
        jars: { rowCount: 0 },
        granulation: { rowCount: 0 },
      },
      bankContents: [],
      openIncidents: [],
      receivedAt: "2026-07-23T12:00:00.000Z",
    },
    dispatcherForms: { status: "ready", forms: [] },
    filters: {
      group,
      period: "current_month",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      incidentView: "period",
    },
    onFiltersChange: () => {},
  };
}

function readGroupTabs(document) {
  return Array.from(
    document.querySelectorAll(".dispatcher-feed-group-button"),
    (button) => button.textContent,
  );
}
