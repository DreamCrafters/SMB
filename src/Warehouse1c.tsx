import { useEffect, useRef, useState } from "react";
import {
  isParsedWarehouse1cUpload,
  warehouse1cReportViews,
  type Warehouse1cAccount,
  type Warehouse1cReportView,
  type Warehouse1cStockReport,
  type Warehouse1cUpload,
  type Warehouse1cUploadSheet,
} from "./contracts";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  requestWarehouse1cStockBalances,
  requestWarehouse1cUploadFile,
  requestWarehouse1cUploadSheets,
  requestWarehouse1cUploads,
} from "./services/warehouse1c";
import { readShortUserMessage } from "./services/userFacingMessages";

type StockState =
  | { status: "loading" }
  | {
      status: "ready";
      accounts: Warehouse1cAccount[];
      accountCode: string;
      availableDates: string[];
      isReadOnlySource: boolean;
      report?: Warehouse1cStockReport;
    }
  | { status: "error"; message: string };

type UploadsState =
  | { status: "loading" }
  | { status: "ready"; uploads: Warehouse1cUpload[]; isReadOnlySource: boolean }
  | { status: "error"; message: string };

type SheetState =
  | { status: "loading" }
  | { status: "ready"; sheets: Warehouse1cUploadSheet[] }
  | { status: "error"; message: string };

/**
 * Интеграция с 1С, первый этап: просмотр остатков по складу в разрезе
 * номенклатуры. Раздел ничего не заполняет — данные приходят выгрузкой из 1С,
 * поэтому дата и счёт выбираются только из того, что уже загружено, а не
 * задаются произвольно. Второй вид — журнал приёма самих выгрузок.
 */
export function Warehouse1cWorkspace() {
  const [view, setView] = useState<Warehouse1cReportView>(
    warehouse1cReportViews[0].id,
  );

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
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {view === "uploads"
        ? <Warehouse1cUploadsView />
        : <Warehouse1cStockBalancesView />}
    </main>
  );
}

