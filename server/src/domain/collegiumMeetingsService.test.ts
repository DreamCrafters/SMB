import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCollegiumInitiativeCapabilities,
  type CollegiumInitiativeAccess,
  type CollegiumPerson,
  type CollegiumReference,
} from "../contracts/collegiumInitiatives.js";
import type { AuditEventDraft } from "./audit.js";
import type { ServerUserProfile } from "./auth.js";
import { CollegiumInitiativeError } from "./collegiumInitiative.js";
import { createCollegiumInitiativesService } from "./collegiumInitiativesService.js";
import { createCollegiumMeetingsService } from "./collegiumMeetingsService.js";
import { createCollegiumMemoryRepository } from "./testing/collegiumMemoryRepository.js";

const reference: CollegiumReference = {
  direction: [{ code: "production", label: "Производство" }],
  effect_type: [{ code: "cost_saving", label: "Экономия затрат" }],
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
      positionDisplayName: "Коллегия",
      displayName: `Пользователь ${userId}`,
      scope: { kind: "organization" },
      capabilities: resolveCollegiumInitiativeCapabilities(level),
      navigationItems: ["business.collegium_initiatives"],
      issuedAt: "2026-10-05T00:00:00.000Z",
    },
    receivedAt: "2026-10-05T00:00:00.000Z",
  };
}

const author = profile("author", "participant");
const secretary = profile("secretary", "secretary");
const chair = profile("chair", "chair");

function completeCard(title: string) {
  return {
    title,
    problem: "Потери 3 % при выпуске",
    baselineValue: "3 %",
    baselinePeriod: "2026, январь–август",
    baselineSource: "Отчёт ОТК № 12",
    solution: "Сменить режим обжига",
    expectedEffectAmount: "1200000",
    expectedEffectPeriod: "год",
    expectedEffectKind: "экономия затрат",
    effectMethod: "Снижение потерь × себестоимость",
    oneTimeCostAmount: "0",
    recurringCostAmount: "0",
    internalResources: "Технолог",
    ownerId: "account:owner",
    executorId: "account:author",
    executionControllerId: "account:secretary",
    effectControllerId: "account:chair",
    plannedStart: "2026-11-01",
    plannedResult: "2027-02-01",
    kpiCriterion: "Потери не выше 1,5 %",
    kpiSource: "Отчёт ОТК",
    risks: ["Срыв поставок"],
    requestedDecision: "pilot",
  };
}

function createHarness() {
  const people: CollegiumPerson[] = ["author", "owner", "secretary", "chair"].map((userId) => ({
    id: `account:${userId}`,
    displayName: `ФИО ${userId}`,
    position: "Член Коллегии",
    hasInitiativesTab: true,
  }));
  const memory = createCollegiumMemoryRepository({ reference, people });
  const auditEvents: AuditEventDraft[] = [];
  const shared = {
    repository: memory.repository,
    transaction: { async run<T>(operation: () => Promise<T>) { return operation(); } },
    audit: {
      async record(event: AuditEventDraft) { auditEvents.push(event); },
      async listReport() { throw new Error("not used"); },
    },
    now: () => new Date("2026-10-05T09:00:00.000Z"),
  };
  const initiatives = createCollegiumInitiativesService(shared);
  const meetings = createCollegiumMeetingsService(shared);

  async function readyInitiative(title: string) {
    const draft = await initiatives.create(author, { card: completeCard(title) });
    await initiatives.act(author, draft.id, { action: "submit_for_review", revision: 1 });
    return initiatives.act(chair, draft.id, { action: "admit", revision: 2 });
  }

  async function createMeeting() {
    return meetings.create(secretary, {
      meetingDate: "2026-10-12",
      meetingTime: "10:00",
      format: "mixed",
      location: "Зал 2, ссылка ВКС",
      participantIds: ["account:author", "account:chair"],
      absentIds: ["account:owner"],
      quorumNote: "Кворум есть",
    });
  }

  return { memory, initiatives, meetings, auditEvents, readyInitiative, createMeeting };
}

