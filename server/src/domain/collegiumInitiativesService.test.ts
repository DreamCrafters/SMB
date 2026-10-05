import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCollegiumInitiativeCapabilities,
  type CollegiumInitiativeAccess,
  type CollegiumInitiativeCardInput,
  type CollegiumPerson,
  type CollegiumReference,
} from "../contracts/collegiumInitiatives.js";
import type { AuditEventDraft } from "./audit.js";
import type { ServerUserProfile } from "./auth.js";
import {
  CollegiumInitiativeError,
  listChangedCollegiumFields,
  normalizeCollegiumCard,
  readCollegiumAmount,
  readCollegiumInitiativeCardInput,
} from "./collegiumInitiative.js";
import { createCollegiumInitiativesService } from "./collegiumInitiativesService.js";
import { createCollegiumMemoryRepository } from "./testing/collegiumMemoryRepository.js";

const reference: CollegiumReference = {
  direction: [{ code: "production", label: "Производство" }],
  effect_type: [
    { code: "cost_saving", label: "Экономия затрат" },
    { code: "defect_reduction", label: "Снижение брака" },
  ],
  risk_level: [{ code: "medium", label: "Средний", significant: false }],
  site: [],
  kpi: [],
};

function profile(userId: string, level: CollegiumInitiativeAccess): ServerUserProfile {
  return {
    userId,
    displayName: `Пользователь ${userId}`,
    accountType: "business_owner",
    activeAccess: {
      accountId: `access-${userId}`,
      accountType: "business_owner",
      position: "collegium",
      positionDisplayName: "Член Коллегии",
      displayName: `Пользователь ${userId}`,
      scope: { kind: "organization" },
      capabilities: level === "none" ? [] : resolveCollegiumInitiativeCapabilities(level),
      navigationItems: level === "none" ? [] : ["business.collegium_initiatives"],
      issuedAt: "2026-10-05T00:00:00.000Z",
    },
    receivedAt: "2026-10-05T00:00:00.000Z",
  };
}

function card(overrides: Partial<CollegiumInitiativeCardInput> = {}) {
  return { title: "Снизить потери при выпуске", ...overrides };
}

function createHarness(activeUsers = ["author", "other", "secretary", "owner", "chair"]) {
  const auditEvents: AuditEventDraft[] = [];
  let transactions = 0;
  const people: CollegiumPerson[] = activeUsers.map((userId) => ({
    id: `account:${userId}`,
    displayName: userId,
    position: "Член Коллегии",
    hasInitiativesTab: true,
  }));
  const memory = createCollegiumMemoryRepository({ reference, people });
  const { repository, initiatives, revisions, comments, attachments } = memory;
  const service = createCollegiumInitiativesService({
    repository,
    transaction: {
      async run(operation) {
        transactions += 1;
        return operation();
      },
    },
    audit: {
      async record(event) { auditEvents.push(event); },
      async listReport() { throw new Error("not used"); },
    },
    now: () => new Date("2026-10-05T09:00:00.000Z"),
  });
  return { service, initiatives, revisions, comments, attachments, auditEvents, transactions: () => transactions };
}

test("an archived reference value stays valid only where it was already chosen", () => {
  const archived: CollegiumReference = {
    ...reference,
    direction: [...reference.direction, { code: "legacy", label: "Старое направление", archived: true }],
    effect_type: [...reference.effect_type, { code: "old_effect", label: "Старый эффект", archived: true }],
  };
  const input = { ...card(), directionCode: "legacy", effectTypeCodes: ["old_effect", "cost_saving"] };
  assert.throws(() => readCollegiumInitiativeCardInput(input, archived), /направление/u);
  assert.throws(
    () => readCollegiumInitiativeCardInput({ ...input, directionCode: "" }, archived),
    /типы эффекта/u,
  );
  const previous = readCollegiumInitiativeCardInput({ ...card(), directionCode: "production" }, reference);
  const kept = readCollegiumInitiativeCardInput(input, archived, {
    ...previous,
    directionCode: "legacy",
    effectTypeCodes: ["old_effect"],
  });
  assert.equal(kept.directionLabel, "Старое направление");
  assert.deepEqual(kept.effectTypeLabels, ["Старый эффект", "Экономия затрат"]);
});

