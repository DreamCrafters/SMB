import { useEffect, useState, type FormEvent } from "react";
import {
  refractoryEquipmentNames,
  refractoryReportLabels,
  type RefractoryCoshPayload,
  type RefractoryBanksResponse,
  type RefractoryEquipmentPayload,
  type RefractoryFiringPayload,
  type RefractoryReportRevision,
  type RefractoryReportSubmission,
  type RefractoryReportType,
  type RefractoryShiftNumber,
  selectLatestWagonCycles,
  type RefractoryWagonRecord,
  type ServerUserProfile,
} from "./contracts";
import {
  countReturnedRefractoryReportsByType,
  decideRefractoryReport,
  requestRefractoryReports,
  requestRefractoryBanks,
  submitRefractoryReport,
} from "./services/refractoryReports";
import { requestRefractoryWagons } from "./services/refractoryWagons";
import {
  bankNumbers,
  calculateBankMeasurement,
  type BankMeasurementCalculation,
  type BankNumber,
} from "./services/bankMeasurements";
import { readShortUserMessage } from "./services/userFacingMessages";
import { readRefractoryShiftContext } from "./services/refractoryShift";
import {
  decimalNumberInputPattern,
  decimalNumberInputTitle,
  integerInputPattern,
  integerInputTitle,
  normalizeDecimalNumberInput,
  normalizeIntegerInput,
} from "./services/dispatcherFormInput";
import {
  clearRefractoryFieldError,
  formatRefractoryFormErrors,
  markRefractoryServerFieldErrors,
  validateRefractoryForm,
} from "./services/refractoryFormValidation";
import { ProductBrandPicker } from "./ProductBrandPicker";
import { LoadingIndicator } from "./LoadingIndicator";
import type { ShowToast } from "./services/toastStack";
import { useProductionBrands } from "./useProductionBrands";
import { RefractoryWagonCatalog } from "./RefractoryWagonCatalog";
import { RefractoryWagonInspectionJournal } from "./RefractoryWagonInspectionJournal";
import { RefractoryWagonJournal } from "./RefractoryWagonJournal";

/** Раздел `Вагоны` открывает четыре журнала одного жизненного цикла вагона. */
const wagonJournals = [
  { id: "catalog", label: "Каталог вагонов" },
  { id: "turnover", label: "Оборот вагонов" },
  { id: "firing", label: "Обжиг/Сортировка" },
  { id: "inspection", label: "Осмотр вагонов" },
] as const;

type WagonJournalId = (typeof wagonJournals)[number]["id"];

const reportStatusLabels = {
  pending: "Ожидает подтверждения",
  rejected: "Возвращено на доработку",
  approved: "Подтверждено",
} as const;

