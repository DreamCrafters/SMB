import { useEffect, useState } from "react";
import {
  warehouse1cReportViews,
  type Warehouse1cAccount,
  type Warehouse1cStockReport,
} from "./contracts";
import { LoadingIndicator } from "./LoadingIndicator";
import { requestWarehouse1cStockBalances } from "./services/warehouse1c";
import { readShortUserMessage } from "./services/userFacingMessages";

type StockState =
  | { status: "loading" }
  | {
      status: "ready";
      accounts: Warehouse1cAccount[];
      accountCode: string;
      availableDates: string[];
      report?: Warehouse1cStockReport;
    }
  | { status: "error"; message: string };

/**
 * Интеграция с 1С, первый этап: просмотр остатков по складу в разрезе
 * номенклатуры. Раздел ничего не заполняет — данные приходят выгрузкой из 1С,
 * поэтому дата и счёт выбираются только из того, что уже загружено, а не
 * задаются произвольно.
 */
export function Warehouse1cWorkspace() {
  const [view] = useState(warehouse1cReportViews[0].id);
  const [accountCode, setAccountCode] = useState<string>();
  const [reportDate, setReportDate] = useState<string>();
  const [state, setState] = useState<StockState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    setState({ status: "loading" });
    requestWarehouse1cStockBalances(
      {
        ...(accountCode === undefined ? {} : { accountCode }),
        ...(reportDate === undefined ? {} : { reportDate }),
      },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;

      setState(result.status === "ready"
        ? {
            status: "ready",
            accounts: result.accounts,
            accountCode: result.accountCode,
            availableDates: result.availableDates,
            ...(result.report === undefined ? {} : { report: result.report }),
          }
        : {
            status: "error",
            message: readShortUserMessage(
              result.message,
              "Не удалось загрузить остатки 1С.",
            ),
          });
    });

    return () => controller.abort();
  }, [accountCode, reportDate]);

  const accounts = state.status === "ready" ? state.accounts : [];
  const availableDates = state.status === "ready" ? state.availableDates : [];
  const selectedAccount = state.status === "ready"
    ? state.accountCode
    : accountCode ?? "";
  const selectedDate = state.status === "ready"
    ? state.report?.reportDate ?? ""
    : reportDate ?? "";

  return (
    <main className="workspace laboratory-workspace warehouse-1c">
      <header className="laboratory-heading">
        <div>
          <span className="eyebrow">Интеграция с 1С</span>
          <h1>Склад</h1>
        </div>
      </header>

      <div
        className="laboratory-section-tabs warehouse-1c-tabs"
        role="tablist"
        aria-label="Отчёты склада 1С"
      >
        {warehouse1cReportViews.map((item) => (
          <button
            aria-selected={view === item.id}
            className={view === item.id ? "is-active" : ""}
            key={item.id}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="laboratory-review-filters" aria-label="Фильтры остатков">
        <div className="laboratory-filters">
          <label>
            <span>Дата</span>
            <select
              disabled={availableDates.length === 0}
              value={selectedDate}
              onChange={(event) => setReportDate(event.currentTarget.value)}
            >
              {availableDates.length === 0
                ? <option value="">Нет загруженных отчётов</option>
                : availableDates.map((date) => (
                    <option key={date} value={date}>{formatDate(date)}</option>
                  ))}
            </select>
          </label>
          <label>
            <span>Счёт</span>
            <select
              disabled={accounts.length === 0}
              value={selectedAccount}
              onChange={(event) => {
                setAccountCode(event.currentTarget.value);
                setReportDate(undefined);
              }}
            >
              {accounts.length === 0
                ? <option value="">Нет счетов</option>
                : accounts.map((account) => (
                    <option key={account.code} value={account.code}>
                      {account.label}
                    </option>
                  ))}
            </select>
          </label>
        </div>
      </section>

      <section className="laboratory-history" aria-label="Остатки по складу">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">Отчёт 1С</span>
            <h2>Остатки по складу</h2>
          </div>
          {state.status === "ready" && state.report !== undefined ? (
            <p className="warehouse-1c-source">
              {`Выгрузка «${state.report.fileName}» от ${
                formatDateTime(state.report.importedAt)
              } · строк: ${state.report.balances.length}`}
            </p>
          ) : null}
        </div>

        {state.status === "loading" ? (
          <LoadingIndicator label="Загружаем остатки…" variant="inline" />
        ) : null}
        {state.status === "error" ? (
          <p className="laboratory-empty-note">{state.message}</p>
        ) : null}
        {state.status === "ready" ? (
          <Warehouse1cStockTable report={state.report} />
        ) : null}
      </section>
    </main>
  );
}

function Warehouse1cStockTable({
  report,
}: {
  report?: Warehouse1cStockReport;
}) {
  if (report === undefined || report.balances.length === 0) {
    return (
      <p className="laboratory-empty-note">
        Остатки из 1С за выбранную дату ещё не загружены.
      </p>
    );
  }

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <table className="data-table laboratory-results-table warehouse-1c-table">
        <thead>
          <tr>
            <th>Номенклатура</th>
            <th>Ост. нач.</th>
            <th>Ост. кон.</th>
          </tr>
        </thead>
        <tbody>
          {report.balances.map((balance) => (
            <tr key={balance.nomenclature}>
              <td>{balance.nomenclature}</td>
              <td>{formatBalance(balance.openingBalance)}</td>
              <td>{formatBalance(balance.closingBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Остаток приходит десятичной строкой, чтобы не терять доли в JSON. */
function formatBalance(value: string) {
  if (value === "") return "—";

  const [integer, fraction] = value.split(".");
  const sign = integer.startsWith("-") ? "-" : "";
  const digits = sign === "-" ? integer.slice(1) : integer;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/gu, " ");

  return fraction === undefined
    ? `${sign}${grouped}`
    : `${sign}${grouped},${fraction}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

/**
 * Сервер отдаёт время импорта так, как его хранит MySQL, — без указания зоны.
 * Пул работает в UTC, поэтому недостающая зона добавляется здесь.
 */
function formatDateTime(value: string) {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}
