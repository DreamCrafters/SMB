import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const DOM_GLOBAL_NAMES = [
  "document",
  "Element",
  "Event",
  "FormData",
  "HTMLElement",
  "HTMLInputElement",
  "MouseEvent",
  "navigator",
  "Node",
  "window",
  "IS_REACT_ACT_ENVIRONMENT",
];

const reference = {
  direction: [{ code: "production", label: "Производство" }, { code: "legacy", label: "Старое направление", archived: true }],
  effect_type: [{ code: "cost_saving", label: "Экономия затрат" }],
  risk_level: [{ code: "high", label: "Высокий", significant: true }],
  site: [],
  kpi: [],
};
const people = [
  { id: "account:owner", displayName: "Петров П.П.", position: "Член Коллегии", hasInitiativesTab: true },
  { id: "account:outsider", displayName: "Сидоров С.С.", position: "Мастер", hasInitiativesTab: false },
];

const detailExtras = {
  economics: {
    annualEffect: "1200000.00", annualRecurringCost: "0.00", netAnnualEffect: "1200000.00",
    oneTimeCosts: "600000.00", paybackStatus: "payback", paybackMonths: "6.0", roiPercent: "200.0",
    source: "express", npv: "", npvRequired: false, overrides: {},
  },
  passportReasons: [{ code: "capex", label: "Требуется CAPEX" }],
  passportGaps: ["Затраты: CAPEX, разовые и постоянные OPEX"],
  canEditPassport: false,
};

function buildInitiative(card) {
  return {
    id: "initiative-1",
    number: "И-2026-0001",
    status: "draft",
    revision: 1,
    card: {
      title: "", initiatorId: "account:author", directionCode: "", directionLabel: "",
      effectTypeCodes: [], effectTypeLabels: [], problem: "", baselineValue: "",
      baselinePeriod: "", baselineSource: "", solution: "", changeScope: "",
      expectedEffectAmount: "", expectedEffectPeriod: "", expectedEffectKind: "",
      effectMethod: "", oneTimeCostAmount: "", oneTimeCostVat: "", oneTimeCostSource: "",
      recurringCostAmount: "", recurringCostPeriod: "", internalResources: "",
      ownerId: "", executorId: "", executionControllerId: "", effectControllerId: "",
      plannedStart: "", plannedResult: "", kpiCriterion: "", kpiSource: "", risks: [],
      requestedDecision: "", capexAmount: "", changesTechnology: "", newProductOrMarket: "",
      boardDecisionRequired: "", ...card,
    },
    workflow: {},
    createdByUserId: "author",
    createdAt: "2026-10-05T09:00:00.000Z",
    updatedAt: "2026-10-05T09:00:00.000Z",
  };
}

// One Vite SSR server per file: managed Jino kills files that keep several.
let sharedVite;
async function loadWorkspaceModule() {
  sharedVite ??= await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  return sharedVite.ssrLoadModule("/src/CollegiumInitiatives.tsx");
}

test.after(async () => {
  await sharedVite?.close();
});

async function renderWorkspace(permissions, onRequest, attentionItems = []) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { CollegiumInitiativesWorkspace } = await loadWorkspaceModule();
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), "http://127.0.0.1:5173/");
    if (url.pathname === "/api/collegium-initiatives/attention") return jsonResponse({ items: attentionItems });
    return jsonResponse(...await onRequest(url, init, permissions));
  };
  const container = dom.window.document.querySelector("#root");
  const root = createRoot(container);
  await React.act(async () => {
    root.render(React.createElement(CollegiumInitiativesWorkspace, {
      profile: { userId: "author", displayName: "Автор", activeAccess: { navigationItems: [], capabilities: [] } },
      onShowToast: () => {},
    }));
  });
  return {
    dom, React, container,
    async cleanup() {
      await React.act(async () => root.unmount());
      globalThis.fetch = previousFetch;
      dom.window.close();
      restoreDomGlobals(previousGlobals);
    },
  };
}

