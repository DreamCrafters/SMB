import { useEffect, useState } from "react";
import type {
  NotificationSetting,
  NotificationType,
  PositionNotificationAccount,
  PositionNotificationSettings,
  UserNotificationSettings,
} from "./contracts/notificationSettings";
import { LoadingIndicator } from "./LoadingIndicator";
import type { ShowToast } from "./services/toastStack";
import {
  requestAdminNotificationSettings,
  requestOwnNotificationSettings,
  updateAdminNotificationPermission,
  updateAdminNotificationContacts,
  updateOwnNotificationSetting,
} from "./services/notificationSettings";

type NotificationChannel = "email" | "max";

function changeNotificationChannel(
  current: Pick<NotificationSetting, "emailEnabled" | "maxEnabled">,
  channel: NotificationChannel,
  checked: boolean,
) {
  return {
    emailEnabled: channel === "email" ? checked : current.emailEnabled,
    maxEnabled: channel === "max" ? checked : current.maxEnabled,
  };
}

export function NotificationSettingsWorkspace({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; settings: UserNotificationSettings }
  >({ status: "loading" });
  const [savingType, setSavingType] = useState<NotificationType>();

  useEffect(() => {
    if (isAdminPreviewMode) {
      setState({
        status: "error",
        message: "В превью настройки рассылок доступны только для просмотра интерфейса.",
      });
      return;
    }
    const controller = new AbortController();
    void requestOwnNotificationSettings({ signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        setState(result.status === "ready"
          ? { status: "ready", settings: result.settings }
          : { status: "error", message: result.message });
      },
    );
    return () => controller.abort();
  }, [isAdminPreviewMode]);

  async function saveSetting(
    type: NotificationType,
    channel: NotificationChannel,
    checked: boolean,
  ) {
    if (state.status !== "ready") return;
    const current = state.settings.settings.find(
      (setting) => setting.type === type,
    );
    if (current === undefined) return;

    setSavingType(type);
    const result = await updateOwnNotificationSetting(
      type,
      changeNotificationChannel(current, channel, checked),
    );
    setSavingType(undefined);
    if (result.status !== "ready") {
      onShowToast("Не сохранено", result.message, "warning");
      return;
    }
    setState({ status: "ready", settings: result.settings });
    onShowToast(
      "Настройки сохранены",
      "Способы получения рассылки обновлены.",
      "success",
    );
  }

  if (state.status === "loading") {
    return <LoadingIndicator label="Загружаем настройки рассылок…" variant="page" />;
  }
  if (state.status === "error") {
    return (
      <section className="notification-settings-workspace" aria-label="Настройки">
        <p className="dispatcher-status-line">{state.message}</p>
      </section>
    );
  }

  const { settings } = state;
  const enabledSettings = settings.settings.filter(
    (setting) => setting.adminEnabled,
  );
  return (
    <section className="notification-settings-workspace" aria-label="Настройки">
      <div className="section-heading notification-settings-heading">
        <div>
          <span className="eyebrow">Персональные настройки</span>
          <h2>Рассылки</h2>
          <p>Выберите каналы только для разрешённых администратором сообщений.</p>
        </div>
      </div>
      {enabledSettings.length > 0 ? (
        <div className="notification-settings-table-scroll">
          <table className="notification-settings-table">
            <thead>
              <tr>
                <th scope="col">Рассылка</th>
                <th scope="col">емейл</th>
                <th scope="col">Макс</th>
              </tr>
            </thead>
            <tbody>
              {enabledSettings.map((setting) => (
              <tr key={setting.type}>
                <th scope="row">{setting.label}</th>
                <td>
                  <input
                    aria-label={`Email: ${setting.label}`}
                    checked={setting.emailEnabled}
                    disabled={
                      !setting.adminEnabled ||
                      settings.email === undefined ||
                      savingType !== undefined
                    }
                    type="checkbox"
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      void saveSetting(setting.type, "email", checked);
                    }}
                  />
                </td>
                <td>
                  <input
                    aria-label={`MAX: ${setting.label}`}
                    checked={setting.maxEnabled}
                    disabled={
                      !setting.adminEnabled ||
                      settings.maxUserId === undefined ||
                      savingType !== undefined
                    }
                    type="checkbox"
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      void saveSetting(setting.type, "max", checked);
                    }}
                  />
                </td>
              </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="notification-settings-note">
          Администратор пока не включил доступные для настройки уведомления.
        </p>
      )}
      {settings.email === undefined ? (
        <p className="notification-settings-note">В учётной записи не указан Email.</p>
      ) : null}
      {settings.maxUserId === undefined ? (
        <div className="notification-settings-note notification-settings-max-help">
          <p>Чтобы подключить MAX:</p>
          <ol>
            <li>Зайдите в Макс и найдите бота <a href="https://max.ru/id7116027251_bot" target="_blank" rel="noreferrer">https://max.ru/id7116027251_bot</a></li>
            <li>Напишите боту <code>/start</code></li>
            <li>Бот ответит длинным сообщением, это сообщение нужно отправить по емейлу <a href="mailto:9239239@gmail.com">9239239@gmail.com</a></li>
          </ol>
        </div>
      ) : null}
    </section>
  );
}