function Warehouse1cStockBalancesView() {
  const [accountCode, setAccountCode] = useState<string>();
  const [reportDate, setReportDate] = useState<string>();
  const [state, setState] = useState<StockState>({ status: "loading" });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  /**
   * Обновление по кнопке не убирает таблицу с экрана: пока сервер отвечает,
   * уже показанные остатки остаются на месте, а загрузку показывает сама
   * кнопка. Первая загрузка и смена фильтров ведут себя по-прежнему.
   */
  const preserveReportOnNextLoadRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const shouldPreserveReport = preserveReportOnNextLoadRef.current;

    preserveReportOnNextLoadRef.current = false;
    setIsLoading(true);
    setState((current) =>
      shouldPreserveReport && current.status === "ready"
        ? current
        : { status: "loading" },
    );
    requestWarehouse1cStockBalances(
      {
        ...(accountCode === undefined ? {} : { accountCode }),
        ...(reportDate === undefined ? {} : { reportDate }),
      },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;

      setIsLoading(false);
      setState(result.status === "ready"
        ? {
            status: "ready",
            accounts: result.accounts,
            accountCode: result.accountCode,
            availableDates: result.availableDates,
            isReadOnlySource: result.isReadOnlySource === true,
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
  }, [accountCode, reportDate, refreshVersion]);

  const accounts = state.status === "ready" ? state.accounts : [];
  const availableDates = state.status === "ready" ? state.availableDates : [];
  const selectedAccount = state.status === "ready"
    ? state.accountCode
    : accountCode ?? "";
  const selectedDate = state.status === "ready"
    ? state.report?.reportDate ?? ""
    : reportDate ?? "";

  return (
    <>
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
          <button
            className="secondary-button warehouse-1c-refresh"
            type="button"
            disabled={isLoading}
            onClick={() => {
              preserveReportOnNextLoadRef.current = true;
              setIsLoading(true);
              setRefreshVersion((version) => version + 1);
            }}
          >
            {isLoading && state.status === "ready" ? (
              <LoadingIndicator label="Обновляем…" variant="button" />
            ) : "Обновить отчёты"}
          </button>
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
          {state.status === "ready" && state.isReadOnlySource ? (
            <p className="warehouse-1c-source">
              Данные основной базы: этот сайт показывает остатки и выгрузки
              из 1С не принимает.
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
    </>
  );
}

/**
 * Журнал приёма: строка на каждую попытку 1С отправить выгрузку, включая
 * отклонённые. Без него отказ не оставлял следа, и «данные не обновились» было
 * неотличимо от «1С ничего не присылала».
 */
function Warehouse1cUploadsView() {
  const [state, setState] = useState<UploadsState>({ status: "loading" });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadError, setDownloadError] = useState("");
  const [downloadingId, setDownloadingId] = useState("");
  const [openedUpload, setOpenedUpload] = useState<Warehouse1cUpload>();
  const preserveListOnNextLoadRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const shouldPreserveList = preserveListOnNextLoadRef.current;

    preserveListOnNextLoadRef.current = false;
    setIsLoading(true);
    setState((current) =>
      shouldPreserveList && current.status === "ready"
        ? current
        : { status: "loading" },
    );
    requestWarehouse1cUploads({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;

      setIsLoading(false);
      setState(result.status === "ready"
        ? {
            status: "ready",
            uploads: result.uploads,
            isReadOnlySource: result.isReadOnlySource === true,
          }
        : {
            status: "error",
            message: readShortUserMessage(
              result.message,
              "Не удалось загрузить журнал выгрузок 1С.",
            ),
          });
    });

    return () => controller.abort();
  }, [refreshVersion]);

  async function downloadUpload(upload: Warehouse1cUpload) {
    setDownloadError("");
    setDownloadingId(upload.id);

    const result = await requestWarehouse1cUploadFile(upload.id);

    setDownloadingId("");

    if (result.status === "error") {
      setDownloadError(
        readShortUserMessage(
          result.message,
          "Не удалось скачать файл выгрузки.",
        ),
      );
      return;
    }

    const objectUrl = URL.createObjectURL(result.blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = result.filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  return (
    <section className="laboratory-history" aria-label="Журнал загрузок 1С">
      <div className="laboratory-history-heading">
        <div>
          <span className="eyebrow">Приём выгрузок</span>
          <h2>Журнал загрузок</h2>
        </div>
        <p className="warehouse-1c-source">
          Каждая попытка 1С отправить отчёт, включая отклонённые. Файл
          сохраняется вместе с записью, поэтому выгрузку можно скачать.
        </p>
        {state.status === "ready" && state.isReadOnlySource ? (
          <p className="warehouse-1c-source">
            Данные основной базы: этот сайт показывает журнал и выгрузки из 1С
            не принимает.
          </p>
        ) : null}
        <button
          className="secondary-button warehouse-1c-refresh"
          type="button"
          disabled={isLoading}
          onClick={() => {
            preserveListOnNextLoadRef.current = true;
            setIsLoading(true);
            setRefreshVersion((version) => version + 1);
          }}
        >
          {isLoading && state.status === "ready" ? (
            <LoadingIndicator label="Обновляем…" variant="button" />
          ) : "Обновить журнал"}
        </button>
      </div>

      {downloadError === "" ? null : (
        <p className="laboratory-empty-note">{downloadError}</p>
      )}
      {state.status === "loading" ? (
        <LoadingIndicator label="Загружаем журнал…" variant="inline" />
      ) : null}
      {state.status === "error" ? (
        <p className="laboratory-empty-note">{state.message}</p>
      ) : null}
      {state.status === "ready" ? (
        <Warehouse1cUploadsTable
          downloadingId={downloadingId}
          openedUploadId={openedUpload?.id ?? ""}
          uploads={state.uploads}
          onDownload={(upload) => void downloadUpload(upload)}
          onOpen={(upload) =>
            setOpenedUpload((current) =>
              current?.id === upload.id ? undefined : upload)}
        />
      ) : null}

      {openedUpload === undefined ? null : (
        <Warehouse1cUploadSheetView
          upload={openedUpload}
          onClose={() => setOpenedUpload(undefined)}
        />
      )}
    </section>
  );
}

/**
 * Файл показывается как он составлен — строками и колонками исходного листа.
 * 1С меняет структуру отчёта, и увидеть выгрузку нужно раньше, чем разбор
 * научится её читать, поэтому здесь нет ни номенклатуры, ни остатков.
 */
function Warehouse1cUploadSheetView({
  upload,
  onClose,
}: {
  upload: Warehouse1cUpload;
  onClose: () => void;
}) {
  const [state, setState] = useState<SheetState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    setState({ status: "loading" });
    requestWarehouse1cUploadSheets(upload.id, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;

        setState(result.status === "ready"
          ? { status: "ready", sheets: result.sheets }
          : {
              status: "error",
              message: readShortUserMessage(
                result.message,
                "Не удалось открыть файл выгрузки.",
              ),
            });
      });

    return () => controller.abort();
  }, [upload.id]);

  return (
    <section className="warehouse-1c-sheet" aria-label="Файл выгрузки">
      <div className="laboratory-history-heading">
        <div>
          <span className="eyebrow">Файл выгрузки</span>
          <h3>{upload.fileName}</h3>
        </div>
        <p className="warehouse-1c-source">
          Лист показан так, как он составлен: строки и колонки исходного файла
          без разбора в номенклатуру и остатки.
        </p>
        <button
          className="secondary-button warehouse-1c-refresh"
          type="button"
          onClick={onClose}
        >
          Скрыть файл
        </button>
      </div>

      {state.status === "loading" ? (
        <LoadingIndicator label="Открываем файл…" variant="inline" />
      ) : null}
      {state.status === "error" ? (
        <p className="laboratory-empty-note">{state.message}</p>
      ) : null}
      {state.status === "ready"
        ? state.sheets.map((sheet) => (
            <Warehouse1cSheetTable key={sheet.name} sheet={sheet} />
          ))
        : null}
    </section>
  );
}