test("cards saved before queue 3 read and save without losing data", () => {
  const legacy = normalizeCollegiumCard({
    ...readCollegiumInitiativeCardInput(card(), reference),
    expectedEffectPeriod: "за сезон",
    risks: ["Срыв поставок"],
  } as never);
  assert.deepEqual(legacy.risks, [{ text: "Срыв поставок", levelCode: "", levelLabel: "" }]);
  assert.deepEqual(
    [legacy.capexAmount, legacy.changesTechnology, legacy.newProductOrMarket, legacy.boardDecisionRequired],
    ["", "", "", ""],
  );
  // The old free-text period survives an unrelated edit but cannot be typed anew.
  const edited = readCollegiumInitiativeCardInput(
    { ...card(), expectedEffectPeriod: "за сезон", risks: [{ text: "Срыв поставок", levelCode: "" }], title: "Новое имя" },
    reference,
    legacy,
  );
  assert.equal(edited.expectedEffectPeriod, "за сезон");
  assert.deepEqual(listChangedCollegiumFields(legacy, edited), ["title"]);
  // A renamed risk level changes the label, not the card.
  const leveled = readCollegiumInitiativeCardInput({ ...card(), risks: [{ text: "Простой", levelCode: "medium" }] }, reference);
  const renamed = { ...leveled, risks: [{ ...leveled.risks[0], levelLabel: "Средний (новое имя)" }] };
  assert.deepEqual(listChangedCollegiumFields(leveled, renamed), []);
});

test("card input canonicalizes amounts, labels and rejects malformed fields", () => {
  const parsed = readCollegiumInitiativeCardInput({
    ...card(),
    directionCode: "production",
    effectTypeCodes: ["defect_reduction"],
    expectedEffectAmount: "1 200 000,5",
    oneTimeCostAmount: "0",
    risks: ["  Срыв поставок ", "", "Брак"],
    plannedStart: "2026-11-01",
    plannedResult: "2027-02-01",
  }, reference);
  assert.equal(parsed.expectedEffectAmount, "1200000.50");
  assert.equal(parsed.oneTimeCostAmount, "0.00");
  assert.equal(parsed.recurringCostAmount, "");
  assert.equal(parsed.directionLabel, "Производство");
  assert.deepEqual(parsed.effectTypeLabels, ["Снижение брака"]);
  // A bare string from an older client is a risk without a level.
  assert.deepEqual(parsed.risks, [
    { text: "Срыв поставок", levelCode: "", levelLabel: "" },
    { text: "Брак", levelCode: "", levelLabel: "" },
  ]);
  assert.deepEqual(
    readCollegiumInitiativeCardInput({ ...card(), risks: [{ text: "Простой", levelCode: "medium" }] }, reference).risks,
    [{ text: "Простой", levelCode: "medium", levelLabel: "Средний" }],
  );

  const rejects = (input: Record<string, unknown>, pattern: RegExp) =>
    assert.throws(() => readCollegiumInitiativeCardInput(input, reference), pattern);
  rejects({ title: "  " }, /наименование/u);
  rejects({ ...card(), title: "x".repeat(251) }, /250/u);
  rejects({ ...card(), secret: "x" }, /неизвестные/u);
  rejects({ ...card(), directionCode: "space" }, /направление/u);
  rejects({ ...card(), effectTypeCodes: ["cost_saving", "cost_saving"] }, /типы эффекта/u);
  rejects({ ...card(), risks: ["a", "b", "c", "d"] }, /трёх/u);
  rejects({ ...card(), ownerId: "Иванов" }, /учётную запись/u);
  rejects({ ...card(), plannedStart: "2026-02-30" }, /даты/u);
  rejects({ ...card(), plannedStart: "2026-12-01", plannedResult: "2026-11-01" }, /раньше/u);
  rejects({ ...card(), expectedEffectAmount: "-5" }, /неотрицательным/u);
  rejects({ ...card(), requestedDecision: "close" }, /решение/u);
  rejects({ ...card(), risks: [{ text: "Простой", levelCode: "extreme" }] }, /уровень риска/u);
  rejects({ ...card(), expectedEffectPeriod: "за сезон" }, /период эффекта/u);
  rejects({ ...card(), changesTechnology: "maybe" }, /«да» или «нет»/u);
  rejects({ ...card(), capexAmount: "-1" }, /неотрицательным/u);
  assert.equal(readCollegiumAmount("007"), "7.00");
  assert.throws(() => readCollegiumAmount("1.234"), /двумя знаками/u);
});

