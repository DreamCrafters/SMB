import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("owner incident cards share one ordered summary without duplicate timestamps", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const {
      formatOwnerIncidentAge,
      OwnerIncidentClosureOverviewBlock,
      OwnerIncidentOverviewBlock,
    } = await vite.ssrLoadModule("/src/App.tsx");
    const updatedAt = new Date().toISOString();
    const visitors = { count: 0, hosts: [], openCount: 0 };
    const incidentHtml = renderToStaticMarkup(
      React.createElement(OwnerIncidentOverviewBlock, {
        overview: {
          visitors,
          latestIncident: {
            updatedAt,
            incidentNumber: "INC-2026-4",
            dateTime: "18.07.2026 12:00",
            incidentType: "Пожар",
            location: "ЦПКУ",
            description: "Описание",
            criticality: "Высокий",
            responsible: "Диспетчер",
            immediateActions: "Оперативные меры",
            status: "Новый",
          },
        },
      }),
    );
    const closureHtml = renderToStaticMarkup(
      React.createElement(OwnerIncidentClosureOverviewBlock, {
        overview: {
          visitors,
          latestIncidentClosure: {
            updatedAt,
            incidentNumber: "INC-2026-4",
            incidentType: "Пожар",
            location: "ЦПКУ",
            rootCauses: "Корневая причина",
            preventiveMeasures: "Предотвращающие меры",
            closureDateTime: "18.07.2026 13:00",
            costs: "0",
            approvedBy: "Руководитель",
            closureNote: "Примечание",
            status: "Закрыт",
          },
        },
      }),
    );

    for (const html of [incidentHtml, closureHtml]) {
      const orderedLabels = [
        "Номер инцидента",
        "Тип инцидента",
        "Место (цех/участок)",
        "Статус",
      ];
      let previousIndex = -1;

      for (const label of orderedLabels) {
        const index = html.indexOf(label);

        assert.ok(index > previousIndex, `${label} должен идти после предыдущего пункта`);
        previousIndex = index;
      }

      assert.match(html, /сегодня/iu);
    }

    assert.doesNotMatch(incidentHtml, /Дата и время инцидента/iu);
    assert.doesNotMatch(closureHtml, /Дата и время закрытия/iu);
    assert.match(closureHtml, /Пожар/u);
    assert.match(closureHtml, /ЦПКУ/u);
    assert.equal(
      formatOwnerIncidentAge(
        "2026-07-18T08:00:00",
        new Date(2026, 6, 18, 12, 0, 0),
      ),
      "сегодня",
    );
    assert.equal(
      formatOwnerIncidentAge(
        "2026-07-17T08:00:00",
        new Date(2026, 6, 18, 12, 0, 0),
      ),
      "1 день назад",
    );
    assert.equal(
      formatOwnerIncidentAge(
        "2026-07-16T08:00:00",
        new Date(2026, 6, 18, 12, 0, 0),
      ),
      "2 дня назад",
    );
    assert.equal(
      formatOwnerIncidentAge(
        "2026-07-13T08:00:00",
        new Date(2026, 6, 18, 12, 0, 0),
      ),
      "5 дней назад",
    );
  } finally {
    await vite.close();
  }
});