function Warehouse1cSheetTable({ sheet }: { sheet: Warehouse1cUploadSheet }) {
  const columnCount = sheet.rows.reduce(
    (widest, row) => Math.max(widest, row.length),
    0,
  );

  if (columnCount === 0) {
    return (
      <p className="laboratory-empty-note">{`Лист «${sheet.name}» пуст.`}</p>
    );
  }

  const spans = readSheetSpans(sheet);

  return (
    <div className="warehouse-1c-sheet-block">
      <p className="warehouse-1c-source">
        {`Лист «${sheet.name}» · строк: ${sheet.rows.length}${
          sheet.isTruncated ? " (показаны первые)" : ""
        } · колонок: ${columnCount}`}
      </p>
      <div className="table-scroll laboratory-table-scroll history-table-scroll">
        <table className="data-table warehouse-1c-sheet-table">
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th scope="row">{rowIndex + 1}</th>
                {Array.from({ length: columnCount }, (_, columnIndex) => {
                  const span = spans.get(`${rowIndex}:${columnIndex}`);

                  // Ячейку, накрытую объединением, рисовать нельзя: она уехала
                  // бы вправо и сдвинула всю строку.
                  if (span === "covered") return null;

                  return (
                    <td
                      key={columnIndex}
                      {...(span === undefined ? {} : {
                        colSpan: span.columnSpan,
                        rowSpan: span.rowSpan,
                      })}
                    >
                      {row[columnIndex] ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Объединения листа в вид, удобный отрисовке: у верхней левой ячейки — охват,
 * у накрытых ею — пометка, что рисовать их не нужно.
 */
function readSheetSpans(sheet: Warehouse1cUploadSheet) {
  const spans = new Map<
    string,
    "covered" | { rowSpan: number; columnSpan: number }
  >();

  for (const merge of sheet.merges) {
    if (merge.rowSpan < 1 || merge.columnSpan < 1) continue;
    if (merge.rowSpan === 1 && merge.columnSpan === 1) continue;

    spans.set(`${merge.row}:${merge.column}`, {
      rowSpan: merge.rowSpan,
      columnSpan: merge.columnSpan,
    });

    for (let row = merge.row; row < merge.row + merge.rowSpan; row += 1) {
      for (
        let column = merge.column;
        column < merge.column + merge.columnSpan;
        column += 1
      ) {
        if (row === merge.row && column === merge.column) continue;
        spans.set(`${row}:${column}`, "covered");
      }
    }
  }

  return spans;
}

function Warehouse1cUploadsTable({
  downloadingId,
  openedUploadId,
  uploads,
  onDownload,
  onOpen,
}: {
  downloadingId: string;
  openedUploadId: string;
  uploads: Warehouse1cUpload[];
  onDownload: (upload: Warehouse1cUpload) => void;
  onOpen: (upload: Warehouse1cUpload) => void;
}) {
  if (uploads.length === 0) {
    return (
      <p className="laboratory-empty-note">
        1С ещё ни разу не отправляла выгрузку на этот сайт.
      </p>
    );
  }

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <table className="data-table laboratory-results-table warehouse-1c-uploads-table">
        <thead>
          <tr>
            <th>Принято</th>
            <th>Файл</th>
            <th>Результат</th>
            <th>Итог разбора</th>
          </tr>
        </thead>
        <tbody>
          {uploads.map((upload) => (
            <tr key={upload.id}>
              <td>{formatDateTime(upload.receivedAt)}</td>
              <td>
                <span className="warehouse-1c-upload-file">
                  {upload.fileName === "" ? "Файл не передан" : upload.fileName}
                </span>
                {upload.source === undefined ? null : (
                  <span className="warehouse-1c-upload-note">
                    {upload.source}
                  </span>
                )}
                {upload.hasFile ? (
                  <span className="warehouse-1c-upload-actions">
                    <button
                      className="secondary-button warehouse-1c-upload-download"
                      type="button"
                      onClick={() => onOpen(upload)}
                    >
                      {openedUploadId === upload.id ? "Скрыть" : "Показать"}
                    </button>
                    <button
                      className="secondary-button warehouse-1c-upload-download"
                      disabled={downloadingId === upload.id}
                      type="button"
                      onClick={() => onDownload(upload)}
                    >
                      {downloadingId === upload.id ? "Скачиваем…" : "Скачать"}
                    </button>
                  </span>
                ) : null}
              </td>
              <td>
                <span className={readUploadStatus(upload).className}>
                  {readUploadStatus(upload).label}
                </span>
                <span className="warehouse-1c-upload-note">
                  {`код ${upload.statusCode}`}
                </span>
              </td>
              <td>{describeUploadResult(upload)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Принятая выгрузка не обязана быть разобранной: файл с незнакомой структурой
 * сохраняется, но остатки из него не выходят.
 */
function readUploadStatus(upload: Warehouse1cUpload) {
  if (upload.outcome === "rejected") {
    return { label: "Отклонена", className: "warehouse-1c-upload-rejected" };
  }

  return isParsedWarehouse1cUpload(upload)
    ? { label: "Принята", className: "warehouse-1c-upload-accepted" }
    : {
        label: "Принята, не разобрана",
        className: "warehouse-1c-upload-stored",
      };
}

/** У разобранной выгрузки итог — что записано, иначе — причина. */
function describeUploadResult(upload: Warehouse1cUpload) {
  if (!isParsedWarehouse1cUpload(upload)) {
    return upload.errorMessage ?? "—";
  }

  const parts = [
    upload.reportDate === undefined
      ? undefined
      : `остатки за ${formatDate(upload.reportDate)}`,
    upload.accounts === undefined ? undefined : `счета ${upload.accounts}`,
    upload.rowCount === undefined ? undefined : `строк: ${upload.rowCount}`,
  ].filter((part) => part !== undefined);

  return parts.length === 0 ? "—" : parts.join(" · ");
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
