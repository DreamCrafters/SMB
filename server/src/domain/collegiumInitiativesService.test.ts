import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCollegiumInitiativeCapabilities,
  type CollegiumInitiative,
  type CollegiumInitiativeAccess,
  type CollegiumInitiativeCardInput,
  type CollegiumInitiativeRevision,
  type CollegiumPerson,
  type CollegiumReference,
} from "../contracts/collegiumInitiatives.js";
import type { AuditEventDraft } from "./audit.js";
import type { ServerUserProfile } from "./auth.js";
import {
  CollegiumInitiativeError,
  readCollegiumAmount,
  readCollegiumInitiativeCardInput,
} from "./collegiumInitiative.js";
import { createCollegiumInitiativesService } from "./collegiumInitiativesService.js";
import type { CollegiumInitiativesRepository } from "../repositories/collegiumInitiativesRepository.js";

const reference: CollegiumReference = {
  direction: [{ code: "production", label: "Производство" }],
  effect_type: [
    { code: "cost_saving", label: "Экономия затрат" },
    { code: "defect_reduction", label: "Снижение брака" },
  ],
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

function createHarness(activeUsers = ["author", "other", "secretary", "owner"]) {
  const initiatives = new Map<string, CollegiumInitiative>();
  const revisions: Array<{ initiativeId: string; revision: Omit<CollegiumInitiativeRevision, "createdAt"> }> = [];
  const auditEvents: AuditEventDraft[] = [];
  const counters = new Map<string, number>();
  let transactions = 0;
  const people: CollegiumPerson[] = activeUsers.map((userId) => ({
    id: `account:${userId}`,
    displayName: userId,
    position: "Член Коллегии",
    hasInitiativesTab: true,
  }));
  const repository = {
    async listReference() { return reference; },
    async listPeople() { return people; },
    async readPerson(accountId: string) {
      return people.find(({ id }) => id === accountId);
    },
    async nextNumber(kind: string, year: number) {
      const key = `${kind}:${year}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async list() { return [...initiatives.values()]; },
    async read(id: string) {
      const initiative = initiatives.get(id);
      return initiative === undefined ? undefined : structuredClone(initiative);
    },
    async insert(initiative: CollegiumInitiative) {
      initiatives.set(initiative.id, structuredClone(initiative));
    },
    async update(initiative: CollegiumInitiative, expectedRevision: number) {
      if (initiatives.get(initiative.id)?.revision !== expectedRevision) {
        throw new CollegiumInitiativeError("conflict", 409);
      }
      initiatives.set(initiative.id, structuredClone(initiative));
    },
    async insertRevision(initiativeId: string, revision: { createdAt: Date } & Omit<CollegiumInitiativeRevision, "createdAt">) {
      const { createdAt: _createdAt, ...rest } = revision;
      revisions.push({ initiativeId, revision: rest });
    },
    async listRevisions(initiativeId: string) {
      return revisions
        .filter((entry) => entry.initiativeId === initiativeId)
        .map(({ revision }) => ({ ...revision, createdAt: "2026-10-05T09:00:00.000Z" }));
    },
  } as unknown as CollegiumInitiativesRepository;
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
  return { service, initiatives, revisions, auditEvents, transactions: () => transactions };
}

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
  assert.deepEqual(parsed.risks, ["Срыв поставок", "Брак"]);

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
