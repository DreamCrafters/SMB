import {
  accountShellPanels,
  navigationItems,
  shellCopy,
  statusPanels,
  type AccountShellPanel,
  type NavigationItem,
  type StatusPanel,
} from "./content";

function stateLabel(state: NavigationItem["state"] | StatusPanel["state"]) {
  switch (state) {
    case "active":
      return "готов";
    case "pending":
      return "ожидание";
    case "locked":
      return "сервер";
    case "waiting":
      return "запрос";
    case "empty":
      return "пусто";
  }
}

function accountTypeLabel(panel: AccountShellPanel) {
  switch (panel.accountType) {
    case "admin":
      return "admin";
    case "business_owner":
      return "business owner";
    case "worker":
      return "worker";
  }
}

export default function App() {
  return (
    <main className="ops-shell">
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
          <span>стиль</span>
          <strong>{shellCopy.visualDirection}</strong>
        </div>
      </aside>

      <section className="workspace" aria-label="Рабочая область">
        <header className="server-strip">
          <div className="server-state">
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>{shellCopy.serverStatus}</strong>
              <p>{shellCopy.serverStatusDetail}</p>
            </div>
          </div>
          <div className="server-actions" aria-label="Серверные границы">
            {statusPanels.map((panel) => (
              <StatusPill panel={panel} key={panel.label} />
            ))}
          </div>
        </header>

        <section className="command-bar" aria-label="Контекст аккаунта">
          <div className="selector-block">
            <span>{shellCopy.accountSelectorLabel}</span>
            <strong>{shellCopy.accountSelectorPlaceholder}</strong>
          </div>
          <div className="selector-block selector-block-muted">
            <span>access/profile</span>
            <strong>{shellCopy.accountTypeLabel}</strong>
          </div>
          <div className="segmented-control" aria-label="Типы аккаунта">
            {accountShellPanels.map((panel) => (
              <span key={panel.accountType}>{accountTypeLabel(panel)}</span>
            ))}
          </div>
        </section>

        <section className="workspace-intro">
          <div>
            <p className="eyebrow">рабочий контур</p>
            <h2>{shellCopy.workspaceTitle}</h2>
            <p>{shellCopy.workspaceLead}</p>
          </div>
          <div className="data-boundary">
            <span>данные</span>
            <strong>только сервер</strong>
          </div>
        </section>

        <section className="status-grid" aria-label="Панели статуса">
          {statusPanels.map((panel) => (
            <article className={`status-card status-card-${panel.state}`} key={panel.label}>
              <span>{stateLabel(panel.state)}</span>
              <strong>{panel.label}</strong>
              <p>{panel.detail}</p>
            </article>
          ))}
        </section>

        <section className="account-grid" aria-label="Рабочие области аккаунтов">
          {accountShellPanels.map((panel) => (
            <AccountPanel panel={panel} key={panel.accountType} />
          ))}
        </section>

        <section className="ops-board" aria-label="Заглушки серверных данных">
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
      </section>
    </main>
  );
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
