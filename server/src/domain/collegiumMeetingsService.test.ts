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
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import { DirectorAssignmentError } from "./directorAssignment.js";

const reference: CollegiumReference = {
  direction: [{ code: "production", label: "Производство" }],
  effect_type: [{ code: "cost_saving", label: "Экономия затрат" }],
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
    expectedEffectPeriod: "year",
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
    risks: [{ text: "Срыв поставок", levelCode: "medium" }],
    requestedDecision: "pilot",
    capexAmount: "0",
    changesTechnology: "no",
    newProductOrMarket: "no",
    boardDecisionRequired: "no",
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
  const linkedAssignments: DirectorAssignment[] = [];
  const shared = {
    repository: memory.repository,
    transaction: { async run<T>(operation: () => Promise<T>) { return operation(); } },
    audit: {
      async record(event: AuditEventDraft) { auditEvents.push(event); },
      async listReport() { throw new Error("not used"); },
    },
    now: () => new Date("2026-10-05T09:00:00.000Z"),
  };
  const initiatives = createCollegiumInitiativesService({
    ...shared,
    assignments: {
      async listBySourceInitiative(initiativeId: string) {
        return linkedAssignments.filter((assignment) => assignment.sourceInitiativeId === initiativeId);
      },
      async listWithInitiativeLink() {
        return [...linkedAssignments];
      },
    },
  });
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

  async function approvedInitiative(title: string, decision: "pilot" | "board_materials" = "pilot") {
    const ready = await readyInitiative(title);
    const meeting = await createMeeting();
    let current = await meetings.addItem(secretary, meeting.id, { revision: 1, initiativeId: ready.id });
    const itemId = current.items[0].id;
    current = await meetings.startDiscussion(secretary, meeting.id, itemId, { revision: current.revision });
    current = await meetings.setDecision(secretary, meeting.id, itemId, { revision: current.revision, decision });
    current = await meetings.generateProtocol(secretary, meeting.id, { revision: current.revision });
    await meetings.approveProtocol(chair, meeting.id, { revision: current.revision });
    return memory.initiatives.get(ready.id)!;
  }

  function addAssignment(initiativeId: string, status: DirectorAssignment["status"], deadline = "2026-12-01") {
    const assignment = {
      id: `assignment-${linkedAssignments.length + 1}`,
      number: `К-${linkedAssignments.length + 1}`,
      summary: "Провести пилот",
      status,
      currentOccurrenceDate: deadline,
      completedOn: status === "completed" ? "2026-11-20" : "",
      responsible: { fullName: "ФИО author" },
      sourceInitiativeId: initiativeId,
    } as unknown as DirectorAssignment;
    linkedAssignments.push(assignment);
    return assignment;
  }

  return { memory, initiatives, meetings, auditEvents, readyInitiative, createMeeting, approvedInitiative, addAssignment, linkedAssignments };
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

const owner = profile("owner", "participant");
const assignmentController: ServerUserProfile = {
  ...secretary,
  activeAccess: {
    ...secretary.activeAccess,
    capabilities: [...secretary.activeAccess.capabilities, "business.manage_collegium_assignments"],
  },
};

test("assignments move an approved initiative into implementation and back to the card", async () => {
  const { memory, initiatives, approvedInitiative, addAssignment } = createHarness();
  const approved = await approvedInitiative("Пилот обжига");
  assert.equal(approved.status, "approved_pilot");
  assert.equal((await initiatives.read(assignmentController, approved.id)).canCreateAssignments, true);
  assert.equal((await initiatives.read(secretary, approved.id)).canCreateAssignments, false);
  assert.equal((await initiatives.read(secretary, approved.id)).summaryStatus, "in_preparation");

  await initiatives.assignmentLinks.lockForAssignment(assignmentController, approved.id);
  const assignment = addAssignment(approved.id, "in_progress", "2026-10-01");
  await initiatives.assignmentLinks.recordAssignmentCreated(assignmentController, approved.id, assignment);
  const inProgress = memory.initiatives.get(approved.id)!;
  assert.equal(inProgress.status, "in_progress");
  assert.equal(memory.revisions.at(-1)?.revision.event?.action, "assignment_created");

  const detail = await initiatives.read(secretary, approved.id);
  assert.deepEqual(detail.linkedAssignments.map(({ number, isOverdue }) => [number, isOverdue]), [["К-1", true]]);
  // An overdue linked assignment makes the whole initiative overdue.
  assert.equal(detail.summaryStatus, "overdue");

  const draft = await initiatives.create(author, { card: { title: "Черновик" } });
  // The registry route maps only its own errors, so the port speaks its language.
  await assert.rejects(
    initiatives.assignmentLinks.lockForAssignment(assignmentController, draft.id),
    (error) => error instanceof DirectorAssignmentError && error.status === 409,
  );
});

test("effect confirmation needs an independent controller, a full result and closed assignments", async () => {
  const { memory, initiatives, approvedInitiative, addAssignment, linkedAssignments } = createHarness();
  const approved = await approvedInitiative("Подтверждение эффекта");
  const assignment = addAssignment(approved.id, "in_progress");
  await initiatives.assignmentLinks.recordAssignmentCreated(assignmentController, approved.id, assignment);
  let current = memory.initiatives.get(approved.id)!;

  // Owner and executor report; outsiders cannot.
  await assert.rejects(
    initiatives.recordResult(profile("chair", "participant"), approved.id, { revision: current.revision, description: "x" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  current = await initiatives.recordResult(author, approved.id, {
    revision: current.revision,
    description: "Потери снизились до 1,4 %",
    actualEffectAmount: "950 000",
    source: "",
    conclusion: "partial",
  });
  assert.equal(current.workflow.result?.actualEffectAmount, "950000.00");
  current = await initiatives.act(owner, approved.id, { action: "complete_work", revision: current.revision });
  assert.equal(current.status, "result_confirmation");

  // The executor never confirms its own effect.
  await assert.rejects(
    initiatives.act(author, approved.id, { action: "confirm_effect", revision: current.revision }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  await assert.rejects(
    initiatives.act(chair, approved.id, { action: "confirm_effect", revision: current.revision }),
    /Незавершённые поручения: К-1; Источник подтверждения/u,
  );
  linkedAssignments[0] = { ...linkedAssignments[0], status: "completed" } as DirectorAssignment;
  current = await initiatives.recordResult(author, approved.id, {
    revision: current.revision,
    description: "Потери снизились до 1,4 %",
    actualEffectAmount: "950000",
    source: "Отчёт ОТК за ноябрь",
    conclusion: "partial",
  });
  current = await initiatives.act(chair, approved.id, { action: "confirm_effect", revision: current.revision });
  assert.equal(current.status, "done_confirmed");
  assert.equal(current.workflow.effectConfirmation?.result.source, "Отчёт ОТК за ноябрь");
  assert.equal((await initiatives.read(secretary, approved.id)).summaryStatus, "effect_confirmed");

  current = await initiatives.act(secretary, approved.id, { action: "close", revision: current.revision });
  assert.equal(current.status, "closed");
});

test("the chair records the board decision and a board suspension resumes to referral", async () => {
  const { initiatives, approvedInitiative } = createHarness();
  const referred = await approvedInitiative("Модернизация печи", "board_materials");
  assert.equal(referred.status, "board_referral");
  await assert.rejects(
    initiatives.act(secretary, referred.id, { action: "board_approve", revision: referred.revision }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  const suspended = await initiatives.act(chair, referred.id, {
    action: "board_suspend", revision: referred.revision, comment: "СД ждёт смету",
  });
  assert.equal(suspended.workflow.suspendedFrom, "board_referral");
  const resumed = await initiatives.act(secretary, referred.id, { action: "resume", revision: suspended.revision });
  assert.equal(resumed.status, "board_referral");
  const approved = await initiatives.act(chair, referred.id, { action: "board_approve", revision: resumed.revision });
  assert.equal(approved.status, "approved_implementation");
});

test("a protocol draft built before a decision changed cannot be approved", async () => {
  const { memory, meetings, readyInitiative, createMeeting } = createHarness();
  const meeting = await createMeeting();
  const ready = await readyInitiative("Смена решения");
  let current = await meetings.addItem(secretary, meeting.id, { revision: 1, initiativeId: ready.id });
  const itemId = current.items[0].id;
  current = await meetings.startDiscussion(secretary, meeting.id, itemId, { revision: current.revision });
  current = await meetings.setDecision(secretary, meeting.id, itemId, { revision: current.revision, decision: "pilot" });
  current = await meetings.generateProtocol(secretary, meeting.id, { revision: current.revision });
  current = await meetings.setDecision(secretary, meeting.id, itemId, {
    revision: current.revision, decision: "reject", comment: "Нецелесообразно",
  });
  await assert.rejects(
    meetings.approveProtocol(chair, meeting.id, { revision: current.revision }),
    /Сформируйте проект протокола заново/u,
  );
  assert.equal(memory.initiatives.get(ready.id)!.status, "in_discussion");
  current = await meetings.generateProtocol(secretary, meeting.id, { revision: current.revision });
  assert.match(current.protocol.text, /Решение: Отклонить\./u);
  // Editing the text keeps the draft current.
  current = await meetings.updateProtocol(secretary, meeting.id, { revision: current.revision, text: `${current.protocol.text}\nПодписи.` });
  await meetings.approveProtocol(chair, meeting.id, { revision: current.revision });
  assert.equal(memory.initiatives.get(ready.id)!.status, "rejected");
});

test("a chair who was the executor after admission cannot confirm the effect", async () => {
  const { memory, initiatives, meetings, createMeeting, addAssignment } = createHarness();
  const draft = await initiatives.create(author, {
    card: { ...completeCard("Свой эффект"), executorId: "account:chair", effectControllerId: "account:secretary" },
  });
  await initiatives.act(author, draft.id, { action: "submit_for_review", revision: 1 });
  const ready = await initiatives.act(chair, draft.id, { action: "admit", revision: 2 });
  const meeting = await createMeeting();
  let current = await meetings.addItem(secretary, meeting.id, { revision: 1, initiativeId: ready.id });
  const itemId = current.items[0].id;
  current = await meetings.startDiscussion(secretary, meeting.id, itemId, { revision: current.revision });
  current = await meetings.setDecision(secretary, meeting.id, itemId, { revision: current.revision, decision: "implement" });
  current = await meetings.generateProtocol(secretary, meeting.id, { revision: current.revision });
  await meetings.approveProtocol(chair, meeting.id, { revision: current.revision });
  const assignment = addAssignment(ready.id, "completed");
  await initiatives.assignmentLinks.recordAssignmentCreated(assignmentController, ready.id, assignment);
  let initiative = memory.initiatives.get(ready.id)!;
  initiative = await initiatives.recordResult(chair, ready.id, {
    revision: initiative.revision, description: "Сделано", actualEffectAmount: "100", source: "Отчёт", conclusion: "achieved",
  });
  initiative = await initiatives.act(chair, ready.id, { action: "complete_work", revision: initiative.revision });
  // The chair passes the role check but was the executor, so independence fails.
  await assert.rejects(
    initiatives.act(chair, ready.id, { action: "confirm_effect", revision: initiative.revision }),
    /не подтверждает собственный эффект/u,
  );
  const confirmed = await initiatives.act(secretary, ready.id, { action: "confirm_effect", revision: initiative.revision });
  assert.equal(confirmed.status, "done_confirmed");
});

test("the registry filters on the server by meeting and overdue assignments", async () => {
  const { initiatives, approvedInitiative, addAssignment, readyInitiative } = createHarness();
  const approved = await approvedInitiative("Просроченная");
  const other = await readyInitiative("Готовая");
  addAssignment(approved.id, "in_progress", "2026-10-01");
  const all = await initiatives.list(secretary);
  assert.deepEqual(all.overdueIds, [approved.id]);
  assert.equal(all.meetings.length, 1);
  assert.deepEqual((await initiatives.list(secretary, { overdue: "yes" })).initiatives.map(({ id }) => id), [approved.id]);
  assert.deepEqual(
    (await initiatives.list(secretary, { meetingId: all.meetings[0].id })).initiatives.map(({ id }) => id),
    [approved.id],
  );
  assert.deepEqual((await initiatives.list(secretary, { status: "ready" })).initiatives.map(({ id }) => id), [other.id]);
  const exported = await initiatives.exportRegistry(secretary, { stage: "implementation" });
  assert.deepEqual(exported.initiatives.map(({ id }) => id), [approved.id]);
  assert.equal(exported.name("account:owner"), "ФИО owner");
});

test("services queue notifications instead of sending them inside the transaction", async () => {
  const { initiatives, meetings, createMeeting, memory } = createHarness();
  const created: unknown[] = [];
  const draft = await initiatives.create(author, { card: completeCard("Уведомления") }, created as never);
  // While private, only the owner learns about the role.
  assert.deepEqual((created as Array<{ userIds: string[] }>).map(({ userIds }) => userIds), [["owner"]]);

  const submitted: Array<{ subject: string; userIds: string[]; audienceCapability?: string }> = [];
  await initiatives.act(author, draft.id, { action: "submit_for_review", revision: 1 }, submitted as never);
  assert.equal(submitted[0].audienceCapability, "business.manage_collegium_initiatives");
  // The author is excluded later, at delivery time.
  assert.deepEqual(submitted.slice(1).map(({ userIds }) => userIds).sort(), [["author"], ["chair"], ["secretary"]]);

  const reworked: Array<{ userIds: string[] }> = [];
  await initiatives.act(secretary, draft.id, {
    action: "return_for_rework", revision: 2, comment: "Нужны данные",
    rework: { remarks: ["Добавить расчёт"], responsibleId: "account:owner", dueDate: "2026-10-20", readinessCriterion: "Расчёт" },
  }, reworked as never);
  assert.deepEqual(reworked[0].userIds, ["author", "owner"]);

  const resubmitted: unknown[] = [];
  await initiatives.act(author, draft.id, { action: "submit_for_review", revision: 3 }, resubmitted as never);
  assert.equal(resubmitted.length, 1, "Roles are announced only on the first submission.");
  const ready = await initiatives.act(chair, draft.id, { action: "admit", revision: 4 });

  const meeting = await createMeeting();
  const agenda: Array<{ userIds: string[] }> = [];
  let current = await meetings.addItem(secretary, meeting.id, { revision: 1, initiativeId: ready.id, speakerId: "account:secretary" }, agenda as never);
  assert.deepEqual(agenda[0].userIds, ["author", "owner", "secretary"]);
  const itemId = current.items[0].id;
  current = await meetings.startDiscussion(secretary, meeting.id, itemId, { revision: current.revision });
  current = await meetings.setDecision(secretary, meeting.id, itemId, { revision: current.revision, decision: "implement", responsibleIds: ["account:author"] });
  current = await meetings.generateProtocol(secretary, meeting.id, { revision: current.revision });
  const protocol: Array<{ userIds: string[]; lines: string[] }> = [];
  await meetings.approveProtocol(chair, meeting.id, { revision: current.revision }, protocol as never);
  // One combined message per participant, initiator, owner and responsible.
  assert.deepEqual(protocol.map(({ userIds }) => userIds[0]).sort(), ["author", "chair", "owner", "secretary"]);
  assert.match(protocol[0].lines.join("\n"), /Утвердить внедрение/u);
  assert.equal(memory.initiatives.get(ready.id)!.status, "approved_implementation");
});

test("attention lists only actions the server would accept for this user", async () => {
  const { initiatives, readyInitiative } = createHarness();
  const draft = await initiatives.create(author, { card: completeCard("Черновик автора") });
  const ready = await readyInitiative("Готовая");
  const submitted = await initiatives.create(author, { card: completeCard("На оценке") });
  await initiatives.act(author, submitted.id, { action: "submit_for_review", revision: 1 });

  const reasons = async (who: ServerUserProfile) =>
    (await initiatives.attention(who)).map(({ initiativeId, reason }) => [initiativeId, reason]);
  assert.deepEqual(await reasons(author), [[draft.id, "Черновик: дополните и отправьте на оценку"]]);
  assert.deepEqual(await reasons(chair), [
    [ready.id, "Готова: включите в повестку заседания"],
    [submitted.id, "Ждёт допуска к рассмотрению Коллегией"],
  ]);
  // A secretary cannot admit, but schedules ready ideas.
  assert.deepEqual(await reasons(secretary), [[ready.id, "Готова: включите в повестку заседания"]]);
  assert.deepEqual(await reasons(profile("viewer", "view")), []);
});
