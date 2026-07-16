import assert from "node:assert/strict";
import test from "node:test";
import {
  primaryBusinessAccount,
  resolveAccountProvisioningScope,
} from "./accountProvisioning.js";

test("all non-admin accounts resolve to the same primary business scope", () => {
  const owner = resolveAccountProvisioningScope(
    { accountType: "business_owner", displayName: "Владелец" },
  );
  const dispatcher = resolveAccountProvisioningScope(
    { accountType: "dispatcher", displayName: "Диспетчер" },
  );
  const worker = resolveAccountProvisioningScope(
    { accountType: "worker", displayName: "Работник Один" },
  );

  assert.deepEqual(owner, {
    scopeKind: "business",
    businessAccount: primaryBusinessAccount,
  });
  assert.deepEqual(dispatcher, owner);
  assert.deepEqual(worker, owner);
});

test("non-admin override keeps another business without a department", () => {
  const dispatcher = resolveAccountProvisioningScope(
    {
      accountType: "dispatcher",
      displayName: "Диспетчер филиала",
      businessAccountId: "branch-business",
    },
  );

  assert.deepEqual(dispatcher, {
    scopeKind: "business",
    businessAccount: {
      id: "branch-business",
      displayName: "branch-business",
    },
  });
});

test("internal business override remains available for the auth CLI", () => {
  const worker = resolveAccountProvisioningScope(
    {
      accountType: "worker",
      displayName: "Работник",
      businessAccountId: "other-business",
      businessDisplayName: "Другой бизнес",
    },
  );

  assert.deepEqual(worker, {
    scopeKind: "business",
    businessAccount: {
      id: "other-business",
      displayName: "Другой бизнес",
    },
  });
});

test("administrator keeps platform scope", () => {
  const admin = resolveAccountProvisioningScope(
    { accountType: "admin", displayName: "Администратор" },
  );

  assert.deepEqual(admin, { scopeKind: "platform" });
});
