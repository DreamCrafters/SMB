import { useEffect, useState, type MouseEvent } from "react";
import type {
  NotificationType,
  UserNotificationSettings,
} from "./contracts/notificationSettings";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  requestAdminNotificationSettings,
  requestOwnNotificationSettings,
  updateAdminNotificationContacts,
  updateAdminNotificationPermission,
  updateOwnNotificationSetting,
} from "./services/notificationSettings";

type ShowToast = (title: string, message: string) => void;

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
    channel: "email" | "max",
    checked: boolean,
  ) {
    if (state.status !== "ready") return;
    const current = state.settings.settings.find(
      (setting) => setting.type === type,
    );
    if (current === undefined) return;

    setSavingType(type);
    const result = await updateOwnNotificationSetting(type, {
      emailEnabled: channel === "email" ? checked : current.emailEnabled,
      maxEnabled: channel === "max" ? checked : current.maxEnabled,
    });
    setSavingType(undefined);
    if (result.status !== "ready") {
      onShowToast("Не сохранено", result.message);
      return;
    }
    setState({ status: "ready", settings: result.settings });
    onShowToast("Настройки сохранены", "Способы получения рассылки обновлены.");
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
  return (
    <section className="notification-settings-workspace" aria-label="Настройки">
      <div className="section-heading notification-settings-heading">
        <div>
          <span className="eyebrow">Персональные настройки</span>
          <h2>Рассылки</h2>
          <p>Выберите каналы только для разрешённых администратором сообщений.</p>
        </div>
      </div>
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
            {settings.settings.map((setting) => (
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

export function AdminNotificationSettingsModal({
  isOpen,
  canManageProtectedAccounts,
  onClose,
  onContactsUpdated,
  onShowToast,
}: {
  isOpen: boolean;
  canManageProtectedAccounts: boolean;
  onClose: () => void;
  onContactsUpdated: () => void;
  onShowToast: ShowToast;
}) {
  const [users, setUsers] = useState<UserNotificationSettings[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>();
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string>();
  const [contacts, setContacts] = useState({ email: "", maxUserId: "" });

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setUsers([]);
    setSelectedUserId(undefined);
    setContacts({ email: "", maxUserId: "" });
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
        setUsers(result.users);
      },
    );
    return () => controller.abort();
  }, [isOpen]);

  const selected = users.find(({ userId }) => userId === selectedUserId);

  function selectUser(user: UserNotificationSettings) {
    setSelectedUserId(user.userId);
    setContacts({ email: user.email ?? "", maxUserId: user.maxUserId ?? "" });
    setStatus("");
  }

  function replaceUser(updated: UserNotificationSettings) {
    setUsers((current) => current.map((user) =>
      user.userId === updated.userId ? updated : user,
    ));
  }

  async function savePermission(type: NotificationType, adminEnabled: boolean) {
    if (selected === undefined) return;
    const key = `${selected.userId}:${type}`;
    setStatus("");
    setSavingKey(key);
    const result = await updateAdminNotificationPermission(
      selected.userId,
      type,
      adminEnabled,
    );
    setSavingKey(undefined);
    if (result.status !== "ready") {
      setStatus(result.message);
      return;
    }
    replaceUser(result.settings);
    onShowToast("Рассылка обновлена", "Разрешение администратора сохранено.");
  }

  async function saveContacts() {
    if (selected === undefined) return;
    setStatus("");
    setSavingKey(`${selected.userId}:contacts`);
    const result = await updateAdminNotificationContacts(
      selected.userId,
      contacts.email,
      contacts.maxUserId,
    );
    setSavingKey(undefined);
    if (result.status !== "ready") {
      setStatus(result.message);
      return;
    }
    replaceUser(result.settings);
    setContacts({
      email: result.settings.email ?? "",
      maxUserId: result.settings.maxUserId ?? "",
    });
    onContactsUpdated();
    onShowToast("Контакты сохранены", `Контакты «${result.settings.displayName}» обновлены.`);
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && savingKey === undefined) {
      onClose();
    }
  }

  if (!isOpen) return null;

  const selectedAccountIsReadOnly =
    selected?.isProtected === true && !canManageProtectedAccounts;

  return (
    <div className="admin-db-modal-backdrop" onMouseDown={closeOnBackdrop}>
      <section className="admin-db-modal notification-admin-modal" role="dialog" aria-modal="true" aria-label="Рассылки">
        <div className="admin-db-modal-heading">
          <div>
            <span className="eyebrow">Учётные записи</span>
            <h2>Рассылки</h2>
          </div>
          <button className="secondary-button" type="button" disabled={savingKey !== undefined} onClick={onClose}>Закрыть</button>
        </div>
        {status.length > 0 ? <p className="admin-accounts-status-message" role="status">{status}</p> : null}
        {isLoading ? <LoadingIndicator label="Загружаем журнал рассылок…" variant="page" /> : (
          <div className="notification-admin-layout">
            <div className="notification-admin-users" aria-label="Пользователи рассылок">
              <table className="notification-admin-user-table">
                <thead>
                  <tr>
                    <th scope="col">Должность</th>
                    <th scope="col">Имя</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      className={user.userId === selectedUserId ? "is-active" : ""}
                      key={user.userId}
                    >
                      <td>{user.positionDisplayName}</td>
                      <td>
                        <button
                          type="button"
                          disabled={savingKey !== undefined}
                          onClick={() => selectUser(user)}
                        >
                          {user.displayName}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={2}>Пользователей пока нет.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {selected === undefined ? (
              <p className="dispatcher-status-line">Выберите пользователя, чтобы открыть его таблицу рассылок.</p>
            ) : (
              <div className="notification-admin-detail">
                {selectedAccountIsReadOnly ? (
                  <p className="admin-accounts-status-message">
                    Защищённую учётную запись может изменять только исходный admin.
                  </p>
                ) : null}
                <div className="notification-admin-contacts">
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={contacts.email}
                      disabled={savingKey !== undefined || selectedAccountIsReadOnly}
                      onChange={(event) => {
                        const email = event.currentTarget.value;
                        setContacts((current) => ({ ...current, email }));
                      }}
                    />
                  </label>
                  <label>
                    <span>MAX</span>
                    <input
                      value={contacts.maxUserId}
                      disabled={savingKey !== undefined || selectedAccountIsReadOnly}
                      onChange={(event) => {
                        const maxUserId = event.currentTarget.value;
                        setContacts((current) => ({ ...current, maxUserId }));
                      }}
                    />
                  </label>
                  <button className="secondary-button" type="button" disabled={savingKey !== undefined || selectedAccountIsReadOnly} onClick={() => void saveContacts()}>Сохранить контакты</button>
                </div>
                <div className="notification-settings-table-scroll">
                  <table className="notification-settings-table">
                    <caption>Администраторам</caption>
                    <thead>
                      <tr>
                        <th scope="col">Рассылка</th>
                        <th scope="col">Включить</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.settings.map((setting) => (
                        <tr key={setting.type}>
                          <th scope="row">{setting.label}</th>
                          <td><input aria-label={`Разрешить: ${setting.label}`} type="checkbox" checked={setting.adminEnabled} disabled={savingKey !== undefined || selectedAccountIsReadOnly} onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            void savePermission(setting.type, checked);
                          }} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
