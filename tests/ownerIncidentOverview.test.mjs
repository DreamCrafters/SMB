import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("owner overview renders only the requested incident and laboratory counters", async () => {
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
    ]) {
      assert.match(html, new RegExp(text, "u"));
    }

    for (const removedSection of [
      "Оборудование",
      "Выработка",
      "Последний инцидент",
      "Посетители",
    ]) {
      assert.doesNotMatch(html, new RegExp(removedSection, "u"));
    }
  } finally {
    await vite.close();
  }
});
