import { useEffect, useState, type FormEvent } from "react";
import type {
  AccountCapability,
  AccountType,
  DispatcherSubmission,
  ServerUserProfile,
} from "./contracts";
import {
  accountShellPanels,
  accountTypeLabels,
  authOptions,
  navigationItemsByAccountType,
  roleWorkspaceCopy,
  shellCopy,
  statusPanels,
  type AccountShellPanel,
  type NavigationItem,
  type StatusPanel,
} from "./content";
import {
  clearDevAccessSession,
  selectDevAccessSession,
  type DevAccessSessionResult,
} from "./services/devAccessSession";
import {
  requestAccessProfile,
  type AccessProfileLoadState,
} from "./services/accessProfile";
import {
  requestDispatcherFeed,
  submitDispatcherSubmission,
  type DispatcherFeedResult,
} from "./services/dispatcherSubmissions";
import { getRemoteServerConnection } from "./services/remoteServer";

type OwnerTab = "overview" | "dispatcher";

type SessionRequestState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
      accountType?: AccountType;
    }
  | {
      status: "error";
      message: string;
    };

type DispatcherFeedLoadState =
  | {
      status: "loading";
      message: string;
    }
  | DispatcherFeedResult;

const initialAccessProfileState: AccessProfileLoadState = {
  status: "loading",
  message: "Запрашиваем серверный профиль доступа.",
};

const initialSessionRequestState: SessionRequestState = {
  status: "idle",
};

const initialDispatcherFeedState: DispatcherFeedLoadState = {
  status: "loading",
  message: "Ожидаем профиль владельца для запроса диспетчерской истории.",
};

function stateLabel(state: NavigationItem["state"] | StatusPanel["state"]) {
  switch (state) {
    case "active":
      return "готов";
    case "loading":
      return "загрузка";
    case "ready":
      return "получен";
    case "pending":
      return "ожидание";
    case "locked":
      return "сервер";
    case "waiting":
      return "запрос";
    case "empty":
      return "пусто";
    case "error":
      return "ошибка";
  }
}

