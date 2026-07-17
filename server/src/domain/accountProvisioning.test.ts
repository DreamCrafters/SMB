import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccountProvisioningScope } from "./accountProvisioning.js";

test("all non-admin accounts resolve to the organization scope", () => {
  const owner = resolveAccountProvisioningScope({ accountType: "business_owner" });
  const dispatcher = resolveAccountProvisioningScope({ accountType: "dispatcher" });
  const worker = resolveAccountProvisioningScope({ accountType: "worker" });

  assert.deepEqual(owner, { scopeKind: "organization" });
  assert.deepEqual(dispatcher, owner);
  assert.deepEqual(worker, owner);
});

test("administrator keeps platform scope", () => {
  const admin = resolveAccountProvisioningScope({ accountType: "admin" });

  assert.deepEqual(admin, { scopeKind: "platform" });
});
