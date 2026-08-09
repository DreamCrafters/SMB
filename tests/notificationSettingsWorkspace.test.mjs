import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("notification workspaces expose the List9 matrix and exact MAX onboarding", async () => {
  const workspace = await readFile(
    new URL("src/NotificationSettings.tsx", projectRoot),
    "utf8",
  );

  assert.match(workspace, />Администраторам</u);
  assert.match(workspace, />Рассылка</u);
  assert.match(workspace, />Включить</u);
  assert.match(workspace, />емейл</u);
  assert.match(workspace, />Макс</u);
  assert.match(workspace, /<th scope="col">Должность<\/th>/u);
  assert.match(workspace, /<th scope="col">Имя<\/th>/u);
  assert.match(
    workspace,
    /<button\s+type="button"\s+disabled=\{savingKey !== undefined\}\s+onClick=\{\(\) => selectUser\(user\)\}\s*>/u,
  );
  assert.match(workspace, /!setting\.adminEnabled/u);
  assert.match(workspace, /settings\.email === undefined/u);
  assert.match(workspace, /settings\.maxUserId === undefined/u);
  assert.match(workspace, /selected\?\.isProtected === true/u);
  assert.match(workspace, /!canManageProtectedAccounts/u);
  assert.match(
    workspace,
    /async function savePermission[\s\S]*?setStatus\(""\);[\s\S]*?setSavingKey\(key\)/u,
  );
  assert.match(
    workspace,
    /async function saveContacts[\s\S]*?setStatus\(""\);[\s\S]*?setSavingKey/u,
  );
  assert.match(workspace, /https:\/\/max\.ru\/id7116027251_bot/u);
  assert.match(workspace, /Напишите боту <code>\/start<\/code>/u);
  assert.match(workspace, /9239239@gmail\.com/u);
});
