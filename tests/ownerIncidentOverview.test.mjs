import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("owner overview keeps new counters and restores operational sections", async () => {
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

    for (const text of [
      "Коротко с начала месяца",
      "Инциденты",
      "Всего за месяц",
      "Закрыто из них",
      "Сегодня",
      "Не закрыто сейчас",
      "Лаборатория",
      "Испытаний за месяц",
      "Испытаний сегодня",
      ">12<",
      ">8<",
      ">2<",
      ">4<",
      ">31<",
      ">3<",
      "Оборудование",
      "Работало",
      "Прессов - 2 шт",
      "Выработка",
      "46",
      "Посетители",
      "Было посетителей - 3 чел",
      "Фридману",
      "невышедших посетителей",
      "1 чел",
    ]) {
      assert.match(html, new RegExp(text, "u"));
    }

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