export default function App() {
  const [accessProfile, setAccessProfile] = useState<AccessProfileLoadState>(
    initialAccessProfileState,
  );
  const [sessionRequest, setSessionRequest] = useState<SessionRequestState>(
    initialSessionRequestState,
  );
  const [requestVersion, setRequestVersion] = useState(0);
  const [dataEntryStatus, setDataEntryStatus] = useState(
    "Серверная запись формы ещё не подключена.",
  );
  const [isDataEntrySubmitting, setIsDataEntrySubmitting] = useState(false);
  const [ownerTab, setOwnerTab] = useState<OwnerTab>("overview");
  const [dispatcherFeed, setDispatcherFeed] = useState<DispatcherFeedLoadState>(
    initialDispatcherFeedState,
  );
  const [dispatcherFeedVersion, setDispatcherFeedVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setAccessProfile({
      status: "loading",
      message: "Запрашиваем серверный профиль доступа.",
    });

    requestAccessProfile({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) {
        setAccessProfile(result);
      }
    });

    return () => {
      controller.abort();
    };
  }, [requestVersion]);

  useEffect(() => {
    if (
      accessProfile.status !== "ready" ||
      !hasCapability(accessProfile.profile, "business.view_dispatcher_feed")
    ) {
      setDispatcherFeed(initialDispatcherFeedState);
      return;
    }

    let isActive = true;
    let currentController: AbortController | undefined;

    function loadDispatcherFeed() {
      currentController?.abort();
      currentController = new AbortController();

      setDispatcherFeed((current) =>
        current.status === "ready"
          ? current
          : {
              status: "loading",
              message: "Запрашиваем диспетчерскую историю с удалённого сервера.",
            },
      );

      requestDispatcherFeed({ signal: currentController.signal }).then((result) => {
        if (isActive) {
          setDispatcherFeed(result);
        }
      });
    }

    loadDispatcherFeed();
    const intervalId = window.setInterval(loadDispatcherFeed, 5_000);

    return () => {
      isActive = false;
      currentController?.abort();
      window.clearInterval(intervalId);
    };
  }, [accessProfile, dispatcherFeedVersion]);

  async function handleSelectAccount(accountType: AccountType) {
    setSessionRequest({
      status: "loading",
      accountType,
    });

    const result = await selectDevAccessSession(accountType);
    handleSessionResult(result);
  }

  async function handleClearSession() {
    setSessionRequest({
      status: "loading",
    });

    const result = await clearDevAccessSession();
    handleSessionResult(result);
  }

  function handleSessionResult(result: DevAccessSessionResult) {
    if (result.status === "ready") {
      setSessionRequest(initialSessionRequestState);
      setRequestVersion((version) => version + 1);
      return;
    }

    setSessionRequest({
      status: "error",
      message: result.message,
    });
  }

  function handleRetryProfile() {
    setRequestVersion((version) => version + 1);
  }

  async function handleDataEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (accessProfile.status !== "ready") {
      setDataEntryStatus("Нельзя отправить данные без серверного профиля доступа.");
      return;
    }

    if (
      !hasCapability(accessProfile.profile, "business.submit_dispatcher_forms") &&
      !hasCapability(accessProfile.profile, "business.submit_forms")
    ) {
      setDataEntryStatus("Серверный профиль не разрешает отправку формы.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const businessAccountId = getActiveBusinessAccountId(accessProfile.profile);

    setIsDataEntrySubmitting(true);
    setDataEntryStatus("Отправляем данные на удалённый сервер.");

    const result = await submitDispatcherSubmission({
      businessAccountId,
      period: String(formData.get("period") ?? ""),
      metricCode: String(formData.get("metricCode") ?? ""),
      rawValue: String(formData.get("rawValue") ?? ""),
      comment: readOptionalFormValue(formData.get("comment")),
    });

    setIsDataEntrySubmitting(false);

    if (result.status === "ready") {
      setDataEntryStatus(
        `Сервер принял отправку ${result.submission.id}. История обновится у владельца через remote feed.`,
      );
      form.reset();
      return;
    }

    setDataEntryStatus(result.message);
  }

  if (accessProfile.status !== "ready") {
    return (
      <AuthScreen
        accessProfile={accessProfile}
        sessionRequest={sessionRequest}
        onRetry={handleRetryProfile}
        onSelectAccount={handleSelectAccount}
      />
    );
  }

  const profile = accessProfile.profile;
  const profileStatusPanel = buildProfileStatusPanel(accessProfile);
  const visibleStatusPanels = [
    profileStatusPanel,
    buildRemoteServerStatusPanel(),
    ...statusPanels.slice(1),
  ];
  const serverSummary = buildServerSummary(accessProfile);

  return (
    <main className="ops-shell">
      <SideRail profile={profile} />

      <section className="workspace" aria-label="Рабочая область">
        <ServerStrip
          accessProfile={accessProfile}
          serverSummary={serverSummary}
          visibleStatusPanels={visibleStatusPanels}
          onRetry={handleRetryProfile}
          onClearSession={handleClearSession}
          isSessionLoading={sessionRequest.status === "loading"}
        />

        <CommandBar profile={profile} />

        <WorkspaceIntro accountType={profile.accountType} />

        <RoleWorkspace
          profile={profile}
          visibleStatusPanels={visibleStatusPanels}
          dataEntryStatus={dataEntryStatus}
          isDataEntrySubmitting={isDataEntrySubmitting}
          onDataEntrySubmit={handleDataEntrySubmit}
          ownerTab={ownerTab}
          dispatcherFeed={dispatcherFeed}
          onOwnerTabChange={setOwnerTab}
          onRefreshDispatcherFeed={() =>
            setDispatcherFeedVersion((version) => version + 1)
          }
        />
      </section>
    </main>
  );
}

