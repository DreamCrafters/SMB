import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultDispatcherDepartment,
  primaryBusinessAccount,
  resolveAccountProvisioningScope,
} from "./accountProvisioning.js";

test("owner and dispatcher resolve to the same primary business", () => {
  const owner = resolveAccountProvisioningScope(
    { accountType: "business_owner", displayName: "Владелец" },
    unusedIdFactory,
  );
  const dispatcher = resolveAccountProvisioningScope(
    { accountType: "dispatcher", displayName: "Диспетчер" },
    unusedIdFactory,
  );

  assert.deepEqual(owner, {
    scopeKind: "business",
    businessAccount: primaryBusinessAccount,
  });
  assert.deepEqual(dispatcher, {
    scopeKind: "department",
    businessAccount: primaryBusinessAccount,
    department: defaultDispatcherDepartment,
  });
});

test("worker receives the primary business and a generated department id", () => {
  const worker = resolveAccountProvisioningScope(
    {
      accountType: "worker",
      displayName: "Работник Один",
      departmentDisplayName: "Участок 1",
    },
    () => "generated-worker-department",
  );

  assert.deepEqual(worker, {
    scopeKind: "department",
    businessAccount: primaryBusinessAccount,
    department: {
      id: "generated-worker-department",
      displayName: "Участок 1",
    },
  });
});

test("worker department label defaults to the account display name", () => {
  const worker = resolveAccountProvisioningScope(
    {
      accountType: "worker",
      displayName: "Работник Один",
    },
    () => "generated-worker-department",
  );

  assert.equal(worker.department?.displayName, "Работник Один");
});

test("dispatcher override for another business receives its own department id", () => {
  const dispatcher = resolveAccountProvisioningScope(
    {
      accountType: "dispatcher",
      displayName: "Диспетчер филиала",
      businessAccountId: "branch-business",
    },
    () => "generated-branch-dispatch",
  );

  assert.deepEqual(dispatcher, {
    scopeKind: "department",
    businessAccount: {
      id: "branch-business",
      displayName: "branch-business",
    },
    department: {
      id: "generated-branch-dispatch",
      displayName: "Диспетчерская",
    },
  });
});

test("internal provisioning overrides remain available for the auth CLI", () => {
  const worker = resolveAccountProvisioningScope(
    {
      accountType: "worker",
      displayName: "Работник",
      businessAccountId: "other-business",
      businessDisplayName: "Другой бизнес",
      departmentId: "other-department",
      departmentDisplayName: "Другой участок",
    },
    unusedIdFactory,
  );

  assert.deepEqual(worker, {
    scopeKind: "department",
    businessAccount: {
      id: "other-business",
      displayName: "Другой бизнес",
    },
    department: {
      id: "other-department",
      displayName: "Другой участок",
    },
  });
});

test("administrator keeps platform scope without generated ids", () => {
  let didCreateId = false;
  const admin = resolveAccountProvisioningScope(
    { accountType: "admin", displayName: "Администратор" },
    () => {
      didCreateId = true;
      return "unused";
    },
  );

  assert.deepEqual(admin, { scopeKind: "platform" });
  assert.equal(didCreateId, false);
});

function unusedIdFactory(): never {
  throw new Error("ID factory should not be called.");
}