test("participant creates an own draft with a yearly number and audited revision", async () => {
  const { service, revisions, auditEvents, transactions } = createHarness();
  const initiative = await service.create(profile("author", "participant"), {
    card: { ...card(), initiatorId: "account:other", ownerId: "account:owner" },
    comment: "Первая версия",
  });

  assert.equal(initiative.number, "И-2026-0001");
  assert.equal(initiative.status, "draft");
  assert.equal(initiative.revision, 1);
  // A participant always registers the idea as its own initiator.
  assert.equal(initiative.card.initiatorId, "account:author");
  assert.equal(initiative.card.ownerId, "account:owner");
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].revision.comment, "Первая версия");
  assert.equal(auditEvents[0].action, "collegium_initiative.create");
  assert.equal(auditEvents[0].targetId, initiative.id);
  assert.equal(transactions(), 1);

  const second = await service.create(profile("secretary", "secretary"), {
    card: { ...card({ title: "Вторая" }), initiatorId: "account:other" },
  });
  assert.equal(second.number, "И-2026-0002");
  assert.equal(second.card.initiatorId, "account:other");
});

test("viewers cannot create and drafts stay with the author, owner and secretary", async () => {
  const { service } = createHarness();
  await assert.rejects(
    service.create(profile("other", "view"), { card: card() }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  await assert.rejects(
    service.list(profile("other", "none")),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  const draft = await service.create(profile("author", "participant"), {
    card: { ...card(), ownerId: "account:owner" },
  });

  assert.deepEqual((await service.list(profile("other", "participant"))).initiatives, []);
  assert.equal((await service.list(profile("owner", "view"))).initiatives.length, 1);
  assert.equal((await service.list(profile("secretary", "secretary"))).initiatives.length, 1);
  await assert.rejects(
    service.read(profile("other", "participant"), draft.id),
    (error) => error instanceof CollegiumInitiativeError && error.status === 404,
  );
  const detail = await service.read(profile("author", "participant"), draft.id);
  assert.equal(detail.canEdit, true);
  assert.equal(detail.revisions.length, 1);
});

test("edits need the current revision, record changed fields and keep the initiator", async () => {
  const { service, initiatives, revisions, auditEvents } = createHarness();
  const draft = await service.create(profile("author", "participant"), { card: card() });

  await assert.rejects(
    service.update(profile("author", "participant"), draft.id, { card: card({ title: "Новое" }) }),
    /ревизию/u,
  );
  await assert.rejects(
    service.update(profile("author", "participant"), draft.id, { card: card({ title: "Новое" }), revision: 7 }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 409,
  );
  await assert.rejects(
    service.update(profile("other", "participant"), draft.id, { card: card({ title: "Чужое" }), revision: 1 }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 404,
  );

  const updated = await service.update(profile("author", "participant"), draft.id, {
    card: { ...card({ title: "Новое" }), initiatorId: "account:other", problem: "Потери 3 %" },
    revision: 1,
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.card.initiatorId, "account:author");
  assert.deepEqual(revisions.at(-1)?.revision.changedFields, ["title", "problem"]);
  assert.equal(auditEvents.at(-1)?.action, "collegium_initiative.update");
  assert.match(auditEvents.at(-1)?.details?.at(-1)?.value ?? "", /Наименование идеи/u);

  // Unchanged save neither bumps the revision nor writes history.
  const same = await service.update(profile("author", "participant"), draft.id, {
    card: { ...card({ title: "Новое" }), problem: "Потери 3 %" },
    revision: 2,
  });
  assert.equal(same.revision, 2);
  assert.equal(revisions.length, 2);

  // Outside the draft a reason is mandatory.
  initiatives.set(draft.id, { ...initiatives.get(draft.id)!, status: "rework" });
  await assert.rejects(
    service.update(profile("author", "participant"), draft.id, { card: card({ title: "Ещё" }), revision: 2 }),
    /причину/u,
  );
  const reworked = await service.update(profile("author", "participant"), draft.id, {
    card: card({ title: "Ещё" }), revision: 2, reason: "Замечание председателя",
  });
  assert.equal(revisions.at(-1)?.revision.reason, "Замечание председателя");
  assert.equal(revisions.at(-1)?.revision.status, "rework");
  assert.equal(reworked.revision, 3);

  // Participants cannot edit once the idea left their hands.
  initiatives.set(draft.id, { ...initiatives.get(draft.id)!, status: "preliminary_review" });
  await assert.rejects(
    service.update(profile("author", "participant"), draft.id, { card: card({ title: "Поздно" }), revision: 3, reason: "x" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
});

test("assigned people must be active accounts unless the value was already stored", async () => {
  const { service, initiatives } = createHarness(["author", "owner"]);
  await assert.rejects(
    service.create(profile("author", "participant"), { card: { ...card(), ownerId: "account:gone" } }),
    /Владелец результата/u,
  );
  const draft = await service.create(profile("author", "participant"), {
    card: { ...card(), ownerId: "account:owner" },
  });
  // The owner later leaves: a title fix must still save.
  initiatives.set(draft.id, {
    ...initiatives.get(draft.id)!,
    card: { ...initiatives.get(draft.id)!.card, ownerId: "account:gone" },
  });
  const updated = await service.update(profile("author", "participant"), draft.id, {
    card: { ...card({ title: "Уточнение" }), ownerId: "account:gone" },
    revision: 1,
  });
  assert.equal(updated.card.title, "Уточнение");
});

function completeCard(overrides: Partial<CollegiumInitiativeCardInput> = {}) {
  return {
    ...card(),
    problem: "Потери 3 % при выпуске",
    baselineValue: "3 %",
    baselinePeriod: "2026, январь–август",
    baselineSource: "Отчёт ОТК № 12",
    solution: "Сменить режим обжига",
    expectedEffectAmount: "1 200 000",
    expectedEffectPeriod: "year",
    expectedEffectKind: "экономия затрат",
    effectMethod: "Снижение потерь × себестоимость",
    oneTimeCostAmount: "0",
    recurringCostAmount: "0",
    internalResources: "Технолог, 2 смены",
    ownerId: "account:owner",
    executorId: "account:author",
    executionControllerId: "account:secretary",
    effectControllerId: "account:other",
    plannedStart: "2026-11-01",
    plannedResult: "2027-02-01",
    kpiCriterion: "Потери не выше 1,5 %",
    kpiSource: "Отчёт ОТК",
    risks: [{ text: "Срыв поставок", levelCode: "medium" }],
    requestedDecision: "pilot",
    capexAmount: "0",
    changesTechnology: "no",
    newProductOrMarket: "no",
    boardDecisionRequired: "no",
    ...overrides,
  };
}

test("admission filter lists every gap of the queue-1 success criterion", async () => {
  const { service } = createHarness();
  const draft = await service.create(profile("author", "participant"), {
    card: completeCard({
      baselinePeriod: "",
      oneTimeCostAmount: "",
      effectControllerId: "account:author",
      risks: [{ text: "Без уровня", levelCode: "" }],
      requestedDecision: "",
      capexAmount: "",
      boardDecisionRequired: "",
    }),
  });
  const detail = await service.read(profile("author", "participant"), draft.id);
  assert.deepEqual(detail.missingAdmissionFields, [
    "Базовая линия и её период",
    "Разовые затраты, ₽",
    "CAPEX, ₽",
    "Ключевые риски с уровнем",
    "Что требуется от Коллегии",
    "Требуется решение Совета директоров",
    "Контролёр эффекта не может быть исполнителем или владельцем результата",
  ]);
  const complete = await service.create(profile("author", "participant"), { card: completeCard() });
  assert.deepEqual((await service.read(profile("author", "participant"), complete.id)).missingAdmissionFields, []);
});

test("route moves an idea to review, back to rework and to admission", async () => {
  const { service, revisions, comments, auditEvents } = createHarness();
  const author = profile("author", "participant");
  const secretary = profile("secretary", "secretary");
  const chair = profile("chair", "chair");
  const draft = await service.create(author, { card: completeCard({ kpiSource: "" }) });

  assert.deepEqual((await service.read(author, draft.id)).actions, ["submit_for_review", "withdraw"]);
  await assert.rejects(
    service.act(author, draft.id, { action: "admit", revision: 1 }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 409,
  );
  const submitted = await service.act(author, draft.id, { action: "submit_for_review", revision: 1 });
  assert.equal(submitted.status, "preliminary_review");
  assert.deepEqual(revisions.at(-1)?.revision.event, {
    action: "submit_for_review", fromStatus: "draft", toStatus: "preliminary_review",
  });
  assert.equal(auditEvents.at(-1)?.action, "collegium_initiative.transition");

  // Participants cannot judge; the chair alone admits and needs a complete card.
  await assert.rejects(
    service.act(author, draft.id, { action: "admit", revision: 2 }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  await assert.rejects(
    service.act(chair, draft.id, { action: "admit", revision: 2 }),
    /Источник KPI/u,
  );

  await assert.rejects(
    service.act(secretary, draft.id, { action: "return_for_rework", revision: 2 }),
    /комментарий/u,
  );
  await assert.rejects(
    service.act(secretary, draft.id, { action: "return_for_rework", revision: 2, comment: "Не хватает KPI" }),
    /запрос на доработку/u,
  );
  const reworked = await service.act(secretary, draft.id, {
    action: "return_for_rework",
    revision: 2,
    comment: "Не хватает KPI",
    rework: {
      remarks: ["Укажите источник KPI", " "],
      responsibleId: "account:author",
      dueDate: "2026-10-20",
      readinessCriterion: "Заполнен источник KPI",
    },
  });
  assert.equal(reworked.status, "rework");
  assert.equal(reworked.workflow.rework?.responsibleId, "account:author");
  assert.deepEqual(comments.map(({ comment }) => [comment.kind, comment.text]), [["remark", "Укажите источник KPI"]]);

  const fixed = await service.update(author, draft.id, {
    card: completeCard(), revision: 3, reason: "Добавлен источник KPI",
  });
  await service.act(author, draft.id, { action: "submit_for_review", revision: fixed.revision });
  const ready = await service.act(chair, draft.id, { action: "admit", revision: fixed.revision + 1 });
  assert.equal(ready.status, "ready");
});

test("suspension returns to the previous status and the author may withdraw a draft", async () => {
  const { service } = createHarness();
  const author = profile("author", "participant");
  const secretary = profile("secretary", "secretary");
  const draft = await service.create(author, { card: completeCard() });
  await service.act(author, draft.id, { action: "submit_for_review", revision: 1 });

  await assert.rejects(
    service.act(secretary, draft.id, { action: "suspend", revision: 2 }),
    /комментарий/u,
  );
  const suspended = await service.act(secretary, draft.id, {
    action: "suspend", revision: 2, comment: "Ждём бюджет",
  });
  assert.equal(suspended.workflow.suspendedFrom, "preliminary_review");
  const resumed = await service.act(secretary, draft.id, { action: "resume", revision: 3 });
  assert.equal(resumed.status, "preliminary_review");
  assert.equal(resumed.workflow.suspendedFrom, undefined);

  const second = await service.create(author, { card: card({ title: "Черновик" }) });
  await assert.rejects(
    service.act(secretary, second.id, { action: "withdraw", revision: 1, comment: "x" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  const withdrawn = await service.act(author, second.id, {
    action: "withdraw", revision: 1, comment: "Идея неактуальна",
  });
  assert.equal(withdrawn.status, "closed");
});

test("participants comment, secretaries leave remarks and owners resolve them", async () => {
  const { service } = createHarness();
  const author = profile("author", "participant");
  const draft = await service.create(author, { card: completeCard() });
  await service.act(author, draft.id, { action: "submit_for_review", revision: 1 });

  await assert.rejects(
    service.comment(profile("viewer", "view"), draft.id, { kind: "comment", text: "Мнение" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  await assert.rejects(
    service.comment(profile("other", "participant"), draft.id, { kind: "remark", text: "Замечание" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  const question = await service.comment(profile("other", "participant"), draft.id, {
    kind: "question", text: "Какой период базовой линии?",
  });
  const plain = await service.comment(profile("other", "participant"), draft.id, {
    kind: "comment", text: "Поддерживаю",
  });
  await assert.rejects(
    service.resolveComment(profile("other", "participant"), draft.id, question.id),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  await assert.rejects(service.resolveComment(author, draft.id, plain.id), /вопросы и замечания/u);
  const resolved = await service.resolveComment(author, draft.id, question.id);
  assert.equal(resolved.resolvedByDisplayName, "Пользователь author");
  await assert.rejects(
    service.resolveComment(author, draft.id, question.id),
    (error) => error instanceof CollegiumInitiativeError && error.status === 409,
  );
  const detail = await service.read(author, draft.id);
  assert.equal(detail.comments.length, 2);
  assert.equal(detail.canResolveComments, true);
});

test("authors attach materials within limits and secretaries keep the history", async () => {
  const { service, attachments } = createHarness();
  const author = profile("author", "participant");
  const draft = await service.create(author, { card: card() });
  const pdf = Buffer.from("%PDF-1.7 расчёт");

  await assert.rejects(
    service.prepareFileUpload(profile("other", "participant"), draft.id, "a.pdf", 10),
    (error) => error instanceof CollegiumInitiativeError && error.status === 404,
  );
  await assert.rejects(
    service.prepareFileUpload(author, draft.id, "a.pdf", 11 * 1024 * 1024),
    (error) => error instanceof CollegiumInitiativeError && error.status === 413,
  );
  assert.equal(await service.prepareFileUpload(author, draft.id, " Расчёт.pdf", pdf.length), "Расчёт.pdf");
  const file = await service.addFile(author, draft.id, "Расчёт.pdf", pdf);
  assert.equal(file.fileType, "pdf");
  assert.equal(file.sizeBytes, pdf.length);
  await service.addLink(author, draft.id, { url: "https://drive.google.com/x", label: "Данные ОТК" });

  const downloaded = await service.readFile(profile("secretary", "secretary"), draft.id, file.id);
  assert.equal(downloaded.contentType, "application/pdf");
  assert.deepEqual(downloaded.content, pdf);
  const detail = await service.read(author, draft.id);
  assert.deepEqual(detail.attachments.map(({ label }) => label), ["Расчёт.pdf", "Данные ОТК"]);
  assert.equal(detail.canAttach, true);

  await service.deleteAttachment(author, draft.id, file.id);
  assert.deepEqual((await service.read(author, draft.id)).attachments.map(({ label }) => label), ["Данные ОТК"]);
  // Soft delete: the stored file stays for history.
  assert.ok(attachments.get(file.id)?.deleted);

  // The total size limit counts the stored files.
  for (const entry of attachments.values()) entry.attachment.sizeBytes ??= 0;
  attachments.set("big", { ownerId: draft.id, attachment: { id: "big", kind: "file", label: "big.pdf", fileType: "pdf", sizeBytes: 45 * 1024 * 1024, createdByDisplayName: "x", createdAt: "2026-10-05T09:00:00.000Z" }, deleted: false });
  await assert.rejects(
    service.addFile(author, draft.id, "Ещё.pdf", Buffer.concat([pdf, Buffer.alloc(6 * 1024 * 1024)])),
    (error) => error instanceof CollegiumInitiativeError && error.status === 413,
  );
});

test("a never submitted idea stays private after withdrawal and cannot be suspended", async () => {
  const { service } = createHarness();
  const author = profile("author", "participant");
  const viewer = profile("other", "view");
  const draft = await service.create(author, { card: card() });
  await assert.rejects(
    service.act(profile("secretary", "secretary"), draft.id, { action: "suspend", revision: 1, comment: "x" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 409,
  );
  await service.act(author, draft.id, { action: "withdraw", revision: 1, comment: "Неактуально" });
  assert.deepEqual((await service.list(viewer)).initiatives, []);
  await assert.rejects(
    service.read(viewer, draft.id),
    (error) => error instanceof CollegiumInitiativeError && error.status === 404,
  );

  // Once submitted, the idea stays visible even after a return to rework.
  const submitted = await service.create(author, { card: card({ title: "Отправленная" }) });
  const reviewed = await service.act(author, submitted.id, { action: "submit_for_review", revision: 1 });
  assert.ok(reviewed.workflow.submittedAt);
  assert.equal((await service.list(viewer)).initiatives.length, 1);
});
