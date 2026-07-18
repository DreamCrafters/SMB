import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test(
  "successful admin actions use the fixed toast stack instead of page-flow statuses",
  async () => {
    const [appSource, stylesSource] = await Promise.all([
      readFile(new URL("src/App.tsx", projectRoot), "utf8"),
      readFile(new URL("src/styles.css", projectRoot), "utf8"),
    ]);

    const inlineSuccessCalls = [
      'setWorkspaceStatus(`Должность «${result.position.displayName}» сохранена.`);',
      'setWorkspaceStatus(`Должность «${position.displayName}» удалена.`);',
      'setWorkspaceStatus(`Учётная запись «${result.account.login}» создана.`);',
      'setWorkspaceStatus(`Пароль для «${submittedLogin}» изменён.`);',
      'setWorkspaceStatus(`Учётная запись «${account.login}» удалена.`);',
      'setMutationStatus("Строка БД обновлена.");',
      'setMutationStatus("Строка БД удалена.");',
      'setMutationStatus(`Раздел очищен. Удалено записей: ${result.deleted}.`);',
      'setStatusMessage(\n      `Импорт завершён: добавлено ${result.inserted}, пропущено ${result.skipped}.`,\n    );',
    ];

    for (const inlineSuccessCall of inlineSuccessCalls) {
      assert.equal(
        appSource.includes(inlineSuccessCall),
        false,
        `success notification must not change page layout: ${inlineSuccessCall}`,
      );
    }

    const toastSuccessMessages = [
      'onShowToast(\n      "Сохранено",\n      `Должность «${result.position.displayName}» сохранена.`,',
      'onShowToast("Удалено", `Должность «${position.displayName}» удалена.`);',
      'onShowToast(\n      "Аккаунт создан",\n      `Учётная запись «${result.account.login}» создана.`,',
      'onShowToast("Пароль изменён", `Пароль для «${submittedLogin}» изменён.`);',
      'onShowToast("Сохранено", "Строка БД обновлена.");',
      'onShowToast("Удалено", "Строка БД удалена.");',
    ];

    for (const toastSuccessMessage of toastSuccessMessages) {
      assert.equal(
        appSource.includes(toastSuccessMessage),
        true,
        `success notification must be shown in the toast stack: ${toastSuccessMessage}`,
      );
    }

    assert.doesNotMatch(appSource, /setWorkspaceStatus\(\s*isEnabled\s*\?/);
    assert.doesNotMatch(
      appSource,
      /setWorkspaceStatus\(\s*`Должность для «\$\{account\.login\}» изменена/,
    );

    assert.match(
      appSource,
      /function AdminWorkspace\(\{[\s\S]*?onShowToast[\s\S]*?\}\)/,
    );
    assert.match(
      appSource,
      /function AdminAccountsWorkspace\(\{[\s\S]*?onShowToast[\s\S]*?\}\)/,
    );
    assert.match(
      appSource,
      /function AdminDatabaseWorkspace\(\{[\s\S]*?onShowToast[\s\S]*?\}\)/,
    );
    assert.match(
      stylesSource,
      /\.toast-viewport\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*var\(--density-4\);[^}]*right:\s*var\(--density-4\);/,
    );
    assert.doesNotMatch(stylesSource, /\.toast-viewport\s*\{[^}]*top:/);
    assert.match(
      appSource,
      /setAccountsState\(\(current\) =>\s*current\.status === "ready"\s*\? current\s*:/,
    );
    assert.match(
      appSource,
      /setRowsState\(\(current\) =>\s*current\.status === "ready" &&\s*current\.table\.name === selectedTableName &&\s*current\.offset === rowsOffset\s*\? current\s*:/,
    );
  },
);
