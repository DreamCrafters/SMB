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
import { createCollegiumEffectGroupsMemory } from "./testing/collegiumEffectGroupsMemory.js";
import { readCollegiumPlannedKopecks } from "./collegiumEffectControl.js";
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
  const people: CollegiumPerson[] = ["author", "owner", "secretary", "chair", "finance"].map((userId) => ({
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
  const groups = createCollegiumEffectGroupsMemory();
  const initiatives = createCollegiumInitiativesService({
    ...shared,
    effectGroups: groups.repository,
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

  return { memory, groups, initiatives, meetings, auditEvents, readyInitiative, createMeeting, approvedInitiative, addAssignment, linkedAssignments };
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

function passport(overrides: Record<string, unknown> = {}) {
  return {
    alternatives: "", requirements: "", impacts: "", dependencies: "", pilotPlan: "", pilotStopConditions: "",
    requiredAssignments: "", ceoPosition: "", draftDecision: "", revenueForecast: "", marginalIncomeForecast: "",
    costSavingForecast: "", preventedLossForecast: "", capex: "", oneTimeOpex: "", recurringOpex: "",
    internalCosts: "", workingCapital: "", scenarioConservative: "", scenarioBase: "", scenarioOptimistic: "",
    schedule: [], milestones: [], overrides: {},
    ...overrides,
  };
}

test("assignments move an approved initiative into implementation and back to the card", async () => {
  const { memory, initiatives, approvedInitiative, addAssignment } = createHarness();
  let approved = await approvedInitiative("Пилот обжига");
  assert.equal(approved.status, "approved_pilot");
  // A pilot needs its plan and stop conditions in the passport before the first assignment.
  const blocked = await initiatives.read(assignmentController, approved.id);
  assert.equal(blocked.canCreateAssignments, false);
  assert.deepEqual(blocked.passportGaps, ["План пилота", "Стоп-условия пилота"]);
  await assert.rejects(
    initiatives.assignmentLinks.lockForAssignment(assignmentController, approved.id),
    (error) => error instanceof DirectorAssignmentError && error.status === 409 && /полный паспорт/u.test(error.message),
  );
  await assert.rejects(
    initiatives.savePassport(secretary, approved.id, { revision: approved.revision, passport: passport({ pilotPlan: "Две смены" }) }),
    /причину/u,
  );
  approved = await initiatives.savePassport(secretary, approved.id, {
    revision: approved.revision,
    reason: "Пилот одобрен",
    passport: passport({ pilotPlan: "Две смены на печи 2", pilotStopConditions: "Брак выше 5 %" }),
  });
  assert.equal(memory.revisions.at(-1)?.revision.changedFields[0], "passport");
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

test("two independent signatures confirm the effect facts; the chair corrects with a reason", async () => {
  const { memory, initiatives, approvedInitiative, addAssignment, linkedAssignments } = createHarness();
  const finance = profile("finance", "view");
  const approved = await approvedInitiative("Подтверждение эффекта");
  const assignment = addAssignment(approved.id, "in_progress");
  await initiatives.assignmentLinks.recordAssignmentCreated(assignmentController, approved.id, assignment);
  let current = memory.initiatives.get(approved.id)!;

  // Owner and executor report; outsiders cannot.
  await assert.rejects(
    initiatives.recordEffectFact(profile("chair", "participant"), approved.id, "main", { revision: current.revision, actualAmount: "1", period: "x", sources: "x" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  current = await initiatives.recordResult(author, approved.id, {
    revision: current.revision,
    description: "Потери снизились до 1,4 %",
    source: "Отчёт ОТК за ноябрь",
    conclusion: "partial",
  });
  current = await initiatives.recordEffectFact(author, approved.id, "main", {
    revision: current.revision, actualAmount: "950 000", period: "ноябрь 2026 × 12", sources: "Отчёт ОТК", calculation: "Снижение потерь × себестоимость",
  });
  assert.equal(current.workflow.effectFacts?.main.version, 1);
  current = await initiatives.act(owner, approved.id, { action: "complete_work", revision: current.revision });
  assert.equal(current.status, "result_confirmation");

  // The chair here is the assigned effect controller; the financial verifier is still missing.
  await assert.rejects(
    initiatives.act(chair, approved.id, { action: "confirm_effect", revision: current.revision }),
    /Не назначен финансовый верификатор/u,
  );
  await assert.rejects(
    initiatives.assignRoles(secretary, approved.id, {
      revision: current.revision, effectControllerId: "account:chair", technicalId: "", financialId: "account:owner", reason: "Назначение",
    }),
    /Владелец или исполнитель/u,
  );
  current = await initiatives.assignRoles(secretary, approved.id, {
    revision: current.revision, effectControllerId: "account:chair", technicalId: "account:secretary", financialId: "account:finance", reason: "Назначение",
  });
  assert.equal(current.workflow.verifiers?.financialId, "account:finance");
  assert.ok(memory.revisions.at(-1)?.revision.effectSnapshot?.verifiers);

  await assert.rejects(
    initiatives.recordEffectVerdict(author, approved.id, "main", { revision: current.revision, factVersion: 1, verdict: "confirmed" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  current = await initiatives.recordEffectVerdict(chair, approved.id, "main", { revision: current.revision, factVersion: 1, verdict: "confirmed" });
  await assert.rejects(
    initiatives.recordEffectVerdict(finance, approved.id, "main", { revision: current.revision, factVersion: 2, verdict: "confirmed" }),
    /Факт изменён/u,
  );
  await assert.rejects(
    initiatives.recordEffectVerdict(finance, approved.id, "main", { revision: current.revision, factVersion: 1, verdict: "not_confirmed" }),
    /Поясните/u,
  );
  current = await initiatives.recordEffectVerdict(finance, approved.id, "main", { revision: current.revision, factVersion: 1, verdict: "confirmed" });
  assert.equal((await initiatives.read(finance, approved.id)).effectControl.rows[0].status, "confirmed");
  assert.equal((await initiatives.read(finance, approved.id)).effectControl.signerRole, "financial");

  await assert.rejects(
    initiatives.act(chair, approved.id, { action: "reject_effect", revision: current.revision, comment: "Нет" }),
    /подтвердите эффект инициативы/u,
  );
  await assert.rejects(
    initiatives.act(chair, approved.id, { action: "confirm_effect", revision: current.revision }),
    /Незавершённые поручения: К-1/u,
  );
  linkedAssignments[0] = { ...linkedAssignments[0], status: "completed" } as DirectorAssignment;
  current = await initiatives.act(finance, approved.id, { action: "confirm_effect", revision: current.revision });
  assert.equal(current.status, "done_confirmed");
  assert.deepEqual(
    current.workflow.effectConfirmation?.effects?.map(({ effectId, actualAmount, status, shareBp }) => [effectId, actualAmount, status, shareBp]),
    [["main", "950000.00", "confirmed", 10000]],
  );
  assert.equal((await initiatives.read(secretary, approved.id)).summaryStatus, "effect_confirmed");
  current = await initiatives.act(secretary, approved.id, { action: "close", revision: current.revision });

  // A correction reopens even a closed initiative; the previous decision stays in history.
  await assert.rejects(
    initiatives.act(secretary, approved.id, { action: "reopen_effect", revision: current.revision, comment: "Пересчёт" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  await assert.rejects(
    initiatives.act(chair, approved.id, { action: "reopen_effect", revision: current.revision }),
    /комментарий/u,
  );
  current = await initiatives.act(chair, approved.id, { action: "reopen_effect", revision: current.revision, comment: "Бухгалтерия уточнила затраты" });
  assert.equal(current.status, "result_confirmation");
  assert.equal(current.workflow.effectConfirmation, undefined);
  assert.deepEqual(current.workflow.effectFacts?.main.verdicts, {});
  const confirmedRevision = memory.revisions.find(({ revision }) => revision.event?.action === "confirm_effect");
  assert.equal(confirmedRevision?.revision.effectSnapshot?.effectConfirmation?.effects?.[0].actualAmount, "950000.00");
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
  await assert.rejects(
    initiatives.act(chair, referred.id, { action: "board_approve", revision: resumed.revision }),
    /Позиция генерального директора/u,
  );
  const prepared = await initiatives.savePassport(secretary, referred.id, {
    revision: resumed.revision,
    reason: "Материалы для СД",
    passport: passport({
      alternatives: "Ничего не делать: потери 3 %",
      scenarioConservative: "-100 000", scenarioBase: "500 000", scenarioOptimistic: "900 000",
      ceoPosition: "Поддерживает", draftDecision: "Одобрить модернизацию",
    }),
  });
  assert.equal(prepared.card.passport?.scenarioConservative, "-100000.00");
  const approved = await initiatives.act(chair, referred.id, { action: "board_approve", revision: prepared.revision });
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

test("the executor never signs, even as a chair; a rejected verdict ends unconfirmed", async () => {
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
  initiative = await initiatives.recordEffectFact(chair, ready.id, "main", {
    revision: initiative.revision, actualAmount: "100", period: "2026", sources: "Отчёт",
  });
  initiative = await initiatives.act(chair, ready.id, { action: "complete_work", revision: initiative.revision });
  // The executor can never be a signer, even with the chair level.
  await assert.rejects(
    initiatives.assignRoles(secretary, ready.id, {
      revision: initiative.revision, effectControllerId: "account:secretary", technicalId: "", financialId: "account:chair", reason: "x",
    }),
    /не проверяет собственный эффект/u,
  );
  await assert.rejects(
    initiatives.act(chair, ready.id, { action: "confirm_effect", revision: initiative.revision }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  initiative = await initiatives.assignRoles(secretary, ready.id, {
    revision: initiative.revision, effectControllerId: "account:secretary", technicalId: "", financialId: "account:finance", reason: "Назначение",
  });
  const finance = profile("finance", "view");
  initiative = await initiatives.recordEffectVerdict(secretary, ready.id, "main", { revision: initiative.revision, factVersion: 1, verdict: "not_confirmed", comment: "Нет данных" });
  initiative = await initiatives.recordEffectVerdict(finance, ready.id, "main", { revision: initiative.revision, factVersion: 1, verdict: "confirmed" });
  await assert.rejects(
    initiatives.act(secretary, ready.id, { action: "confirm_effect", revision: initiative.revision }),
    /Ни один эффект не подтверждён/u,
  );
  const rejected = await initiatives.act(secretary, ready.id, { action: "reject_effect", revision: initiative.revision, comment: "Эффект не доказан" });
  assert.equal(rejected.status, "done_unconfirmed");
  assert.equal(rejected.workflow.effectOutcome, "unconfirmed");
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

test("facts tie planned effects: a measured effect is not removed and roles reset their signatures", async () => {
  const { memory, initiatives, approvedInitiative, addAssignment } = createHarness();
  const approved = await approvedInitiative("Факты и паспорт");
  await initiatives.assignmentLinks.recordAssignmentCreated(assignmentController, approved.id, addAssignment(approved.id, "in_progress"));
  let current = memory.initiatives.get(approved.id)!;
  current = await initiatives.recordEffectFact(author, approved.id, "main", {
    revision: current.revision, actualAmount: "100", period: "2026", sources: "ОТК",
  });
  const effect = {
    id: "", effectTypeCode: "cost_saving", directionCode: "", kpiCode: "", siteCode: "", baselineValue: "3 %",
    baselinePeriod: "2026", targetValue: "", annualAmount: "1000", method: "", measurementStart: "2026-11-01",
    measurementEnd: "", confirmationPeriod: "", confirmationPeriodNote: "", notDuplicateExplanation: "",
  };
  await assert.rejects(
    initiatives.savePassport(secretary, approved.id, { revision: current.revision, reason: "x", passport: { effects: [effect] } }),
    /поздно/u,
  );
  await assert.rejects(
    initiatives.recordEffectFact(author, approved.id, "missing", { revision: current.revision, actualAmount: "1", period: "x", sources: "x" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 404,
  );
  current = await initiatives.act(owner, approved.id, { action: "complete_work", revision: current.revision });
  current = await initiatives.assignRoles(secretary, approved.id, {
    revision: current.revision, effectControllerId: "account:chair", technicalId: "", financialId: "account:finance", reason: "Назначение",
  });
  current = await initiatives.recordEffectVerdict(chair, approved.id, "main", { revision: current.revision, factVersion: 1, verdict: "confirmed" });
  // Replacing the effect controller drops that role's signature only.
  current = await initiatives.assignRoles(secretary, approved.id, {
    revision: current.revision, effectControllerId: "account:secretary", technicalId: "", financialId: "account:finance", reason: "Замена",
  });
  assert.deepEqual(current.workflow.effectFacts?.main.verdicts, {});
  assert.equal(current.card.effectControllerId, "account:secretary");
  assert.deepEqual(memory.revisions.at(-1)?.revision.changedFields, ["effectControllerId"]);
  // A new fact version clears signatures; the author of a fact never signs it.
  await assert.rejects(
    initiatives.recordEffectVerdict(profile("author", "secretary"), approved.id, "main", { revision: current.revision, factVersion: 1, verdict: "confirmed" }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
});

test("a joint effect splits one fact by shares and never counts twice", async () => {
  const { memory, groups, initiatives, approvedInitiative, addAssignment } = createHarness();
  const effect = (start: string, end: string) => ({
    id: "", effectTypeCode: "cost_saving", directionCode: "", kpiCode: "", siteCode: "", baselineValue: "3 %",
    baselinePeriod: "2026", targetValue: "", annualAmount: "1 000 000", method: "", measurementStart: start,
    measurementEnd: end, confirmationPeriod: "", confirmationPeriodNote: "", notDuplicateExplanation: "",
  });
  const prepare = async (title: string, start: string, end: string) => {
    let current = await approvedInitiative(title);
    current = await initiatives.savePassport(secretary, current.id, {
      revision: current.revision, reason: "Эффекты",
      passport: { pilotPlan: "План", pilotStopConditions: "Стоп", effects: [effect(start, end)] },
    });
    await initiatives.assignmentLinks.recordAssignmentCreated(assignmentController, current.id, addAssignment(current.id, "in_progress"));
    return memory.initiatives.get(current.id)!;
  };
  const first = await prepare("Новая горелка", "2026-11-01", "2026-12-31");
  const second = await prepare("Обучение операторов", "2027-01-01", "");
  const firstEffect = first.card.passport!.effects[0].id;
  const secondEffect = second.card.passport!.effects[0].id;
  const members = (a: string, b: string) => [
    { initiativeId: first.id, effectId: firstEffect, sharePercent: a },
    { initiativeId: second.id, effectId: secondEffect, sharePercent: b },
  ];

  await assert.rejects(
    initiatives.saveEffectGroup(author, { members: members("60", "40") }),
    (error) => error instanceof CollegiumInitiativeError && error.status === 403,
  );
  await assert.rejects(initiatives.saveEffectGroup(secretary, { members: members("60", "50") }), /100 %/u);
  await assert.rejects(
    initiatives.saveEffectGroup(secretary, { members: [{ initiativeId: first.id, effectId: "main", sharePercent: "50" }, members("1", "1")[1]] }),
    /описанные плановые эффекты/u,
  );
  const { groupId } = await initiatives.saveEffectGroup(secretary, { members: members("60", "40") });
  let detail = await initiatives.read(secretary, first.id);
  assert.deepEqual(detail.effectGroups[0].members.map(({ number, shareBp }) => [number, shareBp]), [
    [first.number, 6000], [second.number, 4000],
  ].sort((left, right) => String(left[0]).localeCompare(String(right[0]))));
  // The plan of each member is its share of the effect.
  assert.equal(readCollegiumPlannedKopecks(memory.initiatives.get(first.id)!), 60_000_000n);

  // One fact for the group, never per member; it is copied to everyone.
  await assert.rejects(
    initiatives.recordEffectFact(author, first.id, firstEffect, {
      revision: memory.initiatives.get(first.id)!.revision, actualAmount: "1", period: "x", sources: "x",
    }),
    /один раз для всей группы/u,
  );
  await initiatives.recordEffectGroupFact(author, groupId, {
    revision: detail.effectGroups[0].revision, actualAmount: "900 000", period: "2027", sources: "Бухгалтерия",
  });
  for (const [id, effectId] of [[first.id, firstEffect], [second.id, secondEffect]]) {
    assert.equal(memory.initiatives.get(id)!.workflow.effectFacts?.[effectId].actualAmount, "900000.00");
  }
  assert.equal((await groups.repository.readGroup(groupId))?.fact?.version, 1);
  // A second group cannot take the same effects; a grouped effect stays in the passport.
  await assert.rejects(
    initiatives.saveEffectGroup(secretary, { members: members("50", "50") }),
    /уже входит в другой/u,
  );
  const current = memory.initiatives.get(first.id)!;
  await assert.rejects(
    initiatives.savePassport(secretary, first.id, { revision: current.revision, reason: "x", passport: { pilotPlan: "План", pilotStopConditions: "Стоп", effects: [] } }),
    /(внесён факт|совместную группу)/u,
  );

  detail = await initiatives.read(secretary, first.id);
  await initiatives.saveEffectGroup(secretary, { groupId, revision: detail.effectGroups[0].revision, members: [] });
  assert.equal(memory.initiatives.get(first.id)!.workflow.effectShares, undefined);
  assert.equal(await groups.repository.readGroup(groupId), undefined);
  // The copied fact stays with each initiative after the group dissolves.
  assert.equal(memory.initiatives.get(second.id)!.workflow.effectFacts?.[secondEffect].actualAmount, "900000.00");
});