test("participant creates a draft and opens its card from the registry", async () => {
  let stored;
  const posts = [];
  const actions = [];
  const view = await renderWorkspace(
    { canView: true, canParticipate: true, canManage: false, canApprove: false },
    async (url, init, permissions) => {
      if (url.pathname === "/api/collegium-initiatives/initiative-1/actions") {
        const body = JSON.parse(String(init.body));
        actions.push(body);
        stored = { ...stored, status: "preliminary_review", revision: stored.revision + 1 };
        return [{ initiative: stored }];
      }
      if (url.pathname === "/api/collegium-initiatives" && init.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        // Like the server: the stored risk carries the level label.
        stored = buildInitiative({
          ...body.card,
          expectedEffectAmount: "1200.50",
          risks: body.card.risks.map((risk) => ({ ...risk, levelLabel: "Высокий" })),
        });
        return [{ initiative: stored }, 201];
      }
      if (url.pathname === "/api/collegium-initiatives") {
        return [{ initiatives: stored === undefined ? [] : [stored], people, reference, permissions, meetings: [], overdueIds: [] }];
      }
      if (url.pathname === "/api/collegium-initiatives/initiative-1") {
        return [{
          initiative: stored,
          revisions: [{ revision: 1, createdAt: stored.createdAt, authorDisplayName: "Автор", status: "draft", changedFields: [], reason: "Создание инициативы", comment: "", card: stored.card }],
          comments: [],
          attachments: [{ id: "link-1", kind: "link", label: "Данные ОТК", url: "https://drive.google.com/x", createdByDisplayName: "Автор", createdAt: stored.createdAt }],
          canAttach: stored.status === "draft",
          canEdit: stored.status === "draft",
          canComment: true,
          canResolveComments: true,
          actions: stored.status === "draft" ? ["submit_for_review", "withdraw"] : [],
          missingAdmissionFields: ["Описание проблемы / возможности", "Ключевые риски"],
          linkedAssignments: [],
          summaryStatus: "not_started",
          canCreateAssignments: false,
          canRecordResult: false, ...detailExtras,
        }];
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    },
  );
  const { dom, React, container } = view;
  try {
    await waitFor(React, () => container.textContent.includes("Инициатив пока нет."));
    await React.act(async () => findButtonByText(container, "Новая инициатива").click());
    const form = container.querySelector(".collegium-form");
    assert.ok(form);
    // Archived reference values are not offered for a new card.
    assert.doesNotMatch(form.textContent, /Старое направление/u);
    // Only accounts with the initiatives tab can be assigned.
    const ownerSelect = Array.from(form.querySelectorAll("label")).find(
      (label) => label.querySelector(":scope > span")?.textContent === "Владелец результата",
    ).querySelector("select");
    assert.deepEqual(
      Array.from(ownerSelect.options).map((option) => option.value),
      ["", "account:owner"],
    );
    // A participant cannot pick another initiator.
    assert.equal(form.textContent.includes("Инициатор"), false);

    await React.act(async () => {
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.match(form.textContent, /Укажите наименование идеи/u);
    assert.deepEqual(posts, []);

    const title = Array.from(form.querySelectorAll("label")).find(
      (label) => label.querySelector(":scope > span")?.textContent === "Наименование идеи",
    ).querySelector("input");
    const amount = Array.from(form.querySelectorAll("label")).find(
      (label) => label.querySelector(":scope > span")?.textContent === "Ожидаемый эффект, ₽",
    ).querySelector("input");
    await React.act(async () => {
      setNativeInputValue(title, "Снизить потери при выпуске");
      title.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      setNativeInputValue(amount, "1 200,5");
      amount.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      setNativeInputValue(ownerSelect, "account:owner");
      ownerSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    const field = (label) => Array.from(form.querySelectorAll("label")).find(
      (item) => item.querySelector(":scope > span")?.textContent === label,
    ).querySelector("input, select");
    await React.act(async () => {
      const period = field("Период эффекта");
      setNativeInputValue(period, "year");
      period.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      const risk = field("Риск 1");
      setNativeInputValue(risk, "Срыв поставок");
      risk.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await React.act(async () => {
      const level = field("Уровень риска 1");
      setNativeInputValue(level, "high");
      level.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await React.act(async () => {
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(React, () => container.querySelector(".collegium-revisions-table") !== null);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].card.title, "Снизить потери при выпуске");
    assert.equal(posts[0].card.expectedEffectAmount, "1 200,5");
    assert.equal(posts[0].card.ownerId, "account:owner");
    assert.equal(posts[0].card.expectedEffectPeriod, "year");
    // Empty risk slots are dropped; a risk carries its level code.
    assert.deepEqual(posts[0].card.risks, [{ text: "Срыв поставок", levelCode: "high" }]);
    assert.equal(posts[0].revision, undefined);
    assert.match(container.textContent, /И-2026-0001/u);
    assert.match(container.textContent, /Черновик/u);
    assert.match(container.textContent, /Петров П\.П\./u);
    assert.match(container.textContent, /1\s200,50\s₽/u);
    // The economics and the passport requirement come from the server.
    assert.match(container.textContent, /ROI200,0 %/u);
    assert.match(container.textContent, /Срок окупаемости6,0 мес\./u);
    assert.match(container.textContent, /требуется: требуется capex/u);

    const link = Array.from(container.querySelectorAll(".collegium-attachments a"))[0];
    assert.equal(link.textContent, "Данные ОТК");
    assert.equal(link.getAttribute("rel"), "noreferrer noopener");
    // The server-computed admission gaps are listed on the card.
    assert.match(container.textContent, /Для вынесения на Коллегию не хватает:/u);
    assert.match(container.textContent, /Ключевые риски/u);
    await React.act(async () => findButtonByText(container, "Отправить на оценку").click());
    await React.act(async () => findButtonByText(container, "Подтвердить").click());
    await waitFor(React, () => container.textContent.includes("На предварительной оценке"));
    assert.deepEqual(actions, [{ action: "submit_for_review", revision: 1 }]);
    assert.equal(
      Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "Изменить"),
      false,
    );

    await React.act(async () => findButtonByText(container, "К реестру").click());
    await waitFor(React, () => container.querySelector(".collegium-initiatives-table") !== null);
    assert.ok(findButtonByText(container, "И-2026-0001"));
  } finally {
    await view.cleanup();
  }
});

test("an approved initiative creates a linked collegium assignment with protocol details", async () => {
  let stored = {
    ...buildInitiative({
      title: "Пилот обжига",
      executorId: "account:owner",
      plannedResult: "2026-12-01",
      kpiCriterion: "Потери не выше 1,5 %",
    }),
    status: "approved_pilot",
    revision: 6,
    workflow: {
      lastDecision: {
        meetingId: "m-1", meetingNumber: "КЗ-2026-01", meetingDate: "2026-10-12",
        protocolNumber: "КЗ-2026-01", itemOrder: 2, decision: "pilot",
      },
    },
  };
  const created = [];
  const view = await renderWorkspace(
    { canView: true, canParticipate: true, canManage: true, canApprove: false },
    async (url, init, permissions) => {
      if (url.pathname === "/api/collegium-assignments" && init.method === "POST") {
        created.push(JSON.parse(String(init.body)));
        stored = { ...stored, status: "in_progress", revision: 7 };
        return [{ assignment: { id: "a-1", number: "К-15" } }, 201];
      }
      if (url.pathname === "/api/collegium-initiatives") {
        return [{ initiatives: [stored], people, reference, permissions, meetings: [], overdueIds: [] }];
      }
      if (url.pathname === "/api/collegium-initiatives/initiative-1") {
        return [{
          initiative: stored,
          revisions: [],
          comments: [],
          attachments: [],
          canAttach: false,
          canEdit: false,
          canComment: true,
          canResolveComments: false,
          actions: [],
          missingAdmissionFields: [],
          linkedAssignments: stored.status === "in_progress"
            ? [{ id: "a-1", number: "К-15", summary: "Пилот", status: "in_progress", deadline: "2026-12-01", completedOn: "", responsibleName: "Петров П.П.", isOverdue: false }]
            : [],
          summaryStatus: stored.status === "in_progress" ? "in_pilot" : "in_preparation",
          canCreateAssignments: true,
          canRecordResult: stored.status === "in_progress",
          ...detailExtras,
        }];
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    },
  );
  const { dom, React, container } = view;
  try {
    await waitFor(React, () => container.querySelector(".collegium-initiatives-table") !== null);
    await React.act(async () => findButtonByText(container, "И-2026-0001").click());
    await waitFor(React, () => container.textContent.includes("Исполнение"));
    assert.match(container.textContent, /протокол № КЗ-2026-01 от 12\.10\.2026, вопрос 2/u);
    await React.act(async () => findButtonByText(container, "Создать поручение").click());
    const form = container.querySelector(".collegium-implementation .collegium-action-form");
    await React.act(async () => {
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(React, () => container.textContent.includes("К-15"));
    assert.equal(created.length, 1);
    const { assignment, comment } = created[0];
    assert.equal(comment, "Создано из инициативы И-2026-0001");
    assert.equal(assignment.sourceInitiativeId, "initiative-1");
    assert.equal(assignment.responsibleId, "account:owner");
    assert.deepEqual(
      [assignment.activeFrom, assignment.activeTo, assignment.recurrence],
      ["2026-12-01", "2026-12-01", "once"],
    );
    assert.deepEqual(
      [assignment.meetingDate, assignment.protocolNumber, assignment.decisionNumber],
      ["2026-10-12", "КЗ-2026-01", "2"],
    );
    assert.match(assignment.note, /Потери не выше 1,5 %/u);
    assert.match(container.textContent, /В пилоте/u);
    assert.ok(findButtonByText(container, "Внести фактический результат"));
  } finally {
    await view.cleanup();
  }
});

test("registry filters and exports are applied by the server", async () => {
  const listQueries = [];
  const downloads = [];
  const view = await renderWorkspace(
    { canView: true, canParticipate: false, canManage: false, canApprove: false },
    async (url, _init, permissions) => {
      if (url.pathname === "/api/collegium-initiatives") {
        listQueries.push(url.search);
        return [{ initiatives: [buildInitiative({ title: "Идея" })], people, reference, permissions, meetings: [], overdueIds: ["initiative-1"] }];
      }
      if (url.pathname === "/api/collegium-initiatives/export.xlsx") {
        downloads.push(url.search);
        return [{ error: { message: "Выгрузка недоступна." } }, 403];
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    },
  );
  const { dom, React, container } = view;
  try {
    await waitFor(React, () => container.querySelector(".collegium-initiatives-table") !== null);
    assert.match(container.textContent, /просрочены поручения/u);
    const status = Array.from(container.querySelectorAll("label")).find(
      (label) => label.querySelector(":scope > span")?.textContent === "Статус",
    ).querySelector("select");
    await React.act(async () => {
      setNativeInputValue(status, "ready");
      status.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    // Nothing is requested before the filters are applied.
    assert.deepEqual(listQueries, [""]);
    await React.act(async () => findButtonByText(container, "Применить").click());
    await waitFor(React, () => listQueries.length === 2);
    assert.equal(listQueries[1], "?status=ready");
    await React.act(async () => findButtonByText(container, "Выгрузить в Excel").click());
    await waitFor(React, () => container.textContent.includes("Выгрузка недоступна."));
    assert.deepEqual(downloads, ["?status=ready"]);
  } finally {
    await view.cleanup();
  }
});

test("the attention panel lists server-computed actions and opens the card", async () => {
  const stored = buildInitiative({ title: "Идея на оценке" });
  const view = await renderWorkspace(
    { canView: true, canParticipate: true, canManage: true, canApprove: true },
    async (url, _init, permissions) => {
      if (url.pathname === "/api/collegium-initiatives") {
        return [{ initiatives: [stored], people, reference, permissions, meetings: [], overdueIds: [] }];
      }
      if (url.pathname === "/api/collegium-initiatives/initiative-1") {
        return [{
          initiative: stored, revisions: [], comments: [], attachments: [], canAttach: false, canEdit: false,
          canComment: false, canResolveComments: false, actions: [], missingAdmissionFields: [],
          linkedAssignments: [], summaryStatus: "in_preparation", canCreateAssignments: false, canRecordResult: false, ...detailExtras,
        }];
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    },
    [{ initiativeId: "initiative-1", number: "И-2026-0001", title: "Идея на оценке", reason: "Ждёт допуска к рассмотрению Коллегией" }],
  );
  const { React, container } = view;
  try {
    await waitFor(React, () => container.querySelector(".collegium-attention") !== null);
    assert.match(container.textContent, /Требует моего действия: 1/u);
    assert.match(container.textContent, /Ждёт допуска к рассмотрению Коллегией/u);
    await React.act(async () => findButtonByText(container, "И-2026-0001 «Идея на оценке»").click());
    await waitFor(React, () => container.querySelector(".collegium-revisions-table") !== null);
  } finally {
    await view.cleanup();
  }
});

test("the dashboard shows server figures with labelled effect bars and opens a card", async () => {
  const stored = buildInitiative({ title: "Экономия газа" });
  const ref = { id: "initiative-1", number: "И-2026-0001", title: "Экономия газа" };
  const view = await renderWorkspace(
    { canView: true, canParticipate: false, canManage: false, canApprove: false },
    async (url, _init, permissions) => {
      if (url.pathname === "/api/collegium-initiatives") {
        return [{ initiatives: [stored], people, reference, permissions, meetings: [], overdueIds: [] }];
      }
      if (url.pathname === "/api/collegium-initiatives/dashboard") {
        return [{
          dashboard: {
            generatedOn: "2026-10-05", total: 1, statusCounts: [{ status: "in_progress", count: 1 }],
            awaitingReview: 0, rework: 2, reworkOverdue: 1, inPilot: 0, inImplementation: 1, overdueAssignments: 3,
            plannedEffect: "1500000.00", confirmedEffect: "250000.50",
            effectByDirection: [{ directionLabel: "Энергия", planned: "1500000.00", confirmed: "250000.50" }],
            nextMeeting: { id: "m", number: "КЗ-2026-02", meetingDate: "2026-10-12", meetingTime: "10:00", items: [ref] },
            unconfirmed: [], boardDecisions: [],
            topByEffect: [{ ...ref, expectedEffect: "1500000.00", status: "in_progress" }],
            topRisks: [{ ...ref, risk: "Рост цен на газ", expectedEffect: "1500000.00" }],
          },
        }];
      }
      if (url.pathname === "/api/collegium-initiatives/initiative-1") {
        return [{
          initiative: stored, revisions: [], comments: [], attachments: [], canAttach: false, canEdit: false,
          canComment: false, canResolveComments: false, actions: [], missingAdmissionFields: [],
          linkedAssignments: [], summaryStatus: "in_preparation", canCreateAssignments: false, canRecordResult: false, ...detailExtras,
        }];
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    },
  );
  const { React, container } = view;
  try {
    await waitFor(React, () => container.querySelector(".collegium-initiatives-table") !== null);
    await React.act(async () => findButtonByText(container, "Дашборд").click());
    await waitFor(React, () => container.querySelector(".collegium-dashboard") !== null);
    assert.match(container.textContent, /просрочено: 1/u);
    assert.match(container.textContent, /КЗ-2026-02: 12\.10\.2026 в 10:00/u);
    assert.match(container.textContent, /Рост цен на газ/u);
    // Both series carry a legend and printed values, not colour alone.
    assert.match(container.querySelector(".collegium-dashboard-legend").textContent, /Плановый.*Подтверждённый/u);
    const confirmedBar = container.querySelector(".collegium-bar.is-confirmed");
    assert.match(confirmedBar.style.width, /^16\.66/u);
    assert.match(confirmedBar.closest("tr").textContent, /250\s000,50/u);
    await React.act(async () => findButtonByText(container, "И-2026-0001 «Экономия газа»").click());
    await waitFor(React, () => container.querySelector(".collegium-revisions-table") !== null);
  } finally {
    await view.cleanup();
  }
});

test("the secretary edits thresholds and reference values on the settings tab", async () => {
  const requests = [];
  const settings = {
    oneTimeCostThreshold: "", capexThreshold: "", paybackNormMonths: "24", discountRatePercent: "",
    criticalImportance: ["Высокая"], revision: 3, updatedByDisplayName: "Председатель", updatedAt: "2026-10-05T09:00:00.000Z",
  };
  const view = await renderWorkspace(
    { canView: true, canParticipate: true, canManage: true, canApprove: false },
    async (url, init, permissions) => {
      if (url.pathname === "/api/collegium-initiatives") {
        return [{ initiatives: [], people, reference, permissions, meetings: [], overdueIds: [] }];
      }
      if (url.pathname === "/api/collegium-settings") {
        return [{ settings, reference, canEditReference: true, canEditSettings: false }];
      }
      if (url.pathname.startsWith("/api/collegium-settings/reference")) {
        requests.push([init.method, url.pathname, JSON.parse(init.body)]);
        return [{ reference }, init.method === "POST" ? 201 : 200];
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    },
  );
  const { dom, React, container } = view;
  try {
    await waitFor(React, () => container.querySelector(".collegium-section-tabs") !== null);
    await React.act(async () => findButtonByText(container, "Настройки").click());
    await waitFor(React, () => container.querySelector(".collegium-reference-table") !== null);
    // Thresholds are read-only below the chair level.
    const payback = Array.from(container.querySelectorAll("label")).find((label) =>
      label.textContent.includes("Норматив срока окупаемости")).querySelector("input");
    assert.equal(payback.value, "24");
    assert.equal(payback.disabled, true);
    assert.match(container.textContent, /Пороги и параметры меняет председатель/u);
    assert.match(container.querySelector(".collegium-reference-table").textContent, /Старое направлениеВ архиве/u);

    await React.act(async () => findButtonByText(container, "Вернуть").click());
    const input = Array.from(container.querySelectorAll("label")).find((label) =>
      label.textContent.startsWith("Новое значение")).querySelector("input");
    await React.act(async () => {
      setNativeInputValue(input, "Логистика");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await React.act(async () => findButtonByText(container, "Добавить").click());
    await waitFor(React, () => requests.length === 2);
    assert.deepEqual(requests, [
      ["PATCH", "/api/collegium-settings/reference/direction/legacy", { archived: false }],
      ["POST", "/api/collegium-settings/reference", { kind: "direction", label: "Логистика" }],
    ]);
  } finally {
    await view.cleanup();
  }
});

test("the owner fills the full passport of a pilot from the card", async () => {
  let stored = { ...buildInitiative({ title: "Пилот обжига", ownerId: "account:author" }), status: "approved_pilot", revision: 5 };
  const puts = [];
  const detail = () => ({
    initiative: stored, revisions: [], comments: [], attachments: [], canAttach: false, canEdit: false,
    canComment: false, canResolveComments: false, actions: [], missingAdmissionFields: [],
    linkedAssignments: [], summaryStatus: "in_preparation", canCreateAssignments: false, canRecordResult: false,
    ...detailExtras,
    passportReasons: [{ code: "status", label: "Одобрена к пилоту" }],
    passportGaps: stored.card.passport === undefined ? ["План пилота", "Стоп-условия пилота"] : [],
    canEditPassport: true,
  });
  const view = await renderWorkspace(
    { canView: true, canParticipate: true, canManage: false, canApprove: false },
    async (url, init, permissions) => {
      if (url.pathname === "/api/collegium-initiatives") {
        return [{ initiatives: [stored], people, reference, permissions, meetings: [], overdueIds: [], passportRequiredIds: [stored.id] }];
      }
      if (url.pathname === "/api/collegium-initiatives/initiative-1/passport" && init.method === "PUT") {
        const body = JSON.parse(init.body);
        puts.push(body);
        stored = { ...stored, revision: 6, card: { ...stored.card, passport: { ...body.passport, schedule: [], milestones: [] } } };
        return [{ initiative: stored }];
      }
      if (url.pathname === "/api/collegium-initiatives/initiative-1") return [detail()];
      throw new Error(`Unexpected request: ${url.pathname}`);
    },
  );
  const { dom, React, container } = view;
  try {
    await waitFor(React, () => container.querySelector(".collegium-initiatives-table") !== null);
    assert.match(container.textContent, /нужен полный паспорт/u);
    await React.act(async () => findButtonByText(container, "И-2026-0001").click());
    await waitFor(React, () => container.querySelector(".collegium-passport") !== null);
    assert.match(container.querySelector(".collegium-passport").textContent, /Не хватает в паспорте:План пилотаСтоп-условия пилота/u);
    await React.act(async () => findButtonByText(container, "Заполнить паспорт").click());
    const form = container.querySelector(".collegium-passport-form");
    const field = (label) => Array.from(form.querySelectorAll("label")).find(
      (item) => item.querySelector(":scope > span")?.textContent === label,
    ).querySelector("input, textarea");
    await React.act(async () => {
      for (const [label, value] of [["План пилота", "Две смены"], ["Стоп-условия пилота", "Брак выше 5 %"], ["Причина изменения (обязательно)", "Пилот одобрен"]]) {
        const input = field(label);
        setNativeInputValue(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      }
    });
    await React.act(async () => findButtonByText(form, "Добавить месяц").click());
    await React.act(async () => {
      const month = form.querySelector('.collegium-schedule-row input[type="month"]');
      setNativeInputValue(month, "2026-11");
      month.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      const roi = field("ROI, %");
      setNativeInputValue(roi, "25");
      roi.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await React.act(async () => findButtonByText(form, "Сохранить паспорт").click());
    await waitFor(React, () => puts.length === 1);
    assert.equal(puts[0].revision, 5);
    assert.equal(puts[0].reason, "Пилот одобрен");
    assert.equal(puts[0].passport.pilotPlan, "Две смены");
    assert.deepEqual(puts[0].passport.schedule, [{ month: "2026-11", cost: "", effect: "" }]);
    // An override without its explanation still goes to the server, which rejects it.
    assert.deepEqual(puts[0].passport.overrides, { roiPercent: { value: "25", explanation: "" } });
    await waitFor(React, () => container.querySelector(".collegium-passport") !== null);
    assert.match(container.querySelector(".collegium-passport").textContent, /Две смены/u);
  } finally {
    await view.cleanup();
  }
});

test("viewer sees the registry without the create action", async () => {
  const view = await renderWorkspace(
    { canView: true, canParticipate: false, canManage: false, canApprove: false },
    async (url, _init, permissions) => {
      if (url.pathname === "/api/collegium-initiatives") {
        return [{ initiatives: [buildInitiative({ title: "Чужая идея" })], people, reference, permissions, meetings: [], overdueIds: [] }];
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    },
  );
  const { React, container } = view;
  try {
    await waitFor(React, () => container.querySelector(".collegium-initiatives-table") !== null);
    assert.equal(
      Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "Новая инициатива"),
      false,
    );
    assert.equal(
      Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "Настройки"),
      false,
    );
    assert.match(container.textContent, /Чужая идея/u);
  } finally {
    await view.cleanup();
  }
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function findButtonByText(root, text) {
  const button = Array.from(root.querySelectorAll("button")).find(
    (item) => item.textContent === text,
  );
  assert.ok(button, `Expected button labelled ${text}`);
  return button;
}

function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value",
  )?.set;

  setter.call(input, value);
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  assert.fail("Timed out waiting for collegium initiatives state.");
}

function captureDomGlobals() {
  return Object.fromEntries(
    DOM_GLOBAL_NAMES.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
}

function installDomGlobals(window) {
  const domGlobals = {
    document: window.document,
    Element: window.Element,
    Event: window.Event,
    FormData: window.FormData,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    MouseEvent: window.MouseEvent,
    navigator: window.navigator,
    Node: window.Node,
    window,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(domGlobals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
  }
}

function restoreDomGlobals(previousGlobals) {
  for (const [name, descriptor] of Object.entries(previousGlobals)) {
    if (descriptor === undefined) delete globalThis[name];
    else Object.defineProperty(globalThis, name, descriptor);
  }
}
