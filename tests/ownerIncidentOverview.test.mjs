import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("owner overview renders every operational section as glanceable metrics", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { OwnerOverviewPanel } = await vite.ssrLoadModule("/src/App.tsx");
    const html = renderToStaticMarkup(
      React.createElement(OwnerOverviewPanel, {
        businessOverview: {
          status: "ready",
          overview: {
            period: {
              monthStart: "2026-07-01",
              today: "2026-07-23",
            },
            incidents: {
              monthTotal: 12,
              monthClosed: 8,
              todayTotal: 2,
              openNow: 4,
            },
            laboratory: {
              monthTotal: 31,
              todayTotal: 3,
              sampled: { monthTotal: 18, todayTotal: 2 },
              chemicalAnalyses: { monthTotal: 14, todayTotal: 1 },
              rotaryKiln2Readings: { monthTotal: 62, todayTotal: 4 },
            },
            receivedAt: "2026-07-23T12:00:00.000Z",
          },
        },
        dispatcherFeed: {
          status: "ready",
          source: "remote",
          submissions: [],
          summary: {
            total: 0,
            byForm: {},
          },
          receivedAt: "2026-07-23T12:00:00.000Z",
        },
        dispatcherOverview: {
          production: {
            month: "2026-07",
            totalFact: 46,
            forming: { monthFact: 19, todayFact: 11 },
            sorting: { monthFact: 12, todayFact: 7 },
            unformed: { monthFact: 7, todayFact: 5 },
            chamotte: { monthFact: 8, todayFact: 5 },
            granulation: { monthFact: 9, todayFact: 5.5 },
          },
          equipment: {
            updatedAt: "2026-07-23T11:30:00.000Z",
            reportDate: "2026-07-23",
            workingCounts: [
              {
                key: "press",
                label: "Прессов",
                count: 2,
              },
            ],
          },
          visitors: {
            latestDate: "2026-07-23",
            count: 3,
            hosts: ["Фридману"],
            openCount: 1,
          },
        },
      }),
    );
    const document = new JSDOM(html).window.document;

    assert.match(html, /Коротко с начала месяца/u);
    assert.deepEqual(readOverviewMetrics(document, "Инциденты"), [
      ["Всего за месяц", "12"],
      ["Закрыто из них", "8"],
      ["Сегодня", "2"],
      ["Не закрыто сейчас", "4"],
    ]);
    assert.deepEqual(readOverviewMetrics(document, "Лаборатория"), [
      ["Испытаний за месяц", "31"],
      ["Испытаний сегодня", "3"],
      ["Отобранных проб за месяц", "18"],
      ["Отобранных проб сегодня", "2"],
      ["Химанализов за месяц", "14"],
      ["Химанализов сегодня", "1"],
      ["Показаний печи 2 за месяц", "62"],
      ["Показаний печи 2 сегодня", "4"],
    ]);
    assert.deepEqual(readOverviewHeadingMeta(document, "Оборудование"), [
      "Последний отчёт",
      "23.07.2026",
    ]);
    assert.deepEqual(readOverviewMetrics(document, "Оборудование"), [
      ["Работало прессов", "2"],
    ]);
    assert.deepEqual(readOverviewMetrics(document, "Выработка"), [
      ["Отформовано с начала месяца, т", "19"],
      ["Отформовано сегодня, т", "11"],
      ["Отсортировано с начала месяца, т", "12"],
      ["Отсортировано сегодня, т", "7"],
      ["Неформованной продукции с начала месяца, т", "7"],
      ["Неформованной продукции сегодня, т", "5"],
      ["Шамота с начала месяца, т", "8"],
      ["Шамота сегодня, т", "5"],
      ["Гранулировано с начала месяца, т", "9"],
      ["Гранулировано сегодня, т", "5,5"],
    ]);
    assert.deepEqual(readOverviewHeadingMeta(document, "Посетители"), [
      "Последний день посещений",
      "23.07.2026",
    ]);
    assert.deepEqual(readOverviewMetrics(document, "Посетители"), [
      ["Посетителей в этот день", "3"],
      ["Не вышли сейчас", "1"],
    ]);
    assert.match(html, /Обновлено: 23\.07\.2026/u);
    assert.match(html, /К кому приходили: Фридману/u);
    assert.ok(
      document
        .querySelector('section[aria-label="Посетители"]')
        ?.querySelector(".owner-overview-metric-attention"),
    );

    for (const removedIncidentCard of [
      "Последний инцидент",
      "Последнее закрытие инцидента",
    ]) {
      assert.doesNotMatch(html, new RegExp(removedIncidentCard, "u"));
    }
  } finally {
    await vite.close();
  }
});

function readOverviewMetrics(document, sectionLabel) {
  const section = document.querySelector(
    `section[aria-label="${sectionLabel}"]`,
  );
  assert.ok(section, `Missing overview section: ${sectionLabel}`);

  return Array.from(
    section.querySelectorAll(".owner-overview-metrics > div"),
    (metric) => [
      metric.querySelector("dt")?.textContent,
      metric.querySelector("dd")?.textContent,
    ],
  );
}

function readOverviewHeadingMeta(document, sectionLabel) {
  const section = document.querySelector(
    `section[aria-label="${sectionLabel}"]`,
  );
  assert.ok(section, `Missing overview section: ${sectionLabel}`);

  const headingMeta = section.querySelector(".owner-overview-heading-meta");
  assert.ok(headingMeta, `Missing overview heading meta: ${sectionLabel}`);

  return [
    headingMeta.querySelector("span")?.textContent,
    headingMeta.querySelector("strong")?.textContent,
  ];
}