test("meeting agenda snapshots the card and the protocol applies decisions", async () => {
  const { memory, initiatives, meetings, auditEvents, readyInitiative, createMeeting } = createHarness();
  await assert.rejects(
    meetings.create(author, { meetingDate: "2026-10-12", meetingTime: "10:00", format: "in_person" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  const meeting = await createMeeting();
  assert.equal(meeting.number, "КЗ-2026-01");

  const draft = await initiatives.create(author, { card: completeCard("Черновик") });
  await assert.rejects(
    meetings.addItem(secretary, meeting.id, { revision: 1, initiativeId: draft.id }),
    /Готова к рассмотрению/u,
  );
  const ready = await readyInitiative("Снизить потери");
  let current = await meetings.addItem(secretary, meeting.id, {
    revision: 1,
    initiativeId: ready.id,
    speakerId: "account:author",
    durationMinutes: 20,
  });
  const item = current.items[0];
  assert.equal(item.order, 1);
  assert.equal(item.snapshot.revision, ready.revision);
  assert.equal(item.snapshot.card.title, "Снизить потери");
  let initiative = memory.initiatives.get(ready.id)!;
  assert.equal(initiative.status, "on_agenda");
  assert.deepEqual(initiative.workflow.agenda, { meetingId: meeting.id, meetingNumber: "КЗ-2026-01", itemId: item.id });
  // A card on the agenda is frozen.
  assert.equal((await initiatives.read(secretary, ready.id)).canEdit, false);

  await assert.rejects(
    meetings.setDecision(secretary, meeting.id, item.id, { revision: current.revision, decision: "pilot" }),
    /начните обсуждение/u,
  );
  current = await meetings.startDiscussion(secretary, meeting.id, item.id, { revision: current.revision });
  assert.equal(memory.initiatives.get(ready.id)!.status, "in_discussion");
  await assert.rejects(
    meetings.setDecision(secretary, meeting.id, item.id, { revision: current.revision, decision: "reject" }),
    /комментарий/u,
  );
  current = await meetings.setDecision(secretary, meeting.id, item.id, {
    revision: current.revision,
    decision: "pilot",
    comment: "Пилот на линии 2",
    responsibleIds: ["account:author"],
    dueDate: "2026-12-01",
    kpi: "Потери не выше 1,5 %",
    dissent: "Иванов против сроков",
  });
  // The draft decision does not touch the initiative before approval.
  assert.equal(memory.initiatives.get(ready.id)!.status, "in_discussion");

  await assert.rejects(
    meetings.approveProtocol(secretary, meeting.id, { revision: current.revision }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  await assert.rejects(
    meetings.approveProtocol(chair, meeting.id, { revision: current.revision }),
    /проект протокола/u,
  );
  current = await meetings.generateProtocol(secretary, meeting.id, { revision: current.revision });
  assert.match(current.protocol.text, /ПРОТОКОЛ заседания Коллегии № КЗ-2026-01/u);
  assert.match(current.protocol.text, /Присутствовали: ФИО author, ФИО chair/u);
  assert.match(current.protocol.text, /Решение: Провести пилот\./u);
  assert.match(current.protocol.text, /Особые мнения и разногласия: Иванов против сроков/u);
  current = await meetings.updateProtocol(secretary, meeting.id, {
    revision: current.revision,
    text: `${current.protocol.text}\nПодписи.`,
  });

  const approved = await meetings.approveProtocol(chair, meeting.id, { revision: current.revision });
  assert.equal(approved.status, "approved");
  assert.equal(approved.protocol.number, "КЗ-2026-01");
  assert.equal(approved.protocol.approvedByDisplayName, "Пользователь chair");
  initiative = memory.initiatives.get(ready.id)!;
  assert.equal(initiative.status, "approved_pilot");
  assert.equal(initiative.workflow.agenda, undefined);
  assert.deepEqual(initiative.workflow.lastDecision, {
    meetingId: meeting.id,
    meetingNumber: "КЗ-2026-01",
    meetingDate: "2026-10-12",
    protocolNumber: "КЗ-2026-01",
    itemOrder: 1,
    decision: "pilot",
  });
  assert.equal(memory.revisions.at(-1)?.revision.event?.action, "meeting_decision");
  assert.equal(auditEvents.at(-1)?.action, "collegium_meeting.protocol_approve");

  // An approved protocol is locked.
  await assert.rejects(
    meetings.updateProtocol(secretary, meeting.id, { revision: approved.revision, text: "Другое" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 409,
  );
  await assert.rejects(
    meetings.cancel(secretary, meeting.id, { revision: approved.revision, comment: "x" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 409,
  );
});

test("removal and cancellation return agenda items to ready", async () => {
  const { memory, meetings, readyInitiative, createMeeting } = createHarness();
  const meeting = await createMeeting();
  const first = await readyInitiative("Первая");
  const second = await readyInitiative("Вторая");
  let current = await meetings.addItem(secretary, meeting.id, { revision: 1, initiativeId: first.id });
  current = await meetings.addItem(secretary, meeting.id, { revision: current.revision, initiativeId: second.id });
  await assert.rejects(
    meetings.addItem(secretary, meeting.id, { revision: current.revision, initiativeId: first.id }),
    /Готова к рассмотрению/u,
  );

  current = await meetings.removeItem(secretary, meeting.id, current.items[0].id, {
    revision: current.revision,
    comment: "Перенесено",
  });
  assert.equal(memory.initiatives.get(first.id)!.status, "ready");
  assert.equal(memory.initiatives.get(first.id)!.workflow.agenda, undefined);
  assert.deepEqual(
    current.items.map((item) => [item.initiativeNumber, item.order, item.removedAt !== undefined]),
    [[first.number, 1, true], [second.number, 1, false]],
  );

  await assert.rejects(
    meetings.cancel(secretary, meeting.id, { revision: current.revision }),
    /причину/u,
  );
  const cancelled = await meetings.cancel(secretary, meeting.id, {
    revision: current.revision,
    comment: "Нет кворума",
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(memory.initiatives.get(second.id)!.status, "ready");
});

test("a rework decision records remarks and the request on approval", async () => {
  const { memory, meetings, readyInitiative, createMeeting } = createHarness();
  const meeting = await createMeeting();
  const ready = await readyInitiative("На доработку");
  let current = await meetings.addItem(secretary, meeting.id, { revision: 1, initiativeId: ready.id });
  const itemId = current.items[0].id;
  current = await meetings.startDiscussion(secretary, meeting.id, itemId, { revision: current.revision });
  await assert.rejects(
    meetings.setDecision(secretary, meeting.id, itemId, {
      revision: current.revision, decision: "return_for_rework", comment: "Нужны расчёты",
    }),
    /запрос на доработку/u,
  );
  current = await meetings.setDecision(secretary, meeting.id, itemId, {
    revision: current.revision,
    decision: "return_for_rework",
    comment: "Нужны расчёты",
    rework: {
      remarks: ["Приложить расчёт эффекта"],
      responsibleId: "account:author",
      dueDate: "2026-10-20",
      readinessCriterion: "Расчёт согласован с финансами",
    },
  });
  current = await meetings.generateProtocol(secretary, meeting.id, { revision: current.revision });
  await meetings.approveProtocol(chair, meeting.id, { revision: current.revision });

  const initiative = memory.initiatives.get(ready.id)!;
  assert.equal(initiative.status, "rework");
  assert.equal(initiative.workflow.rework?.readinessCriterion, "Расчёт согласован с финансами");
  assert.deepEqual(
    memory.comments.map(({ comment }) => [comment.kind, comment.text]),
    [["remark", "Приложить расчёт эффекта"]],
  );
});

test("meeting details reject unknown people and stale revisions", async () => {
  const { meetings, createMeeting } = createHarness();
  await assert.rejects(
    meetings.create(secretary, {
      meetingDate: "2026-10-12", meetingTime: "25:00", format: "in_person",
    }),
    /ЧЧ:ММ/u,
  );
  await assert.rejects(
    meetings.create(secretary, {
      meetingDate: "2026-10-12", meetingTime: "10:00", format: "in_person",
      participantIds: ["account:ghost"],
    }),
    /действующие/u,
  );
  await assert.rejects(
    meetings.create(secretary, {
      meetingDate: "2026-10-12", meetingTime: "10:00", format: "in_person",
      participantIds: ["account:author"], absentIds: ["account:author"],
    }),
    /и участником, и отсутствующим/u,
  );
  const meeting = await createMeeting();
  const updated = await meetings.updateDetails(secretary, meeting.id, {
    revision: 1,
    meetingDate: "2026-10-13",
    meetingTime: "11:30",
    format: "video",
    location: "https://vks.example/collegium",
    participantIds: ["account:author"],
    absentIds: [],
    quorumNote: "",
  });
  assert.equal(updated.meetingDate, "2026-10-13");
  await assert.rejects(
    meetings.updateDetails(secretary, meeting.id, {
      revision: 1, meetingDate: "2026-10-14", meetingTime: "11:30", format: "video",
    }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 409,
  );
  assert.equal((await meetings.list(profile("viewer", "view"))).meetings.length, 1);
});
