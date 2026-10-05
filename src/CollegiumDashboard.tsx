import { useState, type ReactNode } from "react";
import {
  collegiumInitiativeStatusLabels,
  type CollegiumDashboard,
} from "./contracts/collegiumInitiatives";
import { formatAmount, formatDate, saveBlob, useServerData } from "./CollegiumShared";
import { LoadingIndicator } from "./LoadingIndicator";
import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import {
  collegiumDashboardPdfPath,
  downloadCollegiumFile,
  requestCollegiumDashboard,
} from "./services/collegiumInitiatives";
import { readShortUserMessage } from "./services/userFacingMessages";

type InitiativeRef = { id: string; number: string; title: string };

/** Доля для ширины полосы; нулевой максимум не рисует полос. */
function share(value: string, max: number) {
  return max > 0 ? `${Math.max(0, (Number(value) / max) * 100)}%` : "0%";
}

/** Дашборд Коллегии (ТЗ 13.1): все цифры считает сервер по видимым инициативам. */
export function CollegiumDashboardView({
  refreshVersion,
  onOpen,
}: {
  refreshVersion: number;
  onOpen: (id: string) => void;
}) {
  const state = useServerData(
    (signal) => requestCollegiumDashboard(signal),
    "Не удалось загрузить дашборд.",
    refreshVersion,
  );
  const [message, setMessage] = useState("");
  const [isPrinting, setIsPrinting] = useState(false);

  if (state.status === "loading") return <LoadingIndicator label="Загружаем дашборд…" />;
  if (state.status === "error") return <p className="form-message is-error" role="alert">{state.message}</p>;
  const dashboard = state.data;

  const printSummary = async () => {
    setIsPrinting(true);
    setMessage("");
    try {
      saveBlob(await downloadCollegiumFile(collegiumDashboardPdfPath), "Сводка инициатив Коллегии.pdf");
    } catch (error) {
      setMessage(readShortUserMessage(error instanceof Error ? error.message : "", "Не удалось сформировать сводку."));
    } finally {
      setIsPrinting(false);
    }
  };

  const link = (item: InitiativeRef) => (
    <button className="board-assignment-link" type="button" onClick={() => onOpen(item.id)}>
      {`${item.number} «${item.title}»`}
    </button>
  );

  return (
    <div className="collegium-dashboard">
      <div className="collegium-dashboard-toolbar">
        <span>{`На ${formatDate(dashboard.generatedOn)} · инициатив: ${dashboard.total}`}</span>
        <button className="secondary-button" disabled={isPrinting} type="button" onClick={() => void printSummary()}>
          {isPrinting ? "Формируем…" : "Сводка PDF"}
        </button>
      </div>
      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}

      <dl className="collegium-dashboard-tiles">
        <Tile label="Ожидают предварительной оценки" value={String(dashboard.awaitingReview)} />
        <Tile
          label="На доработке"
          value={String(dashboard.rework)}
          note={dashboard.reworkOverdue > 0 ? `просрочено: ${dashboard.reworkOverdue}` : undefined}
        />
        <Tile label="В пилоте" value={String(dashboard.inPilot)} />
        <Tile label="Во внедрении" value={String(dashboard.inImplementation)} />
        <Tile
          label="Просроченные поручения"
          value={String(dashboard.overdueAssignments)}
          attention={dashboard.overdueAssignments > 0}
        />
        <Tile label="Плановый эффект" value={formatAmount(dashboard.plannedEffect)} />
        <Tile label="Подтверждённый эффект" value={formatAmount(dashboard.confirmedEffect)} />
      </dl>

      <div className="collegium-dashboard-grid">
        <section className="collegium-card-section">
          <h3>Инициативы по статусам</h3>
          {dashboard.statusCounts.length === 0 ? <p className="collegium-empty-note">Инициатив пока нет.</p> : (
            <StatusBars counts={dashboard.statusCounts} />
          )}
        </section>

        <section className="collegium-card-section">
          <h3>Эффект по направлениям</h3>
          {dashboard.effectByDirection.length === 0
            ? <p className="collegium-empty-note">Одобренных инициатив с эффектом пока нет.</p>
            : <EffectByDirection rows={dashboard.effectByDirection} />}
        </section>

        <section className="collegium-card-section">
          <h3>Ближайшее заседание</h3>
          {dashboard.nextMeeting === undefined ? <p className="collegium-empty-note">Заседаний не запланировано.</p> : (
            <>
              <p>{`${dashboard.nextMeeting.number}: ${formatDate(dashboard.nextMeeting.meetingDate)} в ${dashboard.nextMeeting.meetingTime}`}</p>
              {dashboard.nextMeeting.items.length === 0 ? <p className="collegium-empty-note">Повестка пока пуста.</p> : (
                <ol className="collegium-dashboard-list">
                  {dashboard.nextMeeting.items.map((item) => <li key={item.id}>{link(item)}</li>)}
                </ol>
              )}
            </>
          )}
        </section>

        <RefList title="Требуют решения Совета директоров" items={dashboard.boardDecisions} render={link} />
        <RefList title="Завершены без подтверждённого эффекта" items={dashboard.unconfirmed} render={link} />
      </div>

      <section className="collegium-card-section">
        <h3>Топ-10 по ожидаемому эффекту</h3>
        {dashboard.topByEffect.length === 0 ? <p className="collegium-empty-note">Нет активных инициатив с оценкой эффекта.</p> : (
          <div className="table-scroll">
            <ManagedTable tableId="collegium.dashboardTopEffect" className="data-table collegium-dashboard-table">
              <thead>
                <tr>
                  <TableHeader>Инициатива</TableHeader>
                  <TableHeader>Статус</TableHeader>
                  <TableHeader>Эффект</TableHeader>
                </tr>
              </thead>
              <tbody>
                {dashboard.topByEffect.map((item) => (
                  <tr key={item.id}>
                    <TableCell>{link(item)}</TableCell>
                    <TableCell>{collegiumInitiativeStatusLabels[item.status]}</TableCell>
                    <TableCell className="is-number">{formatAmount(item.expectedEffect)}</TableCell>
                  </tr>
                ))}
              </tbody>
            </ManagedTable>
          </div>
        )}
      </section>

      <section className="collegium-card-section">
        <h3>Топ-10 рисков</h3>
        <p className="collegium-empty-note">Риски активных инициатив: сначала высший уровень, затем больший ожидаемый эффект.</p>
        {dashboard.topRisks.length === 0 ? <p className="collegium-empty-note">Риски не указаны.</p> : (
          <div className="table-scroll">
            <ManagedTable tableId="collegium.dashboardRisks" className="data-table collegium-dashboard-table">
              <thead>
                <tr>
                  <TableHeader>Инициатива</TableHeader>
                  <TableHeader>Уровень</TableHeader>
                  <TableHeader>Риск</TableHeader>
                </tr>
              </thead>
              <tbody>
                {dashboard.topRisks.map((item, index) => (
                  <tr key={`${item.id}:${index}`}>
                    <TableCell>{link(item)}</TableCell>
                    <TableCell>{item.levelLabel || "—"}</TableCell>
                    <TableCell>{item.risk}</TableCell>
                  </tr>
                ))}
              </tbody>
            </ManagedTable>
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, note, attention = false }: {
  label: string;
  value: string;
  note?: string;
  attention?: boolean;
}) {
  return (
    <div className={attention ? "is-attention" : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note === undefined ? null : <dd className="collegium-dashboard-note">{note}</dd>}
    </div>
  );
}

function StatusBars({ counts }: { counts: CollegiumDashboard["statusCounts"] }) {
  const max = Math.max(...counts.map(({ count }) => count));
  return (
    <div className="table-scroll">
      <ManagedTable tableId="collegium.dashboardStatuses" className="data-table collegium-dashboard-table collegium-dashboard-bars">
        <thead>
          <tr>
            <TableHeader>Статус</TableHeader>
            <TableHeader>Шкала</TableHeader>
            <TableHeader>Количество</TableHeader>
          </tr>
        </thead>
        <tbody>
          {counts.map(({ status, count }) => (
            <tr key={status} title={`${collegiumInitiativeStatusLabels[status]}: ${count}`}>
              <TableHeader scope="row">{collegiumInitiativeStatusLabels[status]}</TableHeader>
              <TableCell aria-hidden="true">
                <span className="collegium-bar is-planned" style={{ width: share(String(count), max) }} />
              </TableCell>
              <TableCell className="is-number">{count}</TableCell>
            </tr>
          ))}
        </tbody>
      </ManagedTable>
    </div>
  );
}

/** Две серии на одной шкале: легенда и подписи значений, цвет не единственный носитель. */
function EffectByDirection({ rows }: { rows: CollegiumDashboard["effectByDirection"] }) {
  const max = Math.max(...rows.flatMap(({ planned, confirmed }) => [Number(planned), Number(confirmed)]));
  return (
    <>
      <ul className="collegium-dashboard-legend">
        <li><span className="collegium-bar-key is-planned" />Плановый</li>
        <li><span className="collegium-bar-key is-confirmed" />Подтверждённый</li>
      </ul>
      <div className="table-scroll">
        <ManagedTable tableId="collegium.dashboardEffect" className="data-table collegium-dashboard-table collegium-dashboard-bars">
          <thead>
            <tr>
              <TableHeader>Направление</TableHeader>
              <TableHeader>Шкала</TableHeader>
              <TableHeader>Плановый</TableHeader>
              <TableHeader>Подтверждённый</TableHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.directionCode}
                title={`${row.directionLabel}: плановый ${formatAmount(row.planned)}, подтверждённый ${formatAmount(row.confirmed)}`}
              >
                <TableHeader scope="row">{row.directionLabel}</TableHeader>
                <TableCell aria-hidden="true">
                  <span className="collegium-bar is-planned" style={{ width: share(row.planned, max) }} />
                  <span className="collegium-bar is-confirmed" style={{ width: share(row.confirmed, max) }} />
                </TableCell>
                <TableCell className="is-number">{formatAmount(row.planned)}</TableCell>
                <TableCell className="is-number">{formatAmount(row.confirmed)}</TableCell>
              </tr>
            ))}
          </tbody>
        </ManagedTable>
      </div>
    </>
  );
}

function RefList({ title, items, render }: {
  title: string;
  items: InitiativeRef[];
  render: (item: InitiativeRef) => ReactNode;
}) {
  return (
    <section className="collegium-card-section">
      <h3>{title}</h3>
      {items.length === 0 ? <p className="collegium-empty-note">Нет.</p> : (
        <ul className="collegium-dashboard-list">
          {items.map((item) => <li key={item.id}>{render(item)}</li>)}
        </ul>
      )}
    </section>
  );
}
