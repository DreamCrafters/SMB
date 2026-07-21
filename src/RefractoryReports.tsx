import { useEffect, useState, type FormEvent } from "react";
import {
  refractoryEquipmentNames,
  refractoryReportLabels,
  type RefractoryCoshPayload,
  type RefractoryEquipmentPayload,
  type RefractoryFiringPayload,
  type RefractoryReportRevision,
  type RefractoryReportSubmission,
  type RefractoryReportType,
  type RefractoryShiftNumber,
  type ServerUserProfile,
} from "./contracts";
import {
  decideRefractoryReport,
  requestRefractoryReports,
  submitRefractoryReport,
} from "./services/refractoryReports";
import { readShortUserMessage } from "./services/userFacingMessages";
import { readRefractoryShiftContext } from "./services/refractoryShift";

const reportTypes: readonly RefractoryReportType[] = [
  "cosh",
  "equipment",
  "firing",
];

const reportStatusLabels = {
  pending: "Ожидает подтверждения",
  rejected: "Возвращено на доработку",
  approved: "Подтверждено",
} as const;

type ShowToast = (title: string, message: string) => void;

export function RefractoryShopWorkspace({
  profile,
  isAdminPreviewMode,
  onShowToast,
  decisionRefreshVersion = 0,
}: {
  profile: ServerUserProfile;
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
  decisionRefreshVersion?: number;
}) {
  const initialShift = readRefractoryShiftContext();
  const [reportDate, setReportDate] = useState(initialShift.reportDate);
  const [shiftNumber, setShiftNumber] = useState<RefractoryShiftNumber>(
    initialShift.shiftNumber,
  );
  const [activeType, setActiveType] = useState<RefractoryReportType>("cosh");
  const [reports, setReports] = useState<RefractoryReportRevision[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isCorrectionMode, setIsCorrectionMode] = useState(false);

  useEffect(() => {
    setIsCorrectionMode(false);
    setStatus("");
    if (isAdminPreviewMode) {
      setReports([]);
      setLoadState("ready");
      return;
    }
    const controller = new AbortController();
    setReports([]);
    setLoadState("loading");
    requestRefractoryReports(reportDate, shiftNumber, {
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ready") {
        setReports(result.reports);
        setLoadState("ready");
      } else {
        setLoadState("error");
        setStatus(
          readShortUserMessage(
            result.message,
            "Не удалось загрузить таблицы ОЦ.",
          ),
        );
      }
    });
    return () => controller.abort();
  }, [
    decisionRefreshVersion,
    isAdminPreviewMode,
    reportDate,
    shiftNumber,
    refreshVersion,
  ]);

  const activeReport = reports.find(
    (report) => report.reportType === activeType,
  );
  const isLocked =
    isAdminPreviewMode ||
    activeReport?.status === "pending" ||
    (activeReport?.status === "approved" && !isCorrectionMode);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLocked) return;
    let submission: RefractoryReportSubmission;
    try {
      submission = buildSubmission(
        activeType,
        reportDate,
        shiftNumber,
        new FormData(event.currentTarget),
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Проверьте заполнение таблицы.",
      );
      return;
    }
    setIsSubmitting(true);
    setStatus("Отправляем таблицу диспетчеру.");
    const result = await submitRefractoryReport(submission);
    setIsSubmitting(false);
    if (result.status === "error") {
      setStatus(
        readShortUserMessage(result.message, "Не удалось отправить таблицу."),
      );
      return;
    }
    setStatus("Таблица отправлена на подтверждение.");
    setIsCorrectionMode(false);
    setRefreshVersion((value) => value + 1);
    onShowToast(
      "Отправлено диспетчеру",
      `Таблица «${refractoryReportLabels[activeType]}» ожидает подтверждения.`,
    );
  }

  return (
    <section className="refractory-workspace" aria-label="Огнеупорный цех">
      <header className="refractory-header">
        <div>
          <p className="eyebrow">сменные отчёты</p>
          <h2>Огнеупорный цех</h2>
        </div>
        <div className="refractory-shift-fields">
          <label>
            <span>Дата смены</span>
            <input
              type="date"
              value={reportDate}
              onChange={(event) => setReportDate(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Смена</span>
            <select
              value={shiftNumber}
              onChange={(event) =>
                setShiftNumber(
                  Number(event.currentTarget.value) as RefractoryShiftNumber,
                )
              }
            >
              <option value={1}>1 · 08:00–20:00</option>
              <option value={2}>2 · 20:00–08:00</option>
            </select>
          </label>
          <label>
            <span>Мастер смены</span>
            <input value={profile.displayName} readOnly />
          </label>
        </div>
      </header>

      {isAdminPreviewMode ? (
        <p className="form-status form-status-local">
          В режиме предпросмотра таблицы не отправляются.
        </p>
      ) : null}

      <div className="refractory-report-menu" aria-label="Выбор таблицы">
        {reportTypes.map((reportType) => {
          const report = reports.find((item) => item.reportType === reportType);
          return (
            <button
              className={reportType === activeType ? "is-active" : undefined}
              type="button"
              key={reportType}
              onClick={() => {
                setActiveType(reportType);
                setIsCorrectionMode(false);
                setStatus("");
              }}
            >
              <span>{refractoryReportLabels[reportType]}</span>
              <small>
                {report === undefined
                  ? "Не отправлено"
                  : reportStatusLabels[report.status]}
              </small>
            </button>
          );
        })}
      </div>

      {loadState === "loading" ? (
        <p className="form-status">Загружаем таблицы.</p>
      ) : (
        <form
          className="refractory-report-form"
          key={`${activeType}:${activeReport?.id ?? "new"}:${isCorrectionMode}`}
          onSubmit={handleSubmit}
        >
          <RefractoryReportState
            report={activeReport}
            isCorrectionMode={isCorrectionMode}
            onStartCorrection={() => setIsCorrectionMode(true)}
          />
          <fieldset disabled={isLocked || isSubmitting}>
            {activeType === "cosh" ? (
              <CoshForm
                payload={
                  activeReport?.reportType === "cosh"
                    ? activeReport.payload
                    : undefined
                }
              />
            ) : activeType === "equipment" ? (
              <EquipmentForm
                payload={
                  activeReport?.reportType === "equipment"
                    ? activeReport.payload
                    : undefined
                }
              />
            ) : (
              <FiringForm
                payload={
                  activeReport?.reportType === "firing"
                    ? activeReport.payload
                    : undefined
                }
              />
            )}
          </fieldset>
          <div className="refractory-form-actions">
            {!isLocked ? (
              <button
                className="primary-button"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Отправляем…" : "Отправить диспетчеру"}
              </button>
            ) : null}
            {status.length > 0 ? <p className="form-status">{status}</p> : null}
          </div>
          {activeReport === undefined ? null : (
            <Totals values={activeReport.totals} />
          )}
        </form>
      )}
    </section>
  );
}

function RefractoryReportState({
  report,
  isCorrectionMode,
  onStartCorrection,
}: {
  report?: RefractoryReportRevision;
  isCorrectionMode: boolean;
  onStartCorrection: () => void;
}) {
  if (report === undefined) return null;
  return (
    <div className={`refractory-state refractory-state-${report.status}`}>
      <div>
        <strong>{reportStatusLabels[report.status]}</strong>
        <span>
          Ревизия {report.revisionNumber} · отправил {report.masterDisplayName}
        </span>
        {report.rejectionComment === undefined ? null : (
          <p>Комментарий диспетчера: {report.rejectionComment}</p>
        )}
      </div>
      {report.status === "approved" && !isCorrectionMode ? (
        <button
          className="secondary-button"
          type="button"
          onClick={onStartCorrection}
        >
          Создать исправление
        </button>
      ) : null}
    </div>
  );
}

function CoshForm({ payload = {} }: { payload?: RefractoryCoshPayload }) {
  return (
    <div className="refractory-form-sections">
      <ReportSection title="Работа печи и выпуск шамота">
        <div className="refractory-field-grid">
          <Field
            name="kilnNumber"
            label="Работает вращающаяся печь №"
            value={payload.kilnNumber}
          />
          {(["shbo", "shgr1", "shgr2", "shki"] as const).map((key) => (
            <NumberField
              key={key}
              name={`chamotteOutput.${key}`}
              label={
                {
                  shbo: "ШБО, т",
                  shgr1: "ШГР-1, т",
                  shgr2: "ШГР-2, т",
                  shki: "ШКИ, т",
                }[key]
              }
              value={payload.chamotteOutput?.[key]}
            />
          ))}
          <NumberField
            name="loadingBucketsPerHour"
            label="Загрузка, ковшей/час"
            value={payload.loadingBucketsPerHour}
            integer
          />
          <NumberField
            name="totalLoadingBuckets"
            label="Всего загружено ковшей"
            value={payload.totalLoadingBuckets}
            integer
          />
          <NumberField
            name="scrapRemovalTons"
            label="Вывоз брака из бункера РЦ, т"
            value={payload.scrapRemovalTons}
          />
        </div>
      </ReportSection>
      <ReportSection title="Замеры банок">
        <div className="refractory-mini-table">
          {[1, 2, 3].map((jarNumber) => {
            const row = payload.jarMeasurements?.find(
              (item) => item.jarNumber === jarNumber,
            );
            return (
              <div className="refractory-mini-row" key={jarNumber}>
                <strong>Банка {jarNumber}</strong>
                {[0, 1, 2, 3].map((index) => (
                  <NumberField
                    key={index}
                    name={`jar.${jarNumber}.${index}`}
                    label={`Замер ${index + 1}`}
                    value={row?.values[index]}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </ReportSection>
      <ReportSection title="Наполнение бункеров РЦ">
        <NamedQuantityRows
          identities={["I", "II", "III", "IV"]}
          identityLabel="Бункер"
          prefix="bunker"
          rows={payload.bunkerFill?.map((row) => ({
            identity: row.bunker,
            ...row,
          }))}
        />
      </ReportSection>
      <ReportSection title="Подача шамота в огнеупорный цех, тонн">
        <NamedQuantityRows
          identities={["I", "II", "III", "street"]}
          identityLabel="Источник"
          prefix="supply"
          rows={payload.chamotteSupply?.map((row) => ({
            identity: row.source,
            ...row,
          }))}
        />
      </ReportSection>
      <ReportSection title="Фасовка и время операций">
        <div className="refractory-field-grid">
          <Field
            name="bagging.jarNumber"
            label="Номер банки фасовки"
            value={payload.bagging?.jarNumber}
          />
          <NumberField
            name="bagging.quantity"
            label="Количество, т"
            value={payload.bagging?.quantity}
          />
          <TimeField
            name="furnaceIgnitionTime"
            label="Розжиг печи"
            value={payload.furnaceIgnitionTime}
          />
          <TimeField
            name="loadingStartTime"
            label="Начало загрузки"
            value={payload.loadingStartTime}
          />
          <TimeField
            name="bunkerTransitionTime"
            label="Переход на бункер РЦ"
            value={payload.bunkerTransitionTime}
          />
          <Field
            name="bunkerNumber"
            label="Номер бункера"
            value={payload.bunkerNumber}
          />
          <TimeField
            name="jarTransitionTime"
            label="Переход на банку"
            value={payload.jarTransitionTime}
          />
          <Field
            name="jarNumber"
            label="Номер банки"
            value={payload.jarNumber}
          />
          <TimeField
            name="furnaceStopTime"
            label="Остановка печи"
            value={payload.furnaceStopTime}
          />
          <label className="refractory-field refractory-field-wide">
            <span>Примечание</span>
            <textarea
              name="note"
              defaultValue={payload.note ?? ""}
              maxLength={2000}
            />
          </label>
        </div>
      </ReportSection>
    </div>
  );
}

const equipmentColumns = [
  ["productBrand", "Марка изделия", "text"],
  ["outputNorm", "Норма выработки", "number"],
  ["actualPieces", "Факт, шт.", "integer"],
  ["actualTons", "Факт, т", "number"],
  ["workedHours", "Работа, ч", "number"],
  ["mechanicalRepairHours", "Мех. ремонт", "number"],
  ["electricalRepairHours", "Эл. ремонт", "number"],
  ["carriageReplacementHours", "Замена каретки", "number"],
  ["brandReplacementHours", "Замена марки", "number"],
  ["moldReplacementHours", "Замена формы", "number"],
  ["reserveHours", "Резерв", "number"],
  ["workerAbsenceHours", "Нет рабочего/сменщика", "number"],
  ["rawMaterialAbsenceHours", "Нет сырья", "number"],
  ["note", "Примечание", "text"],
] as const;

function EquipmentForm({ payload }: { payload?: RefractoryEquipmentPayload }) {
  const [unformedCount, setUnformedCount] = useState(
    Math.max(1, payload?.unformedRows.length ?? 1),
  );
  return (
    <div className="refractory-form-sections">
      <ReportSection title="Работа оборудования и выпуск сырца формованных огнеупоров">
        <div className="refractory-table-wrap">
          <table className="refractory-input-table">
            <thead>
              <tr>
                <th>Оборудование</th>
                {equipmentColumns.map(([, label]) => (
                  <th key={label}>{label}</th>
                ))}
                <th>Простой всего</th>
              </tr>
            </thead>
            <tbody>
              {refractoryEquipmentNames.map((equipment, rowIndex) => {
                const row = payload?.formedRows.find(
                  (item) => item.equipment === equipment,
                );
                return (
                  <tr key={equipment}>
                    <th scope="row">{equipment}</th>
                    {equipmentColumns.map(([field, label, kind]) => (
                      <td key={field}>
                        <input
                          aria-label={`${equipment}: ${label}`}
                          defaultValue={row?.[field] ?? ""}
                          inputMode={kind === "text" ? undefined : "decimal"}
                          name={`formed.${rowIndex}.${field}`}
                          type="text"
                        />
                      </td>
                    ))}
                    <td className="refractory-calculated">
                      {row?.totalDowntimeHours ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ReportSection>
      <ReportSection title="Выпуск неформованных огнеупоров">
        <div className="refractory-table-wrap">
          <table className="refractory-input-table refractory-input-table-compact">
            <thead>
              <tr>
                <th>Марка изделия</th>
                <th>Норма, контейнеры</th>
                <th>Факт, контейнеры</th>
                <th>Факт, т</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: unformedCount }, (_, index) => {
                const row = payload?.unformedRows[index];
                return (
                  <tr key={index}>
                    <td>
                      <input
                        aria-label={`Марка неформованных огнеупоров ${index + 1}`}
                        name={`unformed.${index}.productBrand`}
                        defaultValue={row?.productBrand ?? ""}
                      />
                    </td>
                    <td>
                      <input
                        inputMode="decimal"
                        name={`unformed.${index}.outputNormContainers`}
                        defaultValue={row?.outputNormContainers ?? ""}
                      />
                    </td>
                    <td>
                      <input
                        inputMode="numeric"
                        name={`unformed.${index}.actualContainers`}
                        defaultValue={row?.actualContainers ?? ""}
                      />
                    </td>
                    <td>
                      <input
                        inputMode="decimal"
                        name={`unformed.${index}.actualTons`}
                        defaultValue={row?.actualTons ?? ""}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setUnformedCount((value) => Math.min(50, value + 1))}
        >
          Добавить строку
        </button>
      </ReportSection>
    </div>
  );
}

const firingColumns = [
  ["quantityPieces", "Количество, шт."],
  ["palletCount", "Поддоны"],
  ["goodTonsAverageWeight", "Годные, т (ср. вес)"],
  ["goodTonsWeighed", "Годные, т (взвешено)"],
  ["rejectUnderburnPieces", "Недожог"],
  ["rejectCracksPieces", "Трещины"],
  ["rejectFusionPieces", "Сплав"],
  ["rejectChipsPieces", "Сколы"],
] as const;

function FiringForm({ payload }: { payload?: RefractoryFiringPayload }) {
  const [rowCount, setRowCount] = useState(
    Math.max(1, payload?.rows.length ?? 1),
  );
  return (
    <div className="refractory-form-sections">
      <ReportSection title="Выпуск обожжённых огнеупоров">
        <div className="refractory-table-wrap">
          <table className="refractory-input-table refractory-input-table-firing">
            <thead>
              <tr>
                <th>Марка изделия</th>
                {firingColumns.map(([, label]) => (
                  <th key={label}>{label}</th>
                ))}
                <th>Брак всего</th>
                <th>Примечание</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }, (_, index) => {
                const row = payload?.rows[index];
                return (
                  <tr key={index}>
                    <td>
                      <input
                        name={`firing.${index}.productBrand`}
                        defaultValue={row?.productBrand ?? ""}
                      />
                    </td>
                    {firingColumns.map(([field, label]) => (
                      <td key={field}>
                        <input
                          aria-label={`${label}, строка ${index + 1}`}
                          inputMode="decimal"
                          name={`firing.${index}.${field}`}
                          defaultValue={row?.[field] ?? ""}
                        />
                      </td>
                    ))}
                    <td className="refractory-calculated">
                      {row?.rejectTotalPieces ?? "—"}
                    </td>
                    <td>
                      <input
                        name={`firing.${index}.note`}
                        defaultValue={row?.note ?? ""}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setRowCount((value) => Math.min(50, value + 1))}
        >
          Добавить строку
        </button>
      </ReportSection>
      <ReportSection title="Показатели смены">
        <div className="refractory-field-grid">
          <NumberField
            name="calcinationHours"
            label="Время обжига, часов"
            value={payload?.calcinationHours}
          />
          <NumberField
            name="sorterCount"
            label="Количество сортировщиков"
            value={payload?.sorterCount}
            integer
          />
          <label className="refractory-field refractory-field-wide">
            <span>Причина невыполнения плана</span>
            <textarea
              name="planFailureReason"
              defaultValue={payload?.planFailureReason ?? ""}
              maxLength={2000}
            />
          </label>
        </div>
      </ReportSection>
    </div>
  );
}

export function RefractoryReviewQueue({
  reports,
  errorMessage,
  onResolved,
  onShowToast,
}: {
  reports: RefractoryReportRevision[];
  errorMessage?: string;
  onResolved: (reportId: string) => void;
  onShowToast: ShowToast;
}) {
  const [rejectingId, setRejectingId] = useState("");
  const [comment, setComment] = useState("");
  const [busyId, setBusyId] = useState("");
  const [status, setStatus] = useState("");

  async function decide(
    report: RefractoryReportRevision,
    decision: "approve" | "reject",
  ) {
    if (decision === "reject" && comment.trim().length === 0) {
      setStatus("Укажите причину возврата.");
      return;
    }
    setBusyId(report.id);
    setStatus("");
    const result = await decideRefractoryReport(
      report.id,
      decision === "approve"
        ? { decision: "approve" }
        : { decision: "reject", comment: comment.trim() },
    );
    setBusyId("");
    if (result.status === "error") {
      setStatus(
        readShortUserMessage(result.message, "Не удалось сохранить решение."),
      );
      return;
    }
    setRejectingId("");
    setComment("");
    onResolved(report.id);
    onShowToast(
      decision === "approve"
        ? "Таблица подтверждена"
        : "Возвращено на доработку",
      refractoryReportLabels[report.reportType],
    );
  }

  return (
    <section
      className="refractory-review-queue"
      aria-label="Таблицы ОЦ на подтверждение"
    >
      <div className="refractory-review-head">
        <div>
          <p className="eyebrow">ожидают решения</p>
          <h2>Таблицы огнеупорного цеха</h2>
        </div>
        <span className="refractory-count">{reports.length}</span>
      </div>
      {errorMessage === undefined ? null : (
        <p className="form-status">{errorMessage}</p>
      )}
      {reports.length === 0 ? (
        <p className="form-status">Сейчас нет таблиц, ожидающих решения.</p>
      ) : (
        <div className="refractory-review-list">
          {reports.map((report) => (
            <article className="refractory-review-card" key={report.id}>
              <header>
                <div>
                  <strong>{refractoryReportLabels[report.reportType]}</strong>
                  <span>
                    {formatDate(report.reportDate)} · смена {report.shiftNumber}{" "}
                    · ревизия {report.revisionNumber}
                  </span>
                </div>
                <small>Мастер: {report.masterDisplayName}</small>
              </header>
              <ReportPreview report={report} />
              <Totals values={report.totals} />
              {rejectingId === report.id ? (
                <label className="refractory-reject-comment">
                  <span>Причина возврата</span>
                  <textarea
                    maxLength={2000}
                    value={comment}
                    onChange={(event) => setComment(event.currentTarget.value)}
                  />
                </label>
              ) : null}
              <div className="refractory-review-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={busyId.length > 0}
                  onClick={() => void decide(report, "approve")}
                >
                  Подтвердить
                </button>
                {rejectingId === report.id ? (
                  <>
                    <button
                      className="secondary-button secondary-button-danger"
                      type="button"
                      disabled={busyId.length > 0}
                      onClick={() => void decide(report, "reject")}
                    >
                      Вернуть
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setRejectingId("");
                        setComment("");
                      }}
                    >
                      Отмена
                    </button>
                  </>
                ) : (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busyId.length > 0}
                    onClick={() => {
                      setRejectingId(report.id);
                      setStatus("");
                    }}
                  >
                    Вернуть на доработку
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {status.length > 0 ? <p className="form-status">{status}</p> : null}
    </section>
  );
}

function ReportPreview({ report }: { report: RefractoryReportRevision }) {
  return (
    <div className="refractory-full-preview">
      <fieldset disabled>
        {report.reportType === "cosh" ? (
          <CoshForm payload={report.payload} />
        ) : report.reportType === "equipment" ? (
          <EquipmentForm payload={report.payload} />
        ) : (
          <FiringForm payload={report.payload} />
        )}
      </fieldset>
    </div>
  );
}

function Totals({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values);
  if (entries.length === 0) return null;
  return (
    <dl className="refractory-totals">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{totalLabels[key] ?? key}</dt>
          <dd>{value.toLocaleString("ru-RU")}</dd>
        </div>
      ))}
    </dl>
  );
}

const totalLabels: Record<string, string> = {
  chamotteOutputTons: "Выпуск шамота, т",
  bunkerFillTons: "Наполнение бункеров, т",
  chamotteSupplyTons: "Подача шамота, т",
  baggingTons: "Фасовка, т",
  scrapRemovalTons: "Вывоз брака, т",
  formedActualPieces: "Формованные, шт.",
  formedActualTons: "Формованные, т",
  formedWorkedHours: "Работа, ч",
  formedDowntimeHours: "Простой, ч",
  unformedActualContainers: "Неформованные, контейнеры",
  unformedActualTons: "Неформованные, т",
  quantityPieces: "Выпуск, шт.",
  palletCount: "Поддоны",
  goodTonsAverageWeight: "Годные по ср. весу, т",
  goodTonsWeighed: "Годные взвешенные, т",
  rejectTotalPieces: "Брак всего, шт.",
  rejectUnderburnPieces: "Недожог, шт.",
  rejectCracksPieces: "Трещины, шт.",
  rejectFusionPieces: "Сплав, шт.",
  rejectChipsPieces: "Сколы, шт.",
};

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="refractory-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Field({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value?: string;
}) {
  return (
    <label className="refractory-field">
      <span>{label}</span>
      <input name={name} defaultValue={value ?? ""} />
    </label>
  );
}

function NumberField({
  name,
  label,
  value,
  integer = false,
}: {
  name: string;
  label: string;
  value?: number;
  integer?: boolean;
}) {
  return (
    <label className="refractory-field">
      <span>{label}</span>
      <input
        inputMode={integer ? "numeric" : "decimal"}
        name={name}
        defaultValue={value ?? ""}
      />
    </label>
  );
}

function TimeField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value?: string;
}) {
  return (
    <label className="refractory-field">
      <span>{label}</span>
      <input type="time" name={name} defaultValue={value ?? ""} />
    </label>
  );
}

function NamedQuantityRows({
  identities,
  identityLabel,
  prefix,
  rows = [],
}: {
  identities: readonly string[];
  identityLabel: string;
  prefix: string;
  rows?: Array<{ identity: string; productName?: string; quantity?: number }>;
}) {
  return (
    <div className="refractory-mini-table">
      {identities.map((identity) => {
        const row = rows.find((item) => item.identity === identity);
        return (
          <div
            className="refractory-mini-row refractory-mini-row-quantity"
            key={identity}
          >
            <strong>
              {identityLabel} {identity === "street" ? "с улицы" : identity}
            </strong>
            <Field
              name={`${prefix}.${identity}.productName`}
              label="Наименование"
              value={row?.productName}
            />
            <NumberField
              name={`${prefix}.${identity}.quantity`}
              label="Количество, т"
              value={row?.quantity}
            />
          </div>
        );
      })}
    </div>
  );
}

function buildSubmission(
  type: RefractoryReportType,
  reportDate: string,
  shiftNumber: RefractoryShiftNumber,
  data: FormData,
): RefractoryReportSubmission {
  if (type === "cosh")
    return {
      reportType: type,
      reportDate,
      shiftNumber,
      payload: buildCoshPayload(data),
    };
  if (type === "equipment")
    return {
      reportType: type,
      reportDate,
      shiftNumber,
      payload: buildEquipmentPayload(data),
    };
  return {
    reportType: type,
    reportDate,
    shiftNumber,
    payload: buildFiringPayload(data),
  };
}

function buildCoshPayload(data: FormData): RefractoryCoshPayload {
  const output = compactNumbers(
    data,
    ["shbo", "shgr1", "shgr2", "shki"],
    "chamotteOutput",
  );
  const jarMeasurements = ([1, 2, 3] as const).flatMap((jarNumber) => {
    const values = [0, 1, 2, 3].flatMap((index) =>
      optionalNumber(data, `jar.${jarNumber}.${index}`),
    );
    return values.length === 0 ? [] : [{ jarNumber, values }];
  });
  return compact({
    kilnNumber: optionalText(data, "kilnNumber"),
    chamotteOutput: output,
    loadingBucketsPerHour: first(optionalNumber(data, "loadingBucketsPerHour")),
    totalLoadingBuckets: first(optionalNumber(data, "totalLoadingBuckets")),
    jarMeasurements,
    bunkerFill: buildNamedRows(
      data,
      "bunker",
      ["I", "II", "III", "IV"],
      "bunker",
    ),
    chamotteSupply: buildNamedRows(
      data,
      "supply",
      ["I", "II", "III", "street"],
      "source",
    ),
    bagging: compact({
      jarNumber: optionalText(data, "bagging.jarNumber"),
      quantity: first(optionalNumber(data, "bagging.quantity")),
    }),
    scrapRemovalTons: first(optionalNumber(data, "scrapRemovalTons")),
    furnaceIgnitionTime: optionalText(data, "furnaceIgnitionTime"),
    loadingStartTime: optionalText(data, "loadingStartTime"),
    bunkerTransitionTime: optionalText(data, "bunkerTransitionTime"),
    bunkerNumber: optionalText(data, "bunkerNumber"),
    jarTransitionTime: optionalText(data, "jarTransitionTime"),
    jarNumber: optionalText(data, "jarNumber"),
    furnaceStopTime: optionalText(data, "furnaceStopTime"),
    note: optionalText(data, "note"),
  }) as RefractoryCoshPayload;
}

function buildEquipmentPayload(data: FormData): RefractoryEquipmentPayload {
  const formedRows = refractoryEquipmentNames.map((equipment, index) => {
    const prefix = `formed.${index}`;
    return {
      equipment,
      ...compact({
        productBrand: optionalText(data, `${prefix}.productBrand`),
        outputNorm: first(optionalNumber(data, `${prefix}.outputNorm`)),
        actualPieces: first(optionalNumber(data, `${prefix}.actualPieces`)),
        actualTons: first(optionalNumber(data, `${prefix}.actualTons`)),
        workedHours: first(optionalNumber(data, `${prefix}.workedHours`)),
        mechanicalRepairHours: first(
          optionalNumber(data, `${prefix}.mechanicalRepairHours`),
        ),
        electricalRepairHours: first(
          optionalNumber(data, `${prefix}.electricalRepairHours`),
        ),
        carriageReplacementHours: first(
          optionalNumber(data, `${prefix}.carriageReplacementHours`),
        ),
        brandReplacementHours: first(
          optionalNumber(data, `${prefix}.brandReplacementHours`),
        ),
        moldReplacementHours: first(
          optionalNumber(data, `${prefix}.moldReplacementHours`),
        ),
        reserveHours: first(optionalNumber(data, `${prefix}.reserveHours`)),
        workerAbsenceHours: first(
          optionalNumber(data, `${prefix}.workerAbsenceHours`),
        ),
        rawMaterialAbsenceHours: first(
          optionalNumber(data, `${prefix}.rawMaterialAbsenceHours`),
        ),
        note: optionalText(data, `${prefix}.note`),
      }),
    };
  });
  const unformedRows = Array.from({ length: 50 }, (_, index) =>
    compact({
      productBrand: optionalText(data, `unformed.${index}.productBrand`),
      outputNormContainers: first(
        optionalNumber(data, `unformed.${index}.outputNormContainers`),
      ),
      actualContainers: first(
        optionalNumber(data, `unformed.${index}.actualContainers`),
      ),
      actualTons: first(optionalNumber(data, `unformed.${index}.actualTons`)),
    }),
  ).flatMap((row, index) => {
    if (Object.keys(row).length === 0) return [];
    if (typeof row.productBrand !== "string") {
      throw new Error(
        `Укажите марку в строке неформованных огнеупоров ${index + 1}.`,
      );
    }
    return [row as RefractoryEquipmentPayload["unformedRows"][number]];
  });
  return { formedRows, unformedRows };
}

function buildFiringPayload(data: FormData): RefractoryFiringPayload {
  const rows = Array.from({ length: 50 }, (_, index) =>
    compact({
      productBrand: optionalText(data, `firing.${index}.productBrand`),
      quantityPieces: first(
        optionalNumber(data, `firing.${index}.quantityPieces`),
      ),
      palletCount: first(optionalNumber(data, `firing.${index}.palletCount`)),
      goodTonsAverageWeight: first(
        optionalNumber(data, `firing.${index}.goodTonsAverageWeight`),
      ),
      goodTonsWeighed: first(
        optionalNumber(data, `firing.${index}.goodTonsWeighed`),
      ),
      rejectUnderburnPieces: first(
        optionalNumber(data, `firing.${index}.rejectUnderburnPieces`),
      ),
      rejectCracksPieces: first(
        optionalNumber(data, `firing.${index}.rejectCracksPieces`),
      ),
      rejectFusionPieces: first(
        optionalNumber(data, `firing.${index}.rejectFusionPieces`),
      ),
      rejectChipsPieces: first(
        optionalNumber(data, `firing.${index}.rejectChipsPieces`),
      ),
      note: optionalText(data, `firing.${index}.note`),
    }),
  ).flatMap((row, index) => {
    if (Object.keys(row).length === 0) return [];
    if (typeof row.productBrand !== "string") {
      throw new Error(`Укажите марку в строке печного отделения ${index + 1}.`);
    }
    return [row as RefractoryFiringPayload["rows"][number]];
  });
  return compact({
    rows,
    calcinationHours: first(optionalNumber(data, "calcinationHours")),
    sorterCount: first(optionalNumber(data, "sorterCount")),
    planFailureReason: optionalText(data, "planFailureReason"),
  }) as RefractoryFiringPayload;
}

function buildNamedRows(
  data: FormData,
  prefix: string,
  identities: readonly string[],
  identityField: string,
) {
  return identities.flatMap((identity) => {
    const row = compact({
      [identityField]: identity,
      productName: optionalText(data, `${prefix}.${identity}.productName`),
      quantity: first(optionalNumber(data, `${prefix}.${identity}.quantity`)),
    });
    return Object.keys(row).length === 1 ? [] : [row];
  });
}

function compactNumbers(
  data: FormData,
  keys: readonly string[],
  prefix: string,
) {
  const result = Object.fromEntries(
    keys.flatMap((key) =>
      optionalNumber(data, `${prefix}.${key}`).map((value) => [key, value]),
    ),
  );
  return Object.keys(result).length === 0 ? undefined : result;
}

function optionalText(data: FormData, name: string) {
  const value = String(data.get(name) ?? "").trim();
  return value.length === 0 ? undefined : value;
}

function optionalNumber(data: FormData, name: string): number[] {
  const text = String(data.get(name) ?? "")
    .trim()
    .replace(",", ".");
  if (text.length === 0) return [];
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0)
    throw new Error("Числа должны быть неотрицательными.");
  return [value];
}

function first(values: number[]) {
  return values[0];
}
function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) =>
        item !== undefined &&
        (!Array.isArray(item) || item.length > 0) &&
        (!(typeof item === "object" && item !== null && !Array.isArray(item)) ||
          Object.keys(item).length > 0),
    ),
  ) as Partial<T>;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU").format(new Date(`${value}T00:00:00`));
}