export function AdminNotificationSettingsWorkspace({
  onShowToast,
}: {
  onShowToast: ShowToast;
}) {
  const [positions, setPositions] = useState<PositionNotificationSettings[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<string>();
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string>();
  const [contacts, setContacts] = useState<ContactDrafts>({});

  useEffect(() => {
    const controller = new AbortController();
    setPositions([]);
    setSelectedPosition(undefined);
    setContacts({});
    setIsLoading(true);
    setStatus("");
    void requestAdminNotificationSettings({ signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        setIsLoading(false);
        if (result.status !== "ready") {
          setStatus(result.message);
          return;
        }
        setPositions(result.positions);
      },
    );
    return () => controller.abort();
  }, []);

  const selected = positions.find(
    ({ position }) => position === selectedPosition,
  );

  function selectPosition(position: PositionNotificationSettings) {
    setSelectedPosition(position.position);
    setContacts(buildContactDrafts(position.accounts));
    setStatus("");
  }

  function replacePositions(updated: PositionNotificationSettings[]) {
    setPositions(updated);
    const current = updated.find(
      ({ position }) => position === selectedPosition,
    );
    if (current !== undefined) {
      setContacts(buildContactDrafts(current.accounts));
    }
  }

  async function savePermission(
    type: NotificationType,
    adminEnabled: boolean,
  ) {
    if (selected === undefined) return;
    setStatus("");
    setSavingKey(`${selected.position}:${type}`);
    const result = await updateAdminNotificationPermission(
      selected.position,
      type,
      { adminEnabled },
    );
    setSavingKey(undefined);
    if (result.status !== "ready") {
      setStatus(result.message);
      return;
    }
    replacePositions(result.positions);
    onShowToast(
      "Рассылка обновлена",
      adminEnabled
        ? "Сотрудники должности смогут настроить способы получения рассылки."
        : "Рассылка скрыта из персональных настроек должности.",
      "success",
    );
  }

  async function saveContacts(account: PositionNotificationAccount) {
    const draft = contacts[account.userId] ?? emptyContactDraft;
    setStatus("");
    setSavingKey(`${account.userId}:contacts`);
    const result = await updateAdminNotificationContacts(
      account.userId,
      draft.email,
      draft.maxUserId,
    );
    setSavingKey(undefined);
    if (result.status !== "ready") {
      setStatus(result.message);
      return;
    }
    replacePositions(result.positions);
    onShowToast(
      "Контакты сохранены",
      `Контакты «${account.displayName}» обновлены.`,
      "success",
    );
  }

  return (
    <section className="notification-admin-workspace" aria-label="Уведомления">
      <div className="section-heading notification-admin-heading">
        <div>
          <span className="eyebrow">Учётные записи</span>
          <h2>Уведомления</h2>
          <p>
            Выберите должность и отметьте типы уведомлений, которые её
            сотрудники смогут настроить самостоятельно. Контакты остаются
            личными и заполняются для каждой учётной записи.
          </p>
        </div>
      </div>
      {status.length > 0 ? <p className="admin-accounts-status-message" role="status">{status}</p> : null}
      {isLoading ? <LoadingIndicator label="Загружаем настройки уведомлений…" variant="page" /> : (
        <div className="notification-admin-layout">
          <div className="notification-admin-users" aria-label="Должности уведомлений">
            <table className="notification-admin-user-table">
              <thead>
                <tr>
                  <th scope="col">Должность</th>
                  <th scope="col">Аккаунтов</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <tr
                    className={`notification-admin-user-row${position.position === selectedPosition ? " is-active" : ""}`}
                    aria-selected={position.position === selectedPosition}
                    key={position.position}
                    tabIndex={savingKey === undefined ? 0 : -1}
                    onClick={() => {
                      if (savingKey === undefined) selectPosition(position);
                    }}
                    onKeyDown={(event) => {
                      if (
                        savingKey === undefined &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        selectPosition(position);
                      }
                    }}
                  >
                    <td>{position.positionDisplayName}</td>
                    <td>{position.accounts.length}</td>
                  </tr>
                ))}
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={2}>Должностей пока нет.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {selected === undefined ? (
            <p className="dispatcher-status-line">Выберите должность, чтобы настроить её уведомления и контакты сотрудников.</p>
          ) : (
            <div className="notification-admin-detail">
              <div className="notification-settings-table-scroll">
                <table className="notification-settings-table">
                  <caption>Разрешено должности</caption>
                  <thead>
                    <tr>
                      <th scope="col">Рассылка</th>
                      <th scope="col">Вкл.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.permissions.map((permission) => (
                      <tr key={permission.type}>
                        <th scope="row">{permission.label}</th>
                        <td><input aria-label={`Включить: ${permission.label}`} type="checkbox" checked={permission.adminEnabled} disabled={savingKey !== undefined} onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          void savePermission(permission.type, checked);
                        }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected.accounts.length === 0 ? (
                <p className="dispatcher-status-line">У должности пока нет учётных записей: разрешения сохранятся и применятся к будущим сотрудникам.</p>
              ) : selected.accounts.map((account) => {
                const draft = contacts[account.userId] ?? emptyContactDraft;
                return (
                  <div className="notification-admin-contacts" key={account.userId}>
                    <p className="notification-admin-contacts-title">
                      <strong>{account.displayName}</strong>
                      <span>{account.login}</span>
                    </p>
                    <label>
                      <span>Email</span>
                      <input
                        type="email"
                        value={draft.email}
                        disabled={savingKey !== undefined}
                        onChange={(event) => {
                          const email = event.currentTarget.value;
                          setContacts((current) => ({
                            ...current,
                            [account.userId]: { ...(current[account.userId] ?? emptyContactDraft), email },
                          }));
                        }}
                      />
                    </label>
                    <label>
                      <span>MAX</span>
                      <input
                        value={draft.maxUserId}
                        disabled={savingKey !== undefined}
                        onChange={(event) => {
                          const maxUserId = event.currentTarget.value;
                          setContacts((current) => ({
                            ...current,
                            [account.userId]: { ...(current[account.userId] ?? emptyContactDraft), maxUserId },
                          }));
                        }}
                      />
                    </label>
                    <button className="secondary-button" type="button" disabled={savingKey !== undefined} onClick={() => void saveContacts(account)}>Сохранить контакты</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

type ContactDraft = { email: string; maxUserId: string };
type ContactDrafts = Record<string, ContactDraft>;

const emptyContactDraft: ContactDraft = { email: "", maxUserId: "" };

function buildContactDrafts(
  accounts: readonly PositionNotificationAccount[],
): ContactDrafts {
  return Object.fromEntries(accounts.map((account) => [
    account.userId,
    { email: account.email ?? "", maxUserId: account.maxUserId ?? "" },
  ]));
}