type RefractoryBanksState =
  | { status: "loading" }
  | ({ status: "ready" } & RefractoryBanksResponse)
  | { status: "error"; message: string };

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
  const [wagonJournal, setWagonJournal] = useState<WagonJournalId>();
  const [reports, setReports] = useState<RefractoryReportRevision[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isCorrectionMode, setIsCorrectionMode] = useState(false);
  const [banksState, setBanksState] = useState<RefractoryBanksState>({
    status: "loading",
  });
  const { labels: brandLabels, loadState: nomenclatureState } =
    useProductionBrands();

  useEffect(() => {
    if (isAdminPreviewMode) {
      setBanksState({ status: "error", message: "В режиме просмотра назначения банок не загружаются." });
      return;
    }
    const controller = new AbortController();
    setBanksState({ status: "loading" });
    requestRefractoryBanks({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setBanksState(result.status === "ready"
        ? result
        : {
            status: "error",
            message: readShortUserMessage(result.message, "Не удалось загрузить назначения банок."),
          });
    });
    return () => controller.abort();
  }, [isAdminPreviewMode, refreshVersion]);

  useEffect(() => {
    setIsCorrectionMode(false);
    setStatus("");
    setHasError(false);
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
        setHasError(true);
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
  const returnedReportCounts = countReturnedRefractoryReportsByType(reports, {
    reportDate,
    shiftNumber,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLocked) return;
    if (activeType === "cosh") {
      if (banksState.status !== "ready") {
        setHasError(true);
        setStatus("Дождитесь загрузки назначений и справочника банок.");
        return;
      }
      if (bankNumbers.some((bankNumber) =>
        !banksState.currentAssignments.some(
          (assignment) => assignment.bankNumber === bankNumber,
        )
      )) {
        setHasError(true);
        setStatus("Лаборатория должна назначить содержимое всех трёх банок.");
        return;
      }
    }
    const form = event.currentTarget;
    const fieldErrors = validateRefractoryForm(form);
    if (fieldErrors.length > 0) {
      setHasError(true);
      setStatus(formatRefractoryFormErrors(fieldErrors));
      fieldErrors[0]?.input.focus();
      return;
    }
    let submission: RefractoryReportSubmission;
    try {
      submission = buildSubmission(
        activeType,
        reportDate,
        shiftNumber,
        new FormData(form),
      );
    } catch (error) {
      setHasError(true);
      setStatus(
        error instanceof Error
          ? error.message
          : "Проверьте заполнение таблицы.",
      );
      return;
    }
    setIsSubmitting(true);
    setHasError(false);
    setStatus("Отправляем таблицу диспетчеру.");
    const result = await submitRefractoryReport(submission);
    setIsSubmitting(false);
    if (result.status === "error") {
      const invalidInputs = markRefractoryServerFieldErrors(
        form,
        result.details ?? [],
      );
      invalidInputs[0]?.focus();
      setHasError(true);
      setStatus(
        result.details !== undefined && result.details.length > 0
          ? formatRefractoryFormErrors(result.details)
          : readShortUserMessage(
              result.message,
              "Не удалось отправить таблицу.",
            ),
      );
      return;
    }
    setHasError(false);
    setStatus("Таблица отправлена на подтверждение.");
    setIsCorrectionMode(false);
    setRefreshVersion((value) => value + 1);
    onShowToast(
      "Отправлено диспетчеру",
      `Таблица «${refractoryReportLabels[activeType]}» ожидает подтверждения.`,
      "success",
    );
  }

  function handleCancelCorrection() {
    setIsCorrectionMode(false);
    setStatus("");
    setHasError(false);
  }

  function renderRefractoryReportTypeButton(
    reportType: RefractoryReportType,
    key?: string,
  ) {
    const report = reports.find((item) => item.reportType === reportType);
    const returnedCount = returnedReportCounts[reportType];
    const reportStatusLabel = report === undefined
      ? "Не отправлено"
      : reportStatusLabels[report.status];
    // «Обжиг/Сортировка» живёт внутри раздела «Вагоны», поэтому его активность
    // отмечается через wagonJournal, а не через отсутствие выбранного журнала.
    const isActive = reportType === "firing"
      ? wagonJournal === "firing"
      : wagonJournal === undefined && reportType === activeType;
    return (
      <button
        aria-label={`${refractoryReportLabels[reportType]}. ${reportStatusLabel}.${
          returnedCount > 0
            ? ` Возвращено на доработку: ${returnedCount}.`
            : ""
        }`}
        className={isActive ? "is-active" : undefined}
        key={key}
        type="button"
        onClick={() => {
          setWagonJournal(reportType === "firing" ? "firing" : undefined);
          setActiveType(reportType);
          setIsCorrectionMode(false);
          setStatus("");
          setHasError(false);
        }}
      >
        <span className="refractory-report-menu-heading">
          <span className="refractory-report-label">
            {refractoryReportLabels[reportType]}
          </span>
          {returnedCount > 0 ? (
            <b className="refractory-report-return-count" aria-hidden="true">
              {returnedCount}
            </b>
          ) : null}
        </span>
        <small>{reportStatusLabel}</small>
      </button>
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

      {nomenclatureState.status === "loading" ? (
        <LoadingIndicator label="Загружаем марки…" variant="panel" />
      ) : nomenclatureState.status === "error" ? (
        <p className="form-status form-status-error">
          {nomenclatureState.message}
        </p>
      ) : null}

      <div className="refractory-report-menu" aria-label="Выбор таблицы">
        {renderRefractoryReportTypeButton("cosh")}
        {renderRefractoryReportTypeButton("equipment")}
        <button
          aria-label="Вагоны. Журналы огнеупорного цеха."
          className={wagonJournal === undefined ? undefined : "is-active"}
          type="button"
          onClick={() => {
            setWagonJournal((current) => current ?? wagonJournals[0].id);
            setIsCorrectionMode(false);
            setStatus("");
            setHasError(false);
          }}
        >
          <span className="refractory-report-menu-heading">
            <span className="refractory-report-label">Вагоны</span>
          </span>
          <small>Журналы</small>
        </button>
      </div>

      {wagonJournal === undefined ? null : (
        <div
          className="refractory-report-menu refractory-wagon-journal-menu"
          aria-label="Журналы вагонов"
        >
          {wagonJournals.map((journal) => journal.id === "firing" ? (
            renderRefractoryReportTypeButton("firing", journal.id)
          ) : (
            <button
              className={journal.id === wagonJournal ? "is-active" : undefined}
              key={journal.id}
              type="button"
              onClick={() => setWagonJournal(journal.id)}
            >
              <span className="refractory-report-menu-heading">
                <span className="refractory-report-label">{journal.label}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {wagonJournal === "catalog" ? (
        <RefractoryWagonCatalog
          isAdminPreviewMode={isAdminPreviewMode}
          onShowToast={onShowToast}
        />
      ) : wagonJournal === "inspection" ? (
        <RefractoryWagonInspectionJournal
          defaultApprovalDate={reportDate}
          isAdminPreviewMode={isAdminPreviewMode}
          key={reportDate}
          onShowToast={onShowToast}
        />
      ) : wagonJournal === "turnover" ? (
        <RefractoryWagonJournal
          brandLabels={brandLabels}
          defaultLoadingDate={reportDate}
          isAdminPreviewMode={isAdminPreviewMode}
          key={reportDate}
          onShowToast={onShowToast}
        />
      ) : loadState === "loading" ? (
        <p className="form-status">Загружаем таблицы.</p>
      ) : (
        <form
          className="refractory-report-form"
          key={`${activeType}:${activeReport?.id ?? "new"}:${isCorrectionMode}`}
          noValidate
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
                brandLabels={brandLabels}
                payload={
                  activeReport?.reportType === "cosh"
                    ? activeReport.payload
                    : undefined
                }
                bankData={banksState.status === "ready" ? banksState : undefined}
                bankDataMessage={banksState.status === "error" ? banksState.message : undefined}
                isLocked={isLocked}
              />
            ) : activeType === "equipment" ? (
              <EquipmentForm
                brandLabels={brandLabels}
                payload={
                  activeReport?.reportType === "equipment"
                    ? activeReport.payload
                    : undefined
                }
              />
            ) : (
              <FiringForm
                defaultReportDate={reportDate}
                loadWagons={!isAdminPreviewMode}
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
            {activeReport?.status === "approved" && isCorrectionMode ? (
              <button
                className="secondary-button"
                type="button"
                disabled={isSubmitting}
                onClick={handleCancelCorrection}
              >
                Отменить
              </button>
            ) : null}
            {status.length > 0 ? (
              <p className={`form-status${hasError ? " form-status-error" : ""}`}>
                {status}
              </p>
            ) : null}
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

function CoshForm({
  brandLabels = [],
  payload = {},
  bankData,
  bankDataMessage,
  isLocked,
}: {
  brandLabels?: string[];
  payload?: RefractoryCoshPayload;
  bankData?: RefractoryBanksResponse;
  bankDataMessage?: string;
  isLocked: boolean;
}) {
  const [jarDrafts, setJarDrafts] = useState<Record<BankNumber, string[]>>(() =>
    Object.fromEntries(bankNumbers.map((bankNumber) => {
      const saved = payload.jarMeasurements?.find(
        (item) => item.jarNumber === bankNumber,
      );
      return [
        bankNumber,
        saved === undefined
          ? Array.from({ length: 4 }, () => "")
          : saved.values.map(String),
      ];
    })) as Record<BankNumber, string[]>,
  );

  function updateJarMeasurement(
    bankNumber: BankNumber,
    index: number,
    rawValue: string,
  ) {
    const value = normalizeDecimalNumberInput(rawValue);
    setJarDrafts((current) => ({
      ...current,
      [bankNumber]: current[bankNumber].map((item, itemIndex) =>
        itemIndex === index ? value : item
      ),
    }));
  }

  function addJarMeasurement(bankNumber: BankNumber) {
    setJarDrafts((current) => ({
      ...current,
      [bankNumber]: [...current[bankNumber], ""],
    }));
  }

  function removeJarMeasurement(bankNumber: BankNumber, index: number) {
    setJarDrafts((current) => current[bankNumber].length <= 1
      ? current
      : {
          ...current,
          [bankNumber]: current[bankNumber].filter((_, itemIndex) => itemIndex !== index),
        });
  }

  return (
    <div className="refractory-form-sections">
      <h3 className="refractory-paper-title">Сводка по ЦОШ (ежесменная)</h3>
      <ReportSection title="Выпуск шамота">
        <div className="refractory-field-grid">
          <Field
            name="kilnNumber"
            label="Работает вр. печь №"
            value={payload.kilnNumber}
          />
          <NumberField
            name="loadingBucketsPerHour"
            label="Загрузка, ковш/час"
            value={payload.loadingBucketsPerHour}
            integer
          />
          <NumberField
            name="totalLoadingBuckets"
            label="Загрузка, всего ковшей"
            value={payload.totalLoadingBuckets}
            integer
          />
        </div>
        <ChamotteOutputRows brandLabels={brandLabels} payload={payload} />
      </ReportSection>
      <ReportSection title="Замеры банок">
        {bankDataMessage === undefined ? null : (
          <p className="form-status form-status-error" role="alert">{bankDataMessage}</p>
        )}
        <p className="refractory-section-note">
          Для каждой банки внесите хотя бы один замер. Количество замеров может отличаться.
        </p>
        <div className="bank-measurements-grid refractory-bank-measurements">
          {bankNumbers.map((bankNumber) => {
            const savedRow = payload.jarMeasurements?.find(
              (item) => item.jarNumber === bankNumber,
            );
            const assignment = bankData?.currentAssignments.find(
              (item) => item.bankNumber === bankNumber,
            );
            const calculation = isLocked
              ? readStoredBankCalculation(savedRow)
              : readDraftBankCalculation(
                  assignment,
                  jarDrafts[bankNumber],
                  bankData?.volumeReference,
                );
            const material = isLocked
              ? savedRow?.material
              : assignment?.materialLabel;
            const density = isLocked
              ? savedRow?.bulkDensityTonsPerCubicMeter
              : assignment?.bulkDensityTonsPerCubicMeter;
            return (
              <article className="bank-measurement-card" data-bank-number={bankNumber} key={bankNumber}>
                <header>
                  <div>
                    <span>Банка {readBankLabel(bankNumber)}</span>
                    <strong>{material ?? "Не назначено"}</strong>
                  </div>
                  <small>
                    {density === undefined
                      ? "Лаборатория должна назначить материал из журнала печи 2"
                      : `Насыпной вес ${formatTableTotal(density)} т/м³`}
                  </small>
                </header>
                <div className="bank-measurement-inputs">
                  {jarDrafts[bankNumber].map((value, index) => (
                    <label key={index}>
                      <span>Замер {index + 1}, м</span>
                      <span className="bank-measurement-input-row">
                        <input
                          aria-label={`Банка ${readBankLabel(bankNumber)}: замер ${index + 1}`}
                          data-refractory-label={`Банка ${readBankLabel(bankNumber)}: замер ${index + 1}`}
                          data-refractory-max={bankData?.volumeReference.points.at(-1)?.heightMeters}
                          data-refractory-number="decimal"
                          inputMode="decimal"
                          maxLength={20}
                          name={`jar.${bankNumber}.${index}`}
                          pattern={decimalNumberInputPattern}
                          title={decimalNumberInputTitle}
                          type="text"
                          value={value}
                          onChange={(event) => {
                            const rawValue = event.currentTarget.value;
                            clearRefractoryFieldError(event.currentTarget);
                            updateJarMeasurement(bankNumber, index, rawValue);
                          }}
                        />
                        <button
                          aria-label={`Удалить замер ${index + 1} банки ${readBankLabel(bankNumber)}`}
                          disabled={jarDrafts[bankNumber].length <= 1}
                          type="button"
                          onClick={() => removeJarMeasurement(bankNumber, index)}
                        >×</button>
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  className="bank-measurement-add"
                  type="button"
                  onClick={() => addJarMeasurement(bankNumber)}
                >
                  Добавить замер
                </button>
                {assignment === undefined && !isLocked ? (
                  <p className="bank-measurement-error">Содержимое банки ещё не назначено.</p>
                ) : calculation?.error === undefined ? null : (
                  <p className="bank-measurement-error" role="alert">{calculation.error}</p>
                )}
                <BankCalculationResults calculation={calculation?.value} />
              </article>
            );
          })}
        </div>
      </ReportSection>
      <ReportSection title="Заполнение ж/д бункеров">
        <NamedQuantityRows
          identities={["I", "II", "III", "IV"]}
          identityLabel=""
          prefix="bunker"
          productLabel="Наименование продукции"
          quantityLabel="Кол-во, т"
          rows={payload.bunkerFill?.map((row) => ({
            identity: row.bunker,
            ...row,
          }))}
        />
      </ReportSection>
      <ReportSection title="Подача шамота в огнеупорный цех, тн">
        <NamedQuantityRows
          identities={["I", "II", "III", "street"]}
          identityLabel=""
          identityLabels={{ I: "Из I", II: "II", III: "III", street: "уличн." }}
          prefix="supply"
          productLabel="Наименование продукции"
          quantityLabel="Кол-во, т"
          rows={payload.chamotteSupply?.map((row) => ({
            identity: row.source,
            ...row,
          }))}
        />
      </ReportSection>
      <ReportSection title="Затарка в мешки">
        <div className="refractory-field-grid">
          <Field
            name="bagging.jarNumber"
            label="№ банки"
            value={payload.bagging?.jarNumber}
          />
          <NumberField
            name="bagging.quantity"
            label="Кол-во, т"
            value={payload.bagging?.quantity}
          />
          <NumberField
            name="scrapRemovalTons"
            label="Вывоз недопала с ж/д бункера, тн"
            value={payload.scrapRemovalTons}
          />
        </div>
      </ReportSection>
      <ReportSection title="Время операций">
        <div className="refractory-field-grid">
          <TimeField
            name="furnaceIgnitionTime"
            label="Время розжига печи"
            value={payload.furnaceIgnitionTime}
          />
          <TimeField
            name="loadingStartTime"
            label="Время начала загрузки"
            value={payload.loadingStartTime}
          />
          <TimeField
            name="bunkerTransitionTime"
            label="Время перехода на ж/д бункер"
            value={payload.bunkerTransitionTime}
          />
          <Field
            name="bunkerNumber"
            label="№ бункера"
            value={payload.bunkerNumber}
          />
          <TimeField
            name="jarTransitionTime"
            label="Время перехода на банку"
            value={payload.jarTransitionTime}
          />
          <Field
            name="jarNumber"
            label="№ банки"
            value={payload.jarNumber}
          />
          <TimeField
            name="furnaceStopTime"
            label="Время прекращения работы печи"
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

type ChamotteOutputDraftRow = {
  id: number;
  productBrand?: string;
  quantityTons?: number;
};

const legacyChamotteOutputLabels = {
  shbo: "ШБО",
  shgr1: "ШГР-1",
  shgr2: "ШГР-2",
  shki: "ШКИ",
} as const;

function ChamotteOutputRows({
  brandLabels,
  payload,
}: {
  brandLabels: readonly string[];
  payload: RefractoryCoshPayload;
}) {
  const [rows, setRows] = useState<ChamotteOutputDraftRow[]>(() => {
    const savedRows = payload.chamotteOutputRows?.map((row, index) => ({
      id: index,
      ...row,
    })) ?? Object.entries(payload.chamotteOutput ?? {}).flatMap(
      ([key, quantityTons], index) => {
        const productBrand = legacyChamotteOutputLabels[
          key as keyof typeof legacyChamotteOutputLabels
        ];
        return productBrand === undefined || quantityTons === undefined
          ? []
          : [{ id: index, productBrand, quantityTons }];
      },
    );

    return savedRows.length > 0 ? savedRows : [{ id: 0 }];
  });

  function addRow() {
    setRows((current) => current.length >= 50
      ? current
      : [
          ...current,
          { id: Math.max(...current.map((row) => row.id), -1) + 1 },
        ]);
  }

  function removeRow(id: number) {
    setRows((current) => current.length <= 1
      ? current
      : current.filter((row) => row.id !== id));
  }

  return (
    <div className="refractory-cosh-output">
      <div className="refractory-table-wrap refractory-table-wrap-full-height">
        <table
          className="refractory-input-table refractory-input-table-cosh-output"
          data-refractory-unique-brands
        >
          <thead>
            <tr>
              <th>Марка изделия</th>
              <th>Выпуск, т</th>
              <th aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td>
                  <ProductBrandPicker
                    ariaLabel={`Марка изделия, строка ${index + 1}`}
                    isRefractoryRowBrand
                    name={`chamotteOutputRows.${index}.productBrand`}
                    defaultValue={row.productBrand ?? ""}
                    labels={brandLabels}
                    onInputChange={clearRefractoryFieldError}
                  />
                </td>
                <td>
                  <RefractoryNumberInput
                    aria-label={`Выпуск, т, строка ${index + 1}`}
                    isRefractoryRowQuantity
                    name={`chamotteOutputRows.${index}.quantityTons`}
                    defaultValue={row.quantityTons ?? ""}
                  />
                </td>
                <td className="refractory-row-action">
                  <button
                    aria-label={`Удалить строку выпуска шамота ${index + 1}`}
                    className="secondary-button"
                    disabled={rows.length <= 1}
                    type="button"
                    onClick={() => removeRow(row.id)}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        aria-label="Добавить строку выпуска шамота"
        className="secondary-button"
        disabled={rows.length >= 50}
        type="button"
        onClick={addRow}
      >
        Добавить строку
      </button>
    </div>
  );
}

type BankCalculationDisplay = Pick<
  BankMeasurementCalculation,
  "averageHeightMeters" | "volumeCubicMeters" | "materialMassTons"
>;

function BankCalculationResults({
  calculation,
}: {
  calculation?: BankCalculationDisplay;
}) {
  return (
    <dl className="bank-measurement-results">
      <div>
        <dt>Средний замер</dt>
        <dd>{formatBankResult(calculation?.averageHeightMeters, "м")}</dd>
      </div>
      <div>
        <dt>Объём</dt>
        <dd>{formatBankResult(calculation?.volumeCubicMeters, "м³")}</dd>
      </div>
      <div className="bank-measurement-mass">
        <dt>Масса материала</dt>
        <dd>{formatBankResult(calculation?.materialMassTons, "т")}</dd>
      </div>
    </dl>
  );
}

function readStoredBankCalculation(
  row: NonNullable<RefractoryCoshPayload["jarMeasurements"]>[number] | undefined,
): { value?: BankCalculationDisplay; error?: string } | undefined {
  if (
    row?.averageHeightMeters === undefined ||
    row.volumeCubicMeters === undefined ||
    row.materialMassTons === undefined
  ) {
    return undefined;
  }
  return {
    value: {
      averageHeightMeters: row.averageHeightMeters,
      volumeCubicMeters: row.volumeCubicMeters,
      materialMassTons: row.materialMassTons,
    },
  };
}

function readDraftBankCalculation(
  assignment: RefractoryBanksResponse["currentAssignments"][number] | undefined,
  values: readonly string[],
  volumeReference: RefractoryBanksResponse["volumeReference"] | undefined,
): { value?: BankCalculationDisplay; error?: string } | undefined {
  if (assignment === undefined || volumeReference === undefined) return undefined;
  const measurements = values.flatMap((value) => {
    if (value.length === 0 || value.endsWith(".")) return [];
    const parsed = Number(value);
    return Number.isFinite(parsed) ? [parsed] : [];
  });
  if (measurements.length === 0) return undefined;
  const result = calculateBankMeasurement({
    assignment,
    measurements,
    volumeReference,
  });
  return result.ok ? { value: result.value } : { error: result.error };
}

function readBankLabel(bankNumber: BankNumber) {
  return ({ 1: "I", 2: "II", 3: "III" } as const)[bankNumber];
}

function formatBankResult(value: number | undefined, unit: string) {
  return value === undefined ? "—" : `${formatTableTotal(value)} ${unit}`;
}

const equipmentColumns = [
  ["productBrand", "Марка изделия", "text", "brand", "production"],
  ["outputNorm", "Норма выработки", "number", "medium", "production"],
  ["actualPieces", "Факт, шт.", "integer", "narrow", "production"],
  ["actualTons", "Факт, т", "number", "narrow", "production"],
  ["workedHours", "Отработано, ч", "number", "narrow", "neutral"],
  ["totalDowntimeHours", "Простой всего", "calculated", "compact", "downtime"],
  ["mechanicalRepairHours", "Ремонт по мех. части", "number", "compact", "downtime"],
  ["electricalRepairHours", "Ремонт по эл. части", "number", "compact", "downtime"],
  ["carriageReplacementHours", "Замена вагона", "number", "medium", "downtime"],
  ["brandReplacementHours", "Замена марки", "number", "medium", "downtime"],
  ["moldReplacementHours", "Замена формы", "number", "medium", "downtime"],
  ["reserveHours", "Резерв", "number", "narrow", "downtime"],
  ["workerAbsenceHours", "Отсутствие рабочего/сменщика", "number", "wide", "downtime"],
  ["rawMaterialAbsenceHours", "Отсутствие сырья", "number", "compact", "downtime"],
  ["note", "Примечание", "text", "text", "neutral"],
] as const;

const equipmentDowntimeFields = [
  "mechanicalRepairHours",
  "electricalRepairHours",
  "carriageReplacementHours",
  "brandReplacementHours",
  "moldReplacementHours",
  "reserveHours",
  "workerAbsenceHours",
  "rawMaterialAbsenceHours",
] as const;

const equipmentFooterTrailingColumns = equipmentColumns.slice(
  equipmentColumns.findIndex(([field]) => field === "totalDowntimeHours") + 1,
);

type FormedTableSummary = {
  actualPieces: number;
  actualTons: number;
  workedHours: number;
  downtimeHours: number;
  downtimeByEquipment: Partial<
    Record<(typeof refractoryEquipmentNames)[number], number>
  >;
};

type UnformedTableSummary = {
  actualContainers: number;
  actualTons: number;
};

function summarizeFormedRows(
  rows: RefractoryEquipmentPayload["formedRows"],
): FormedTableSummary {
  const downtimeByEquipment: FormedTableSummary["downtimeByEquipment"] = {};
  let actualPieces = 0;
  let actualTons = 0;
  let workedHours = 0;
  let downtimeHours = 0;

  rows.forEach((row) => {
    const rowDowntime =
      row.totalDowntimeHours ??
      equipmentDowntimeFields.reduce(
        (total, field) => total + (row[field] ?? 0),
        0,
      );
    downtimeByEquipment[row.equipment] = rowDowntime;
    actualPieces += row.actualPieces ?? 0;
    actualTons += row.actualTons ?? 0;
    workedHours += row.workedHours ?? 0;
    downtimeHours += rowDowntime;
  });

  return {
    actualPieces,
    actualTons,
    workedHours,
    downtimeHours,
    downtimeByEquipment,
  };
}

function summarizeFormedTable(table: Element | null): FormedTableSummary {
  type FormedRow = RefractoryEquipmentPayload["formedRows"][number];
  type DowntimeField = (typeof equipmentDowntimeFields)[number];
  const rows = Array.from(
    table?.querySelectorAll("tbody tr") ?? [],
    (row, rowIndex): FormedRow | null => {
      const equipment = refractoryEquipmentNames[rowIndex];
      if (equipment === undefined) return null;
      const downtime = Object.fromEntries(
        equipmentDowntimeFields.map((field) => [
          field,
          readRowNumber(row, field),
        ]),
      ) as Partial<Record<DowntimeField, number>>;

      return {
        equipment,
        actualPieces: readRowNumber(row, "actualPieces"),
        actualTons: readRowNumber(row, "actualTons"),
        workedHours: readRowNumber(row, "workedHours"),
        ...downtime,
      };
    },
  );

  return summarizeFormedRows(rows.filter((row) => row !== null));
}

function summarizeUnformedRows(
  rows: RefractoryEquipmentPayload["unformedRows"],
): UnformedTableSummary {
  return rows.reduce<UnformedTableSummary>(
    (summary, row) => ({
      actualContainers: summary.actualContainers + (row.actualContainers ?? 0),
      actualTons: summary.actualTons + (row.actualTons ?? 0),
    }),
    { actualContainers: 0, actualTons: 0 },
  );
}

function summarizeUnformedTable(table: Element | null): UnformedTableSummary {
  const rows = Array.from(
    table?.querySelectorAll("tbody tr") ?? [],
    (row): RefractoryEquipmentPayload["unformedRows"][number] => ({
      productBrand: "",
      actualContainers: readRowNumber(row, "actualContainers"),
      actualTons: readRowNumber(row, "actualTons"),
    }),
  );

  return summarizeUnformedRows(rows);
}

function readRowNumber(row: Element, field: string) {
  const input = row.querySelector<HTMLInputElement>(
    `input[name$=".${field}"]`,
  );
  if (input === null || input.value.trim().length === 0) return 0;
  const value = Number(input.value.replace(",", "."));

  return Number.isFinite(value) ? value : 0;
}

function formatTableTotal(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

function EquipmentForm({
  brandLabels = [],
  payload,
}: {
  brandLabels?: string[];
  payload?: RefractoryEquipmentPayload;
}) {
  const [unformedCount, setUnformedCount] = useState(
    Math.max(1, payload?.unformedRows.length ?? 1),
  );
  const [formedSummary, setFormedSummary] = useState(() =>
    summarizeFormedRows(payload?.formedRows ?? []),
  );
  const [unformedSummary, setUnformedSummary] = useState(() =>
    summarizeUnformedRows(payload?.unformedRows ?? []),
  );
  return (
    <div className="refractory-form-sections">
      <ReportSection title="Выпуск сырца формованных огнеупоров">
        <div className="refractory-table-wrap">
          <table className="refractory-input-table refractory-input-table-equipment">
            <thead>
              <tr>
                <th className="refractory-equipment-column-name">
                  Оборудование
                </th>
                {equipmentColumns.map(([, label, , width, group]) => (
                  <th
                    className={`refractory-equipment-column-${width} refractory-cell-${group}`}
                    key={label}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody
              onInput={(event) =>
                setFormedSummary(
                  summarizeFormedTable(event.currentTarget.closest("table")),
                )
              }
            >
              {refractoryEquipmentNames.map((equipment, rowIndex) => {
                const row = payload?.formedRows.find(
                  (item) => item.equipment === equipment,
                );
                return (
                  <tr key={equipment}>
                    <th scope="row">{equipment}</th>
                    {equipmentColumns.map(([field, label, kind, , group]) => (
                      <td
                        className={`refractory-cell-${group}${
                          kind === "calculated" ? " refractory-calculated" : ""
                        }`}
                        key={field}
                      >
                        {field === "productBrand" ? (
                          <ProductBrandPicker
                            ariaLabel={`${equipment}: ${label}`}
                            defaultValue={row?.productBrand}
                            labels={brandLabels}
                            name={`formed.${rowIndex}.productBrand`}
                            onInputChange={clearRefractoryFieldError}
                          />
                        ) : kind === "calculated" ? (
                          <output
                            aria-label={`Простой всего, ${equipment}`}
                          >
                            {formatTableTotal(
                              formedSummary.downtimeByEquipment[equipment] ?? 0,
                            )}
                          </output>
                        ) : kind !== "text" ? (
                          <RefractoryNumberInput
                            aria-label={`${equipment}: ${label}`}
                            defaultValue={row?.[field] ?? ""}
                            name={`formed.${rowIndex}.${field}`}
                            integer={kind === "integer"}
                            max={field.endsWith("Hours") ? 24 : undefined}
                          />
                        ) : (
                          <input
                            aria-label={`${equipment}: ${label}`}
                            data-refractory-label={`${equipment}: ${label}`}
                            defaultValue={row?.[field] ?? ""}
                            maxLength={field === "note" ? 2000 : 120}
                            name={`formed.${rowIndex}.${field}`}
                            type="text"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3}>ИТОГО выпуск формованных огнеупоров</th>
                <td className="refractory-cell-production refractory-calculated">
                  <output aria-label="Итого формованных огнеупоров, шт.">
                    {formatTableTotal(formedSummary.actualPieces)}
                  </output>
                </td>
                <td className="refractory-cell-production refractory-calculated">
                  <output aria-label="Итого формованных огнеупоров, т">
                    {formatTableTotal(formedSummary.actualTons)}
                  </output>
                </td>
                <td className="refractory-calculated">
                  <output aria-label="Итого отработано, ч">
                    {formatTableTotal(formedSummary.workedHours)}
                  </output>
                </td>
                <td className="refractory-cell-downtime refractory-calculated">
                  <output aria-label="Итого простой, ч">
                    {formatTableTotal(formedSummary.downtimeHours)}
                  </output>
                </td>
                {equipmentFooterTrailingColumns.map(([field]) => (
                  <td key={field} />
                ))}
              </tr>
            </tfoot>
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
            <tbody
              onInput={(event) =>
                setUnformedSummary(
                  summarizeUnformedTable(event.currentTarget.closest("table")),
                )
              }
            >
              {Array.from({ length: unformedCount }, (_, index) => {
                const row = payload?.unformedRows[index];
                return (
                  <tr key={index}>
                    <td>
                      <ProductBrandPicker
                        ariaLabel={`Марка неформованных огнеупоров ${index + 1}`}
                        dataLabel={`Марка изделия, строка ${index + 1}`}
                        isRefractoryRowBrand
                        name={`unformed.${index}.productBrand`}
                        defaultValue={row?.productBrand ?? ""}
                        labels={brandLabels}
                        onInputChange={clearRefractoryFieldError}
                      />
                    </td>
                    <td>
                      <RefractoryNumberInput
                        aria-label={`Норма, контейнеры, строка ${index + 1}`}
                        name={`unformed.${index}.outputNormContainers`}
                        defaultValue={row?.outputNormContainers ?? ""}
                      />
                    </td>
                    <td>
                      <RefractoryNumberInput
                        aria-label={`Факт, контейнеры, строка ${index + 1}`}
                        integer
                        name={`unformed.${index}.actualContainers`}
                        defaultValue={row?.actualContainers ?? ""}
                      />
                    </td>
                    <td>
                      <RefractoryNumberInput
                        aria-label={`Факт, т, строка ${index + 1}`}
                        name={`unformed.${index}.actualTons`}
                        defaultValue={row?.actualTons ?? ""}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>ИТОГО выпуск неформованных огнеупоров</th>
                <td className="refractory-calculated">
                  <output aria-label="Итого неформованных огнеупоров, контейнеры">
                    {formatTableTotal(unformedSummary.actualContainers)}
                  </output>
                </td>
                <td className="refractory-calculated">
                  <output aria-label="Итого неформованных огнеупоров, т">
                    {formatTableTotal(unformedSummary.actualTons)}
                  </output>
                </td>
              </tr>
            </tfoot>
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
  ["quantityPieces", "Кол-во, шт.", "integer"],
  ["palletCount", "Кол-во, поддонов", "integer"],
  ["goodTonsAverageWeight", "Годная, т по среднему весу", "number"],
  ["goodTonsWeighed", "Годная, т по взвешиванию", "number"],
  ["rejectTotalPieces", "Брак всего, шт.", "calculated"],
  ["rejectUnderburnPieces", "Недожог", "integer"],
  ["rejectCracksPieces", "Трещины", "integer"],
  ["rejectFusionPieces", "Выплавка", "integer"],
  ["rejectChipsPieces", "Сколы", "integer"],
] as const;

const firingRejectFields = [
  "rejectUnderburnPieces",
  "rejectCracksPieces",
  "rejectFusionPieces",
  "rejectChipsPieces",
] as const;

const firingInputNumericFields = [
  "quantityPieces",
  "palletCount",
  "goodTonsAverageWeight",
  "goodTonsWeighed",
  ...firingRejectFields,
] as const;

type FiringTableSummary = {
  quantityPieces: number;
  palletCount: number;
  goodTonsAverageWeight: number;
  goodTonsWeighed: number;
  rejectTotalPieces: number;
  rejectUnderburnPieces: number;
  rejectCracksPieces: number;
  rejectFusionPieces: number;
  rejectChipsPieces: number;
  rejectByRow: number[];
};

function summarizeFiringRows(
  rows: RefractoryFiringPayload["rows"],
): FiringTableSummary {
  return rows.reduce<FiringTableSummary>(
    (summary, row) => {
      const rejectTotal =
        row.rejectTotalPieces ??
        firingRejectFields.reduce(
          (total, field) => total + (row[field] ?? 0),
          0,
        );
      summary.quantityPieces += row.quantityPieces ?? 0;
      summary.palletCount += row.palletCount ?? 0;
      summary.goodTonsAverageWeight += row.goodTonsAverageWeight ?? 0;
      summary.goodTonsWeighed += row.goodTonsWeighed ?? 0;
      summary.rejectTotalPieces += rejectTotal;
      summary.rejectUnderburnPieces += row.rejectUnderburnPieces ?? 0;
      summary.rejectCracksPieces += row.rejectCracksPieces ?? 0;
      summary.rejectFusionPieces += row.rejectFusionPieces ?? 0;
      summary.rejectChipsPieces += row.rejectChipsPieces ?? 0;
      summary.rejectByRow.push(rejectTotal);
      return summary;
    },
    emptyFiringSummary(),
  );
}

function summarizeFiringTable(table: Element | null): FiringTableSummary {
  type FiringRow = RefractoryFiringPayload["rows"][number];
  type NumericField = (typeof firingInputNumericFields)[number];
  const rows = Array.from(
    table?.querySelectorAll("tbody tr") ?? [],
    (row): FiringRow => {
      const numericValues = Object.fromEntries(
        firingInputNumericFields.map((field) => [
          field,
          readRowNumber(row, field),
        ]),
      ) as Partial<Record<NumericField, number>>;

      return { sortingWagons: [], ...numericValues };
    },
  );

  return summarizeFiringRows(rows);
}

function emptyFiringSummary(): FiringTableSummary {
  return {
    quantityPieces: 0,
    palletCount: 0,
    goodTonsAverageWeight: 0,
    goodTonsWeighed: 0,
    rejectTotalPieces: 0,
    rejectUnderburnPieces: 0,
    rejectCracksPieces: 0,
    rejectFusionPieces: 0,
    rejectChipsPieces: 0,
    rejectByRow: [],
  };
}

function FiringWagonMultiSelect({
  ariaLabel,
  name,
  options,
  saved = [],
}: {
  ariaLabel: string;
  name: string;
  options: RefractoryWagonRecord[];
  saved?: NonNullable<
    RefractoryFiringPayload["rows"][number]["sortingWagons"]
  >;
}) {
  const labels = new Map(
    options.map((wagon) => [
      wagon.id,
      `${wagon.number}${wagon.productBrand === null ? "" : ` · ${wagon.productBrand}`}`,
    ]),
  );
  for (const wagon of saved) {
    if (!labels.has(wagon.id)) labels.set(wagon.id, wagon.number ?? wagon.id);
  }

  return (
    <select
      aria-label={ariaLabel}
      className="refractory-wagon-multi-select"
      defaultValue={saved.map((wagon) => wagon.id)}
      multiple
      name={name}
      size={3}
    >
      {Array.from(labels, ([id, label]) => (
        <option key={id} value={id}>{label}</option>
      ))}
    </select>
  );
}

function FiringForm({
  defaultReportDate = "",
  loadWagons = false,
  payload,
}: {
  defaultReportDate?: string;
  loadWagons?: boolean;
  payload?: RefractoryFiringPayload;
}) {
  const [rowCount, setRowCount] = useState(
    Math.max(1, payload?.rows.length ?? 1),
  );
  const [summary, setSummary] = useState(() =>
    summarizeFiringRows(payload?.rows ?? []),
  );
  const [wagonOptions, setWagonOptions] = useState<RefractoryWagonRecord[]>([]);
  const [wagonLoadState, setWagonLoadState] = useState<
    "idle" | "loading" | "ready" | "error"
  >(loadWagons ? "loading" : "idle");

  useEffect(() => {
    if (!loadWagons) return;
    const controller = new AbortController();
    setWagonLoadState("loading");
    requestRefractoryWagons({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ready") {
        // Один номер вагона может встречаться в нескольких циклах истории;
        // для обжига/сортировки предлагаем только текущий.
        setWagonOptions(selectLatestWagonCycles(result.wagons));
        setWagonLoadState("ready");
      } else {
        setWagonLoadState("error");
      }
    });
    return () => controller.abort();
  }, [loadWagons]);

  return (
    <div className="refractory-form-sections">
      <ReportSection title="Выпуск обожжённых огнеупоров">
        <div className="refractory-table-wrap refractory-table-wrap-full-height">
          <table className="refractory-input-table refractory-input-table-firing">
            <thead>
              <tr>
                <th>Дата обжига</th>
                <th>Обжигальщик</th>
                <th>Рассортированные вагоны</th>
                <th>Дата сортировки</th>
                <th>Сортировщик</th>
                {firingColumns.map(([, label]) => (
                  <th key={label}>{label}</th>
                ))}
                <th>Примечание</th>
              </tr>
            </thead>
            <tbody
              onInput={(event) =>
                setSummary(
                  summarizeFiringTable(event.currentTarget.closest("table")),
                )
              }
            >
              {Array.from({ length: rowCount }, (_, index) => {
                const row = payload?.rows[index];
                return (
                  <tr key={index}>
                    <td>
                      <input
                        aria-label={`Дата обжига, строка ${index + 1}`}
                        data-refractory-label={`Дата обжига, строка ${index + 1}`}
                        name={`firing.${index}.firingDate`}
                        type="date"
                        defaultValue={row?.firingDate ?? defaultReportDate}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Обжигальщик, строка ${index + 1}`}
                        data-refractory-label={`Обжигальщик, строка ${index + 1}`}
                        list="refractory-firing-operator-options"
                        maxLength={120}
                        name={`firing.${index}.firingOperator`}
                        defaultValue={row?.firingOperator ?? ""}
                      />
                    </td>
                    <td>
                      <FiringWagonMultiSelect
                        ariaLabel={`Рассортированные вагоны, строка ${index + 1}`}
                        name={`firing.${index}.sortingWagons`}
                        options={wagonOptions}
                        saved={row?.sortingWagons}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Дата сортировки, строка ${index + 1}`}
                        data-refractory-label={`Дата сортировки, строка ${index + 1}`}
                        name={`firing.${index}.sortingDate`}
                        type="date"
                        defaultValue={row?.sortingDate ?? defaultReportDate}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Сортировщик, строка ${index + 1}`}
                        data-refractory-label={`Сортировщик, строка ${index + 1}`}
                        list="refractory-sorter-options"
                        maxLength={120}
                        name={`firing.${index}.sorter`}
                        defaultValue={row?.sorter ?? ""}
                      />
                    </td>
                    {firingColumns.map(([field, label, kind]) => (
                      <td
                        className={
                          kind === "calculated"
                            ? "refractory-calculated"
                            : undefined
                        }
                        key={field}
                      >
                        {kind === "calculated" ? (
                          <output aria-label={`Брак всего, строка ${index + 1}`}>
                            {formatTableTotal(summary.rejectByRow[index] ?? 0)}
                          </output>
                        ) : (
                          <RefractoryNumberInput
                            aria-label={`${label}, строка ${index + 1}`}
                            integer={kind === "integer"}
                            name={`firing.${index}.${field}`}
                            defaultValue={row?.[field] ?? ""}
                          />
                        )}
                      </td>
                    ))}
                    <td>
                      <input
                        aria-label={`Примечание, строка ${index + 1}`}
                        data-refractory-label={`Примечание, строка ${index + 1}`}
                        maxLength={2000}
                        name={`firing.${index}.note`}
                        defaultValue={row?.note ?? ""}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>ИТОГО:</th>
                <td />
                <td />
                <td />
                <td />
                {firingColumns.map(([field, label]) => (
                  <td className="refractory-calculated" key={field}>
                    <output aria-label={`Итого: ${label}`}>
                      {formatTableTotal(summary[field])}
                    </output>
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <datalist id="refractory-firing-operator-options">
          {collectWagonCrewOptions(wagonOptions, (wagon) => wagon.firingOperator)
            .map((value) => <option key={value} value={value} />)}
        </datalist>
        <datalist id="refractory-sorter-options">
          {collectWagonCrewOptions(wagonOptions, (wagon) => wagon.sorter)
            .map((value) => <option key={value} value={value} />)}
        </datalist>
        {wagonLoadState === "loading" ? (
          <p className="form-status">Загружаем вагоны для отчёта.</p>
        ) : wagonLoadState === "error" ? (
          <p className="form-status form-status-error">
            Не удалось загрузить журнал оборота вагонов. Обновите страницу перед выбором.
          </p>
        ) : null}
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
            label="Время прогонки, час(а)"
            value={payload?.calcinationHours}
            max={24}
          />
          <NumberField
            name="sorterCount"
            label="Присутствуют на смене, сортировщиков"
            value={payload?.sorterCount}
            integer
            max={1000}
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
      decision === "approve" ? "success" : "warning",
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
                {rejectingId === report.id ? null : (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={busyId.length > 0}
                    onClick={() => void decide(report, "approve")}
                  >
                    Подтвердить
                  </button>
                )}
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
          <CoshForm payload={report.payload} isLocked />
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
  bunkerFillTons: "Заполнение ж/д бункеров, т",
  chamotteSupplyTons: "Подача шамота, т",
  baggingTons: "Затарка в мешки, т",
  scrapRemovalTons: "Вывоз недопала, т",
  formedActualPieces: "Формованные, шт.",
  formedActualTons: "Формованные, т",
  formedWorkedHours: "Отработано, ч",
  formedDowntimeHours: "Простой всего, ч",
  unformedActualContainers: "Неформованные, контейнеры",
  unformedActualTons: "Неформованные, т",
  quantityPieces: "Кол-во, шт.",
  palletCount: "Кол-во, поддонов",
  goodTonsAverageWeight: "Годная по среднему весу, т",
  goodTonsWeighed: "Годная по взвешиванию, т",
  rejectTotalPieces: "Брак всего, шт.",
  rejectUnderburnPieces: "Недожог, шт.",
  rejectCracksPieces: "Трещины, шт.",
  rejectFusionPieces: "Выплавка, шт.",
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
      <input
        aria-label={label}
        data-refractory-label={label}
        name={name}
        defaultValue={value ?? ""}
        maxLength={120}
      />
    </label>
  );
}

function NumberField({
  name,
  label,
  value,
  integer = false,
  max,
}: {
  name: string;
  label: string;
  value?: number;
  integer?: boolean;
  max?: number;
}) {
  return (
    <label className="refractory-field">
      <span>{label}</span>
      <RefractoryNumberInput
        aria-label={label}
        integer={integer}
        max={max}
        name={name}
        defaultValue={value ?? ""}
      />
    </label>
  );
}

function RefractoryNumberInput({
  "aria-label": ariaLabel,
  defaultValue,
  integer = false,
  isRefractoryRowQuantity = false,
  max,
  name,
}: {
  "aria-label": string;
  defaultValue: string | number;
  integer?: boolean;
  isRefractoryRowQuantity?: boolean;
  max?: number;
  name: string;
}) {
  return (
    <input
      aria-label={ariaLabel}
      data-refractory-label={ariaLabel}
      data-refractory-max={max}
      data-refractory-number={integer ? "integer" : "decimal"}
      data-refractory-row-quantity={
        isRefractoryRowQuantity ? "true" : undefined
      }
      defaultValue={defaultValue}
      inputMode={integer ? "numeric" : "decimal"}
      maxLength={20}
      name={name}
      pattern={integer ? integerInputPattern : decimalNumberInputPattern}
      title={integer ? integerInputTitle : decimalNumberInputTitle}
      type="text"
      onChange={(event) => {
        event.currentTarget.value = integer
          ? normalizeIntegerInput(event.currentTarget.value)
          : normalizeDecimalNumberInput(event.currentTarget.value);
        clearRefractoryFieldError(event.currentTarget);
      }}
    />
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
      <input
        aria-label={label}
        data-refractory-label={label}
        type="time"
        name={name}
        defaultValue={value ?? ""}
      />
    </label>
  );
}

function NamedQuantityRows({
  identities,
  identityLabel,
  identityLabels,
  prefix,
  productLabel = "Наименование",
  quantityLabel = "Количество, т",
  rows = [],
}: {
  identities: readonly string[];
  identityLabel: string;
  identityLabels?: Record<string, string>;
  prefix: string;
  productLabel?: string;
  quantityLabel?: string;
  rows?: Array<{ identity: string; productName?: string; quantity?: number }>;
}) {
  return (
    <div className="refractory-mini-table">
      {identities.map((identity) => {
        const row = rows.find((item) => item.identity === identity);
        const identityText =
          identityLabels?.[identity] ??
          (identity === "street" ? "с улицы" : identity);
        return (
          <div
            className="refractory-mini-row refractory-mini-row-quantity"
            key={identity}
          >
            <strong>
              {identityLabel.length > 0
                ? `${identityLabel} ${identityText}`
                : identityText}
            </strong>
            <Field
              name={`${prefix}.${identity}.productName`}
              label={productLabel}
              value={row?.productName}
            />
            <NumberField
              name={`${prefix}.${identity}.quantity`}
              label={quantityLabel}
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
  const chamotteOutputRows = Array.from({ length: 50 }, (_, index) =>
    compact({
      productBrand: optionalText(
        data,
        `chamotteOutputRows.${index}.productBrand`,
      ),
      quantityTons: first(
        optionalNumber(data, `chamotteOutputRows.${index}.quantityTons`),
      ),
    }),
  ).flatMap((row, index) => {
    if (Object.keys(row).length === 0) return [];
    if (typeof row.productBrand !== "string") {
      throw new Error(`Укажите марку выпуска шамота в строке ${index + 1}.`);
    }
    if (typeof row.quantityTons !== "number") {
      throw new Error(`Укажите выпуск шамота в строке ${index + 1}.`);
    }
    return [row as NonNullable<
      RefractoryCoshPayload["chamotteOutputRows"]
    >[number]];
  });
  const jarMeasurements = ([1, 2, 3] as const).flatMap((jarNumber) => {
    const prefix = `jar.${jarNumber}.`;
    const values = Array.from(data.entries())
      .flatMap(([name, rawValue]) => {
        if (!name.startsWith(prefix) || typeof rawValue !== "string") return [];
        const index = Number(name.slice(prefix.length));
        const value = rawValue.trim().replace(",", ".");
        return Number.isSafeInteger(index) && value.length > 0
          ? [{ index, value: Number(value) }]
          : [];
      })
      .filter((item) => Number.isFinite(item.value))
      .sort((left, right) => left.index - right.index)
      .map((item) => item.value);
    return values.length === 0 ? [] : [{ jarNumber, values }];
  });
  return compact({
    kilnNumber: optionalText(data, "kilnNumber"),
    chamotteOutputRows,
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

/** Прошлые бригады подсказываются из уже сохранённых вагонов. */
function collectWagonCrewOptions(
  wagons: RefractoryWagonRecord[],
  read: (wagon: RefractoryWagonRecord) => string | null,
) {
  return [...new Set(wagons.flatMap((wagon) => {
    const value = read(wagon);
    return value === null ? [] : [value];
  }))].sort((first, second) => first.localeCompare(second, "ru"));
}

function buildFiringPayload(data: FormData): RefractoryFiringPayload {
  const rows = Array.from({ length: 50 }, (_, index) =>
    compact({
      firingDate: optionalText(data, `firing.${index}.firingDate`),
      firingOperator: optionalText(data, `firing.${index}.firingOperator`),
      sortingWagons: optionalWagonReferences(
        data,
        `firing.${index}.sortingWagons`,
      ),
      sortingDate: optionalText(data, `firing.${index}.sortingDate`),
      sorter: optionalText(data, `firing.${index}.sorter`),
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
    if (!Array.isArray(row.sortingWagons) || row.sortingWagons.length === 0) {
      throw new Error(`Выберите вагоны в строке печного отделения ${index + 1}.`);
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

function optionalWagonReferences(data: FormData, fieldName: string) {
  const references = data.getAll(fieldName).flatMap((value) => {
    if (typeof value !== "string" || value.trim().length === 0) return [];
    return [{ id: value.trim() }];
  });
  return references.length === 0 ? undefined : references;
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