function AuthScreen({
  accessProfile,
  sessionRequest,
  onRetry,
  onSelectAccount,
}: {
  accessProfile: AccessProfileLoadState;
  sessionRequest: SessionRequestState;
  onRetry: () => void;
  onSelectAccount: (accountType: AccountType) => void;
}) {
  const isBusy =
    accessProfile.status === "loading" || sessionRequest.status === "loading";
  const statusMessage =
    sessionRequest.status === "error"
      ? sessionRequest.message
      : accessProfile.status === "loading"
        ? shellCopy.authLoading
        : accessProfile.status === "error"
          ? accessProfile.message
          : "Выберите тип аккаунта для dev-сессии.";

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="brand-mark" aria-hidden="true">
          SM
        </div>
        <div className="auth-copy">
          <p className="eyebrow">access boundary</p>
          <h1 id="auth-title">{shellCopy.authTitle}</h1>
          <p>{shellCopy.authLead}</p>
        </div>

        <div className="auth-options" aria-label="Выбор типа аккаунта">
          {authOptions.map((option) => {
            const isSelecting =
              sessionRequest.status === "loading" &&
              sessionRequest.accountType === option.accountType;

            return (
              <button
                className={`auth-option auth-option-${option.accountType}`}
                type="button"
                disabled={isBusy}
                key={option.accountType}
                onClick={() => onSelectAccount(option.accountType)}
              >
                <span>{option.scope}</span>
                <strong>{option.label}</strong>
                <small>
                  {isSelecting ? "Создаём server session..." : option.description}
                </small>
              </button>
            );
          })}
        </div>

        <div className={`auth-status auth-status-${accessProfile.status}`}>
          <span
            className={`status-dot status-dot-${accessProfile.status}`}
            aria-hidden="true"
          />
          <p>{statusMessage}</p>
          {accessProfile.status === "error" ? (
            <button className="retry-button" type="button" onClick={onRetry}>
              Повторить
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function SideRail({ profile }: { profile: ServerUserProfile }) {
  const navigationItems = navigationItemsByAccountType[profile.accountType];

  return (
    <aside className="side-rail" aria-label="Основная навигация">
      <div className="brand-mark" aria-hidden="true">
        SM
      </div>
      <div>
        <p className="eyebrow">платформа</p>
        <h1>{shellCopy.productName}</h1>
      </div>
      <nav className="primary-nav">
        {navigationItems.map((item) => (
          <button
            className={`nav-item nav-item-${item.state}`}
            type="button"
            aria-current={item.state === "active" ? "page" : undefined}
            key={item.label}
          >
            <span>{item.label}</span>
            <small>{item.description}</small>
          </button>
        ))}
      </nav>
      <div className="rail-note">
        <span>доступ</span>
        <strong>{accountTypeLabels[profile.accountType]}</strong>
      </div>
    </aside>
  );
}

function ServerStrip({
  accessProfile,
  serverSummary,
  visibleStatusPanels,
  onRetry,
  onClearSession,
  isSessionLoading,
}: {
  accessProfile: AccessProfileLoadState;
  serverSummary: { title: string; detail: string };
  visibleStatusPanels: StatusPanel[];
  onRetry: () => void;
  onClearSession: () => void;
  isSessionLoading: boolean;
}) {
  return (
    <header className={`server-strip server-strip-${accessProfile.status}`}>
      <div className="server-state">
        <span
          className={`status-dot status-dot-${accessProfile.status}`}
          aria-hidden="true"
        />
        <div>
          <strong>{serverSummary.title}</strong>
          <p>{serverSummary.detail}</p>
        </div>
      </div>
      <div className="server-actions" aria-label="Серверные границы">
        {visibleStatusPanels.map((panel) => (
          <StatusPill panel={panel} key={panel.label} />
        ))}
        <button
          className="retry-button"
          type="button"
          disabled={accessProfile.status === "loading"}
          onClick={onRetry}
        >
          Повторить
        </button>
        <button
          className="retry-button"
          type="button"
          disabled={isSessionLoading}
          onClick={onClearSession}
        >
          {shellCopy.changeAccess}
        </button>
      </div>
    </header>
  );
}

function CommandBar({ profile }: { profile: ServerUserProfile }) {
  return (
    <section className="command-bar" aria-label="Контекст аккаунта">
      <div className="selector-block">
        <span>{shellCopy.accountSelectorLabel}</span>
        <strong>{buildAccountSelectorValue(profile)}</strong>
      </div>
      <div className="selector-block selector-block-muted">
        <span>access/profile</span>
        <strong>{accountTypeLabels[profile.accountType]}</strong>
      </div>
      <div className="segmented-control" aria-label="Типы аккаунта">
        {accountShellPanels.map((panel) => (
          <span
            className={
              panel.accountType === profile.accountType ? "segment-active" : ""
            }
            key={panel.accountType}
          >
            {accountTypeLabels[panel.accountType]}
          </span>
        ))}
      </div>
    </section>
  );
}

function WorkspaceIntro({ accountType }: { accountType: AccountType }) {
  const copy = roleWorkspaceCopy[accountType];

  return (
    <section className="workspace-intro">
      <div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
        <p>{copy.lead}</p>
      </div>
      <div className="data-boundary">
        <span>данные</span>
        <strong>{copy.boundaryValue}</strong>
      </div>
    </section>
  );
}

function RoleWorkspace({
  profile,
  visibleStatusPanels,
  dataEntryStatus,
  isDataEntrySubmitting,
  onDataEntrySubmit,
  ownerTab,
  dispatcherFeed,
  onOwnerTabChange,
  onRefreshDispatcherFeed,
}: {
  profile: ServerUserProfile;
  visibleStatusPanels: StatusPanel[];
  dataEntryStatus: string;
  isDataEntrySubmitting: boolean;
  onDataEntrySubmit: (event: FormEvent<HTMLFormElement>) => void;
  ownerTab: OwnerTab;
  dispatcherFeed: DispatcherFeedLoadState;
  onOwnerTabChange: (tab: OwnerTab) => void;
  onRefreshDispatcherFeed: () => void;
}) {
  switch (profile.accountType) {
    case "admin":
      return (
        <AdminWorkspace
          visibleStatusPanels={visibleStatusPanels}
          profile={profile}
        />
      );
    case "business_owner":
      return (
        <OwnerWorkspace
          visibleStatusPanels={visibleStatusPanels}
          activeTab={ownerTab}
          dispatcherFeed={dispatcherFeed}
          onTabChange={onOwnerTabChange}
          onRefreshDispatcherFeed={onRefreshDispatcherFeed}
        />
      );
    case "worker":
      return (
        <DataEntryWorkspace
          title="Отправка данных"
          meta="server write"
          status={dataEntryStatus}
          isSubmitting={isDataEntrySubmitting}
          onSubmit={onDataEntrySubmit}
        />
      );
    case "dispatcher":
      return (
        <DataEntryWorkspace
          title="Диспетчерская отправка"
          meta="remote DB"
          status={dataEntryStatus}
          isSubmitting={isDataEntrySubmitting}
          onSubmit={onDataEntrySubmit}
        />
      );
  }
}

function OwnerWorkspace({
  visibleStatusPanels,
  activeTab,
  dispatcherFeed,
  onTabChange,
  onRefreshDispatcherFeed,
}: {
  visibleStatusPanels: StatusPanel[];
  activeTab: OwnerTab;
  dispatcherFeed: DispatcherFeedLoadState;
  onTabChange: (tab: OwnerTab) => void;
  onRefreshDispatcherFeed: () => void;
}) {
  return (
    <>
      <StatusGrid visibleStatusPanels={visibleStatusPanels} />
      <section className="owner-tabs" aria-label="Вкладки владельца">
        <button
          className={activeTab === "overview" ? "owner-tab-active" : ""}
          type="button"
          onClick={() => onTabChange("overview")}
        >
          Обзор
        </button>
        <button
          className={activeTab === "dispatcher" ? "owner-tab-active" : ""}
          type="button"
          onClick={() => onTabChange("dispatcher")}
        >
          Диспетчерская
        </button>
      </section>
      {activeTab === "overview" ? (
        <OwnerOverviewBoard />
      ) : (
        <DispatcherFeedPanel
          dispatcherFeed={dispatcherFeed}
          onRefresh={onRefreshDispatcherFeed}
        />
      )}
    </>
  );
}

function OwnerOverviewBoard() {
  return (
    <section className="owner-board" aria-label="Панель владельца">
      <article className="queue-panel">
        <PanelHeading
          label="очередь"
          title="Подтверждения и формы"
          meta="server response"
        />
        <div className="placeholder-table" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <p>
          Реальные строки очереди появятся только после серверного ответа с
          разрешёнными действиями.
        </p>
      </article>
      <article className="analytics-panel">
        <PanelHeading label="kpi" title="Аналитика" meta="empty state" />
        <div className="chart-placeholder" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <p>
          Графики и показатели не рассчитываются на клиенте и ждут
          backend-агрегаты.
        </p>
      </article>
    </section>
  );
}

function DataEntryWorkspace({
  title,
  meta,
  status,
  isSubmitting,
  onSubmit,
}: {
  title: string;
  meta: string;
  status: string;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="worker-workspace" aria-label="Рабочая форма">
      <article className="data-entry-panel">
        <PanelHeading label="форма" title={title} meta={meta} />
        <form className="data-entry-form" onSubmit={onSubmit}>
          <label>
            <span>Период</span>
            <input name="period" type="month" />
          </label>
          <label>
            <span>Код показателя</span>
            <input
              name="metricCode"
              placeholder="Проверяется удалённым сервером"
            />
          </label>
          <label>
            <span>Значение</span>
            <input
              name="rawValue"
              inputMode="decimal"
              placeholder="Будет сохранено сервером при подключённой БД"
            />
          </label>
          <label>
            <span>Комментарий</span>
            <textarea
              name="comment"
              rows={5}
              placeholder="Не сохраняется до подключения backend"
            />
          </label>
          <div className="form-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Отправка..." : "Отправить на сервер"}
            </button>
            <p>{status}</p>
          </div>
        </form>
      </article>
    </section>
  );
}

function DispatcherFeedPanel({
  dispatcherFeed,
  onRefresh,
}: {
  dispatcherFeed: DispatcherFeedLoadState;
  onRefresh: () => void;
}) {
  return (
    <section className="dispatcher-feed-panel" aria-label="Диспетчерская">
      <PanelHeading
        label="live"
        title="Диспетчерская"
        meta={dispatcherFeed.status === "ready" ? "remote DB" : "server state"}
      />
      <div className={`feed-state feed-state-${dispatcherFeed.status}`}>
        <strong>{dispatcherFeedTitle(dispatcherFeed)}</strong>
        <p>{dispatcherFeedMessage(dispatcherFeed)}</p>
        <button className="retry-button" type="button" onClick={onRefresh}>
          Обновить
        </button>
      </div>
      {dispatcherFeed.status === "ready" &&
      dispatcherFeed.submissions.length > 0 ? (
        <div className="dispatcher-feed-table" role="table">
          <div className="dispatcher-feed-row dispatcher-feed-head" role="row">
            <span role="columnheader">Время</span>
            <span role="columnheader">Период</span>
            <span role="columnheader">Показатель</span>
            <span role="columnheader">Значение</span>
            <span role="columnheader">Статус</span>
          </div>
          {dispatcherFeed.submissions.map((submission) => (
            <DispatcherFeedRow
              submission={submission}
              key={submission.id}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DispatcherFeedRow({
  submission,
}: {
  submission: DispatcherSubmission;
}) {
  return (
    <div className="dispatcher-feed-row" role="row">
      <span role="cell">{submission.receivedAt}</span>
      <span role="cell">{submission.period}</span>
      <span role="cell">{submission.metricCode}</span>
      <span role="cell">{submission.rawValue}</span>
      <span role="cell">{submission.status}</span>
    </div>
  );
}

function AdminWorkspace({
  visibleStatusPanels,
  profile,
}: {
  visibleStatusPanels: StatusPanel[];
  profile: ServerUserProfile;
}) {
  return (
    <>
      <StatusGrid visibleStatusPanels={visibleStatusPanels} />
      <section className="account-grid" aria-label="Рабочие области аккаунтов">
        {accountShellPanels.map((panel) => (
          <AccountPanel panel={panel} key={panel.accountType} />
        ))}
      </section>
      <section className="admin-board" aria-label="Административные функции">
        <article className="admin-tool-panel">
          <PanelHeading label="логи" title="Серверные события" meta="dev" />
          <div className="placeholder-table" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>
            Логи должны приходить с сервера по отдельному endpoint и не
            заменяются клиентскими сообщениями.
          </p>
        </article>
        <article className="admin-tool-panel">
          <PanelHeading label="debug" title="Отладочные функции" meta="admin" />
          <ul className="capability-list">
            {profile.activeAccess.capabilities.map((capability) => (
              <li key={capability}>{capability}</li>
            ))}
          </ul>
        </article>
      </section>
    </>
  );
}

function StatusGrid({
  visibleStatusPanels,
}: {
  visibleStatusPanels: StatusPanel[];
}) {
  return (
    <section className="status-grid" aria-label="Панели статуса">
      {visibleStatusPanels.map((panel) => (
        <article
          className={`status-card status-card-${panel.state}`}
          key={panel.label}
        >
          <span>{stateLabel(panel.state)}</span>
          <strong>{panel.label}</strong>
          <p>{panel.detail}</p>
        </article>
      ))}
    </section>
  );
}

function buildProfileStatusPanel(profile: AccessProfileLoadState): StatusPanel {
  switch (profile.status) {
    case "loading":
      return {
        label: "Профиль доступа",
        state: "loading",
        detail: profile.message,
      };
    case "ready":
      return {
        label: "Профиль доступа",
        state: "ready",
        detail: "Ответ принят через client fetch-boundary.",
      };
    case "empty":
      return {
        label: "Профиль доступа",
        state: "empty",
        detail: profile.message,
      };
    case "error":
      return {
        label: "Профиль доступа",
        state: "error",
        detail: profile.message,
      };
  }
}

function buildRemoteServerStatusPanel(): StatusPanel {
  const remoteServer = getRemoteServerConnection();

  if (remoteServer.status === "configured") {
    return {
      label: "Удалённая БД",
      state: "ready",
      detail: "Remote API URL настроен.",
    };
  }

  return {
    label: "Удалённая БД",
    state: "error",
    detail: remoteServer.message,
  };
}

function buildServerSummary(profile: AccessProfileLoadState) {
  switch (profile.status) {
    case "loading":
      return {
        title: shellCopy.accessProfileLoading,
        detail: profile.message,
      };
    case "ready":
      return {
        title: shellCopy.accessProfileReady,
        detail:
          "Клиент отображает только разрешённые сервером поля и не сохраняет их как источник истины.",
      };
    case "empty":
      return {
        title: shellCopy.accessProfileEmpty,
        detail: profile.message,
      };
    case "error":
      return {
        title: shellCopy.accessProfileError,
        detail: profile.message,
      };
  }
}

function buildAccountSelectorValue(profile: ServerUserProfile) {
  const businessCount = profile.businessAccounts.length;

  if (businessCount === 0) {
    return shellCopy.accountSelectorEmpty;
  }

  return `Получено с сервера: ${businessCount}`;
}

function dispatcherFeedTitle(feed: DispatcherFeedLoadState) {
  switch (feed.status) {
    case "loading":
      return "Запрос live-истории";
    case "ready":
      return feed.submissions.length === 0
        ? "Сервер вернул пустую историю"
        : `Записей с сервера: ${feed.submissions.length}`;
    case "error":
      return "Диспетчерская недоступна";
  }
}

function dispatcherFeedMessage(feed: DispatcherFeedLoadState) {
  switch (feed.status) {
    case "loading":
      return feed.message;
    case "ready":
      return `Последнее обновление remote feed: ${feed.receivedAt}.`;
    case "error":
      return feed.message;
  }
}

function hasCapability(
  profile: ServerUserProfile,
  capability: AccountCapability,
) {
  return profile.activeAccess.capabilities.includes(capability);
}

function getActiveBusinessAccountId(profile: ServerUserProfile) {
  const scope = profile.activeAccess.scope;

  if (scope.kind === "business" || scope.kind === "department") {
    return scope.businessAccountId;
  }

  return profile.businessAccounts[0]?.id ?? "";
}

function readOptionalFormValue(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";

  return text.length > 0 ? text : undefined;
}

function StatusPill({ panel }: { panel: StatusPanel }) {
  return (
    <span className={`status-pill status-pill-${panel.state}`}>
      {stateLabel(panel.state)}
    </span>
  );
}

function AccountPanel({ panel }: { panel: AccountShellPanel }) {
  return (
    <article className={`account-panel account-${panel.accountType}`}>
      <div className="account-head">
        <div>
          <span>{panel.scope}</span>
          <strong>{panel.label}</strong>
        </div>
        <b>{panel.serverDependency}</b>
      </div>
      <p>{panel.emptyState}</p>
      <ul>
        {panel.availableAfterServer.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function PanelHeading({
  label,
  title,
  meta,
}: {
  label: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="panel-heading">
      <div>
        <span>{label}</span>
        <strong>{title}</strong>
      </div>
      <b>{meta}</b>
    </div>
  );
}
