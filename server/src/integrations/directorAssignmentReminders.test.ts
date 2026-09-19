import assert from "node:assert/strict";
import test from "node:test";
import type { DirectorAssignment, PersonnelEmployee } from "../contracts/directorAssignments.js";
import { createDirectorAssignmentReminderRunner } from "./directorAssignmentReminders.js";

function fixture() {
  let time = new Date("2026-09-07T21:30:00Z"); // September 8 in Moscow: two days left.
  const assignment = { id: "assignment", number: "ГД-117", revision: 1, assignedOn: "2026-09-01", currentOccurrenceDate: "2026-09-10", status: "in_progress", needsClarification: false, responsibleId: "account:owner", coExecutorIds: ["account:helper", "legacy", "account:inactive"], summary: "Представить отчёт" } as DirectorAssignment;
  const employees = new Map(["owner", "helper"].map(id => [`account:${id}`, { id: `account:${id}`, userId: id, active: true } as PersonnelEmployee]));
  employees.set("legacy", { id: "legacy", userId: "helper", active: true } as PersonnelEmployee);
  const recipients = [
    { userId: "owner", position: "worker" as const, email: "owner@example.test", maxUserId: "owner-max" },
    { userId: "helper", position: "worker" as const, maxUserId: "helper-max" },
    { userId: "outsider", position: "worker" as const, email: "other@example.test" },
  ];
  const claims = new Map<string, { token: string; until: number; sent: boolean }>();
  const calls: string[] = [];
  let errors = 0;
  let emailFails = false;
  const dependencies = {
    repository: {
      async list() { return [structuredClone(assignment)]; },
      async read() { return structuredClone(assignment); },
      async readAssignableEmployee(id: string) { return employees.get(id); },
      async claimReminder(delivery: object, token: string) {
        const key = JSON.stringify(delivery), old = claims.get(key);
        if (old && (old.sent || old.until > +time)) return false;
        claims.set(key, { token, until: +time + 900_000, sent: false }); return true;
      },
      async completeReminder(delivery: object, token: string) {
        const claim = claims.get(JSON.stringify(delivery));
        if (claim?.token === token) claim.sent = true;
      },
    },
    notificationSettings: { async listDeliveryRecipients(type: string) { assert.equal(type, "general_director_assignments"); return recipients; } },
    async sendEmail(recipient: string, _subject: string, text: string) {
      assert.match(text, /До срока: [123] /u);
      if (emailFails) throw new Error("do not log private provider payload"); calls.push(`email:${recipient}`);
    },
    async sendMax(recipient: string) { calls.push(`max:${recipient}`); },
    now: () => time,
    onError: () => { errors++; },
  };
  return { assignment, employees, recipients, calls, claims, dependencies, errors: () => errors, failEmail(value: boolean) { emailFails = value; }, advance(ms: number) { time = new Date(+time + ms); } };
}

test("reminders reach only opted-in current participants and are deduplicated across runners", async () => {
  const f = fixture();
  const runner = createDirectorAssignmentReminderRunner(f.dependencies);
  await Promise.all([runner.run(), runner.run(), createDirectorAssignmentReminderRunner(f.dependencies).run()]);
  assert.deepEqual(f.calls.sort(), ["email:owner@example.test", "max:helper-max", "max:owner-max"]);
  await createDirectorAssignmentReminderRunner(f.dependencies).run();
  assert.equal(f.calls.length, 3);
  f.advance(86_400_000);
  await runner.run();
  assert.equal(f.calls.length, 6);
});

test("failed email retries after its lease while MAX delivery is not repeated", async () => {
  const f = fixture(); f.failEmail(true);
  const runner = createDirectorAssignmentReminderRunner(f.dependencies);
  await runner.run();
  assert.equal(f.errors(), 1);
  assert.deepEqual(f.calls.sort(), ["max:helper-max", "max:owner-max"]);
  f.failEmail(false);
  await runner.run(); assert.equal(f.calls.length, 2);
  f.advance(900_001); await createDirectorAssignmentReminderRunner(f.dependencies).run();
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls.at(-1), "email:owner@example.test");
});

test("disabled transports do not claim deliveries and removed participants are not notified", async () => {
  const f = fixture();
  await createDirectorAssignmentReminderRunner({ ...f.dependencies, sendEmail: undefined, sendMax: undefined }).run();
  assert.equal(f.claims.size, 0);
  f.employees.delete("account:owner"); f.employees.delete("legacy");
  f.recipients.splice(1, 1);
  await createDirectorAssignmentReminderRunner(f.dependencies).run();
  assert.equal(f.calls.length, 0);
});

test("re-reading a completed or rescheduled assignment suppresses an outdated reminder", async () => {
  const f = fixture();
  f.dependencies.repository.read = async () => ({ ...f.assignment, status: "completed" });
  await createDirectorAssignmentReminderRunner(f.dependencies).run();
  assert.equal(f.calls.length, 0);
  f.dependencies.repository.read = async () => ({ ...f.assignment, currentOccurrenceDate: "2026-10-10" });
  await createDirectorAssignmentReminderRunner(f.dependencies).run();
  assert.equal(f.calls.length, 0);
});

test("stopping cancels a pending MAX request and prevents subsequent deliveries", async () => {
  const f = fixture();
  let started!: () => void;
  const sending = new Promise<void>(resolve => { started = resolve; });
  let aborted = false;
  const runner = createDirectorAssignmentReminderRunner({ ...f.dependencies, sendEmail: undefined,
    sendMax: async (_recipient, _subject, _text, signal) => {
      started();
      await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true }));
    },
  });
  const run = runner.run(); await sending;
  await runner.stop(); await run;
  assert.equal(aborted, true);
  assert.equal(f.claims.size, 1);
  await runner.run(); assert.equal(f.claims.size, 1);
});
