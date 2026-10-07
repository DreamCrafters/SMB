import type { TableColumnId } from "../server/src/contracts/tableLayouts";
import { ManagedTable } from "./ManagedTable";
import { TableHeader, TableCell } from "./TableCell";
import { Fragment, useState } from "react";
import {
  laboratoryChemicalAnalysisFields,
  laboratorySampleRegistrationFields,
  laboratorySampleRegistrationTransmissionTargetLabels,
  laboratoryUnshapedProductSampleFields,
  laboratoryUnshapedProductSampleSuitabilityLabels,
  laboratoryFormedProductSampleFields,
  laboratoryVerificationFields,
  laboratoryClayMeasurementFields,
  laboratoryRawMaterialQualityRecommendationRecipientLabels,
  laboratoryRawMaterialQualityShiftLabels,
  laboratoryRawMaterialQualitySummaryFields,
  laboratoryRunnerMeasurementFields,
  laboratorySlipMeasurementFields,
  laboratoryTemperMeasurementFields,
  laboratoryGreenProductQualityGeneralFields,
  laboratoryGreenProductQualityMeasurementFields,
  laboratoryGreenProductQualitySummaryFields,
  type LaboratoryChemicalAnalysisJournalRecord,
  type LaboratoryChemicalAnalysisValues,
  type LaboratoryRawMaterialQualityRecord,
  type LaboratoryGreenProductQualityRecord,
  type LaboratoryFormedProductSampleRecord,
  type LaboratorySampleRegistrationJournalRecord,
  type LaboratorySampleRegistrationTransmissionOption,
  type LaboratoryUnshapedProductSampleRecord,
  type LaboratoryVerificationRecord,
  type RotaryKiln2FiringJournalRecord,
} from "./contracts";
import { formatLaboratoryDate } from "./LaboratoryResultsTable";

/**
 * Read-only tables of the laboratory journals. The laboratory assistant tab and
 * the management review tab share them, so a journal keeps one column layout.
 */

/**
 * Shared labels keep the laboratory assistant and management review group
 * buttons identical.
 */
export const centralLabTabLabel = "ЦЗЛ (Центральная заводская лаборатория)";
export const qualityControlTabLabel = "ОТК";
export const refractoryShopTabLabel = "ОЦ (Огнеупорный цех)";

/**
 * Материал стоит сразу после времени: по нему считается насыпной вес банок.
 */
export const rotaryKiln2ProducedMaterialLabel = "Производимый материал";

export const rotaryKiln2EarlyNumericFields = [
  ["waterAbsorption", "Водопоглощение"],
  ["temperatureBeforeCyclone", "t перед циклоном"],
  ["temperatureBeforeFilter", "t перед фильтром"],
  ["temperatureInFieldChamber", "t в полевой камере"],
  ["temperatureAtRollback", "t на откатной"],
  ["gasConsumptionPerHour", "Расход газа в час"],
  ["vacuum", "Разряжение"],
  ["pressure", "Давление"],
] as const;

export const rotaryKiln2LateNumericFields = [
  ["sievePass05", "Проход ч/з сито 0,5"],
  ["bulkDensity", "Насыпной вес"],
  ["kilnLoadBucketsPerHour", "Загрузка печи в ковшах в час"],
] as const;

export function LaboratorySampleRegistrationTable({
  records,
  onEditRecord,
}: {
  records: LaboratorySampleRegistrationJournalRecord[];
  onEditRecord?: (record: LaboratorySampleRegistrationJournalRecord) => void;
}) {
  if (records.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <ManagedTable tableId="laboratory.samples" className="data-table laboratory-results-table sample-registration-journal-table">
        <thead>
          <tr>
            {laboratorySampleRegistrationFields.map((field) => (
              <TableHeader key={field.id}>{field.label}</TableHeader>
            ))}
            <SampleChemicalAnalysisHeaders />
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              className={record.laboratoryAnalysisNumber === undefined ||
                  record.laboratoryAnalysisNumber === ""
                ? undefined
                : "sample-registration-row-has-chemical-analysis"}
              key={record.id}
            >
              {laboratorySampleRegistrationFields.map((field) => (
                <TableCell key={field.id}>
                  {field.id === "laboratorySampleCode" &&
                      onEditRecord !== undefined
                    ? (
                        <button
                          className="board-assignment-link sample-registration-edit-link"
                          type="button"
                          onClick={() => onEditRecord(record)}
                        >
                          {record.laboratorySampleCode}
                        </button>
                      )
                    : record[field.id] === undefined
                    ? "—"
                    : field.id === "transmitToJournal"
                      ? laboratorySampleRegistrationTransmissionTargetLabels[
                          record.transmitToJournal!
                        ]
                      : field.kind === "date"
                        ? formatLaboratoryDate(record[field.id])
                        : record[field.id]}
                </TableCell>
              ))}
              <SampleChemicalAnalysisCells values={record} />
            </tr>
          ))}
        </tbody>
      </ManagedTable>
    </div>
  );
}

function SampleChemicalAnalysisHeaders() {
  return laboratoryChemicalAnalysisFields.map((field) => (
    <TableHeader key={field.id}>
      {field.id === "laboratoryAnalysisNumber" ? "№ Хим анализа" : field.label}
    </TableHeader>
  ));
}

function SampleChemicalAnalysisCells({
  values,
}: {
  values?: LaboratoryChemicalAnalysisValues;
}) {
  return laboratoryChemicalAnalysisFields.map((field) => {
    const value = values?.[field.id];
    return (
      <TableCell key={field.id}>
        {value === undefined
          ? "—"
          : field.kind === "date"
            ? formatLaboratoryDate(value)
            : value}
      </TableCell>
    );
  });
}

type PendingTransmissionRowsProps = {
  pendingTransmissions?: LaboratorySampleRegistrationTransmissionOption[];
  onFillPendingTransmission?: (
    option: LaboratorySampleRegistrationTransmissionOption,
  ) => void;
};

/**
 * Задача 132: проба, помеченная в `Регистрации проб` для этого журнала, видна
 * в его истории сразу, отдельной строкой над сохранёнными записями. Строка
 * показывает известные из регистрации поля; у лаборанта код пробы открывает
 * форму, предзаполненную этой пробой, у руководителя строка read-only.
 */
function PendingTransmissionCode({
  option,
  onFill,
}: {
  option: LaboratorySampleRegistrationTransmissionOption;
  onFill: PendingTransmissionRowsProps["onFillPendingTransmission"];
}) {
  const code = option.laboratorySampleCode || "—";
  return (
    <>
      {onFill === undefined
        ? code
        : (
            <button
              className="board-assignment-link laboratory-pending-transmission-link"
              type="button"
              onClick={() => onFill(option)}
            >
              {code}
            </button>
          )}
      <span className="laboratory-pending-transmission-badge">
        {readPendingTransmissionStatus(option)}
      </span>
    </>
  );
}

/**
 * Строка-ожидание означает незаполненную запись этого журнала, а не отсутствие
 * анализа: если химанализ пробы уже внесён в ЦЗЛ, подпись говорит об этом,
 * чтобы проведённый анализ не выглядел невыполненным.
 */
export function readPendingTransmissionStatus(
  option: LaboratorySampleRegistrationTransmissionOption,
) {
  return option.chemicalAnalysis === undefined
    ? "Ожидает анализа и заполнения"
    : "Анализ проведён, запись не заполнена";
}

function formatPendingTransmissionValue(
  value: string | undefined,
  kind: string,
) {
  if (value === undefined || value === "") return "—";
  return kind === "date" ? formatLaboratoryDate(value) : value;
}

export function LaboratoryChemicalAnalysisTable({
  records,
  onEditRecord,
}: {
  records: LaboratoryChemicalAnalysisJournalRecord[];
  onEditRecord?: (record: LaboratoryChemicalAnalysisJournalRecord) => void;
}) {
  if (records.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <ManagedTable tableId="laboratory.analyses" className="data-table laboratory-results-table chemical-analysis-journal-table">
        <thead>
          <tr>
            <TableHeader>Код лабораторной пробы</TableHeader>
            <TableHeader>№ пробы</TableHeader>
            <TableHeader>Наименование пробы</TableHeader>
            {laboratoryChemicalAnalysisFields.map((field) => (
              <TableHeader key={field.id}>{field.label}</TableHeader>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <TableCell>
                {onEditRecord === undefined
                  ? record.laboratorySampleCode
                  : (
                      <button
                        className="board-assignment-link chemical-analysis-edit-link"
                        type="button"
                        onClick={() => onEditRecord(record)}
                      >
                        {record.laboratorySampleCode}
                      </button>
                    )}
              </TableCell>
              <TableCell>{record.sampleNumber}</TableCell>
              <TableCell>{record.sampleName}</TableCell>
              {laboratoryChemicalAnalysisFields.map((field) => {
                const value = record[field.id];
                return (
                  <TableCell key={field.id}>
                    {value === undefined
                      ? "—"
                      : field.kind === "date"
                        ? formatLaboratoryDate(value)
                        : value}
                  </TableCell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </ManagedTable>
    </div>
  );
}

export function LaboratoryUnshapedProductSampleTable({
  records,
  onEditRecord,
  pendingTransmissions = [],
  onFillPendingTransmission,
}: {
  records: LaboratoryUnshapedProductSampleRecord[];
  onEditRecord?: (record: LaboratoryUnshapedProductSampleRecord) => void;
} & PendingTransmissionRowsProps) {
  if (records.length === 0 && pendingTransmissions.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  const sampleFields = laboratoryUnshapedProductSampleFields.filter(
    (field) => field.id !== "chemicalAnalysisNumber",
  );

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <ManagedTable tableId="laboratory.unshaped" className="data-table laboratory-results-table unshaped-product-sample-table">
        <thead>
          <tr>
            {sampleFields.map((field) => (
              <TableHeader key={field.id}>{field.label}</TableHeader>
            ))}
            <SampleChemicalAnalysisHeaders />
          </tr>
        </thead>
        <tbody>
          {pendingTransmissions.map((option) => {
            const values: Partial<Record<(typeof sampleFields)[number]["id"], string>> = {
              sampleNumber: option.sampleNumber,
              sampleDate: option.samplingDate,
              sampledBy: option.samplingLaboratoryAssistant,
              productName: option.sampleName,
            };
            return (
              <tr
                className="laboratory-pending-transmission-row"
                key={`pending:${option.id}`}
              >
                {sampleFields.map((field) => (
                  <TableCell key={field.id}>
                    {field.id === "sampleCode"
                      ? (
                          <PendingTransmissionCode
                            option={option}
                            onFill={onFillPendingTransmission}
                          />
                        )
                      : formatPendingTransmissionValue(
                          values[field.id],
                          field.kind,
                        )}
                  </TableCell>
                ))}
                <SampleChemicalAnalysisCells values={option.chemicalAnalysis} />
              </tr>
            );
          })}
          {records.map((record) => (
            <tr
              className={`unshaped-product-sample-suitability-${record.suitability}`}
              key={record.id}
            >
              {sampleFields.map((field) => {
                const value = record[field.id];
                return (
                  <TableCell key={field.id}>
                    {field.id === "sampleCode" && onEditRecord !== undefined
                      ? (
                          <button
                            className="board-assignment-link unshaped-product-sample-edit-link"
                            type="button"
                            onClick={() => onEditRecord(record)}
                          >
                            {record.sampleCode}
                          </button>
                        )
                      : field.id === "suitability"
                        ? laboratoryUnshapedProductSampleSuitabilityLabels[
                            record.suitability
                          ]
                        : value === undefined
                          ? "—"
                          : field.kind === "date"
                            ? formatLaboratoryDate(value)
                            : value}
                  </TableCell>
                );
              })}
              <SampleChemicalAnalysisCells
                values={record.chemicalAnalysis ?? {
                  laboratoryAnalysisNumber: record.chemicalAnalysisNumber,
                }}
              />
            </tr>
          ))}
        </tbody>
      </ManagedTable>
    </div>
  );
}

export function LaboratoryFormedProductSampleTable({
  records,
  onEditRecord,
  pendingTransmissions = [],
  onFillPendingTransmission,
}: {
  records: LaboratoryFormedProductSampleRecord[];
  onEditRecord?: (record: LaboratoryFormedProductSampleRecord) => void;
} & PendingTransmissionRowsProps) {
  if (records.length === 0 && pendingTransmissions.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <ManagedTable tableId="laboratory.formed" className="data-table laboratory-results-table formed-product-sample-table">
        <thead>
          <tr>
            {laboratoryFormedProductSampleFields.map((field) => (
              <TableHeader key={field.id}>{field.label}</TableHeader>
            ))}
            <SampleChemicalAnalysisHeaders />
          </tr>
        </thead>
        <tbody>
          {pendingTransmissions.map((option) => {
            const values: Partial<Record<
              (typeof laboratoryFormedProductSampleFields)[number]["id"],
              string
            >> = {
              sortingDate: option.samplingDate,
              productBrand: option.sampleName,
            };
            return (
              <tr
                className="laboratory-pending-transmission-row"
                key={`pending:${option.id}`}
              >
                {laboratoryFormedProductSampleFields.map((field) => (
                  <TableCell key={field.id}>
                    {field.id === "sampleCode"
                      ? (
                          <PendingTransmissionCode
                            option={option}
                            onFill={onFillPendingTransmission}
                          />
                        )
                      : formatPendingTransmissionValue(
                          values[field.id],
                          field.kind,
                        )}
                  </TableCell>
                ))}
                <SampleChemicalAnalysisCells values={option.chemicalAnalysis} />
              </tr>
            );
          })}
          {records.map((record) => {
            const editLinkField = record.wagonNumber !== null
              ? "wagonNumber"
              : "sampleCode";
            return (
              <tr key={record.id}>
                {laboratoryFormedProductSampleFields.map((field) => {
                  const value = record[field.id];
                  return (
                    <TableCell key={field.id}>
                      {field.id === editLinkField && onEditRecord !== undefined
                        ? (
                            <button
                              className="board-assignment-link formed-product-sample-edit-link"
                              type="button"
                              onClick={() => onEditRecord(record)}
                            >
                              {value ?? "—"}
                            </button>
                          )
                        : value === null
                          ? "—"
                          : field.kind === "date"
                            ? formatLaboratoryDate(value)
                            : value}
                    </TableCell>
                  );
                })}
                <SampleChemicalAnalysisCells values={record.chemicalAnalysis} />
              </tr>
            );
          })}
        </tbody>
      </ManagedTable>
    </div>
  );
}

export function LaboratoryVerificationTable({
  records,
  onEditRecord,
  pendingTransmissions = [],
  onFillPendingTransmission,
}: {
  records: LaboratoryVerificationRecord[];
  onEditRecord?: (record: LaboratoryVerificationRecord) => void;
} & PendingTransmissionRowsProps) {
  if (records.length === 0 && pendingTransmissions.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <ManagedTable tableId="laboratory.verification" className="data-table laboratory-results-table verification-table">
        <thead>
          <tr>
            {laboratoryVerificationFields.map((field) => (
              <TableHeader key={field.id}>{field.label}</TableHeader>
            ))}
            <SampleChemicalAnalysisHeaders />
          </tr>
        </thead>
        <tbody>
          {pendingTransmissions.map((option) => {
            const values: Partial<Record<
              (typeof laboratoryVerificationFields)[number]["id"],
              string
            >> = {
              verificationDate: option.samplingDate,
              productName: option.sampleName,
              samplingLocation: option.samplingLocation,
            };
            return (
              <tr
                className="laboratory-pending-transmission-row"
                key={`pending:${option.id}`}
              >
                {laboratoryVerificationFields.map((field) => (
                  <TableCell key={field.id}>
                    {field.id === "sampleCode"
                      ? (
                          <PendingTransmissionCode
                            option={option}
                            onFill={onFillPendingTransmission}
                          />
                        )
                      : formatPendingTransmissionValue(
                          values[field.id],
                          field.kind,
                        )}
                  </TableCell>
                ))}
                <SampleChemicalAnalysisCells values={option.chemicalAnalysis} />
              </tr>
            );
          })}
          {records.map((record) => (
            <tr key={record.id}>
              {laboratoryVerificationFields.map((field) => (
                <TableCell key={field.id}>
                  {field.id === "sampleCode" && onEditRecord !== undefined
                    ? (
                        <button
                          className="board-assignment-link verification-edit-link"
                          type="button"
                          onClick={() => onEditRecord(record)}
                        >
                          {record.sampleCode}
                        </button>
                      )
                    : field.kind === "date"
                      ? formatLaboratoryDate(record[field.id])
                      : record[field.id]}
                </TableCell>
              ))}
              <SampleChemicalAnalysisCells values={record.chemicalAnalysis} />
            </tr>
          ))}
        </tbody>
      </ManagedTable>
    </div>
  );
}

export function LaboratoryRawMaterialQualityTable({
  records,
  onEditRecord,
  pendingTransmissions = [],
  onFillPendingTransmission,
}: {
  records: LaboratoryRawMaterialQualityRecord[];
  onEditRecord?: (record: LaboratoryRawMaterialQualityRecord) => void;
} & PendingTransmissionRowsProps) {
  const [expandedRecordId, setExpandedRecordId] = useState<string>();

  if (records.length === 0 && pendingTransmissions.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <ManagedTable tableId="laboratory.rawQuality" className="data-table laboratory-results-table raw-material-quality-table">
        <thead>
          <tr>
            <TableHeader>Дата</TableHeader>
            <TableHeader>Лаборант</TableHeader>
            <TableHeader>Мастер смены</TableHeader>
            <TableHeader>Смена</TableHeader>
            <TableHeader>Код пробы</TableHeader>
            <SampleChemicalAnalysisHeaders />
            <TableHeader>Замеры</TableHeader>
          </tr>
        </thead>
        <tbody>
          {pendingTransmissions.map((option) => (
            <tr
              className="laboratory-pending-transmission-row"
              key={`pending:${option.id}`}
            >
              <TableCell>
                {formatPendingTransmissionValue(option.samplingDate, "date")}
              </TableCell>
              <TableCell>
                {formatPendingTransmissionValue(
                  option.samplingLaboratoryAssistant,
                  "text",
                )}
              </TableCell>
              <TableCell>—</TableCell>
              <TableCell>—</TableCell>
              <TableCell>
                <PendingTransmissionCode
                  option={option}
                  onFill={onFillPendingTransmission}
                />
              </TableCell>
              <SampleChemicalAnalysisCells values={option.chemicalAnalysis} />
              <TableCell>—</TableCell>
            </tr>
          ))}
          {records.map((record) => {
            const isExpanded = expandedRecordId === record.id;
            return (
              <Fragment key={record.id}>
                <tr>
                  <TableCell>
                    {onEditRecord !== undefined ? (
                      <button
                        className="board-assignment-link raw-material-quality-edit-link"
                        type="button"
                        onClick={() => onEditRecord(record)}
                      >
                        {formatLaboratoryDate(record.recordDate)}
                      </button>
                    ) : formatLaboratoryDate(record.recordDate)}
                  </TableCell>
                  <TableCell>{record.laboratoryAssistant}</TableCell>
                  <TableCell>{record.shiftSupervisor}</TableCell>
                  <TableCell>{laboratoryRawMaterialQualityShiftLabels[record.shift]}</TableCell>
                  <TableCell>{record.sampleCode ?? "—"}</TableCell>
                  <SampleChemicalAnalysisCells values={record.chemicalAnalysis} />
                  <TableCell>
                    <button
                      aria-expanded={isExpanded}
                      className="raw-material-quality-expand-toggle"
                      type="button"
                      onClick={() => setExpandedRecordId(isExpanded ? undefined : record.id)}
                    >
                      {isExpanded ? "Свернуть" : "Показать"}
                    </button>
                  </TableCell>
                </tr>
                {isExpanded ? (
                  <tr className="raw-material-quality-expanded-row">
                    <TableCell colSpan={6 + laboratoryChemicalAnalysisFields.length}>
                      <div className="raw-material-quality-expanded">
                        <LaboratoryMeasurementTableSection
                          title="Контроль качества глины"
                          rows={record.clayMeasurements}
                          fields={laboratoryClayMeasurementFields}
                          hasCounter
                        />
                        <LaboratoryMeasurementTableSection
                          title="Отощитель"
                          rows={record.temperMeasurements}
                          fields={laboratoryTemperMeasurementFields}
                          hasCounter
                        />
                        <LaboratoryMeasurementTableSection
                          title="Шликер"
                          rows={record.slipMeasurements}
                          fields={laboratorySlipMeasurementFields}
                          hasCounter
                        />
                        <LaboratoryMeasurementTableSection
                          title="Бегуны"
                          rows={record.runnerMeasurements}
                          fields={laboratoryRunnerMeasurementFields}
                          hasCounter={false}
                        />
                        <div className="raw-material-quality-summary-readout">
                          <h4>Состав шихты</h4>
                          {laboratoryRawMaterialQualitySummaryFields.map((field) => (
                            <p key={field.id}>
                              <strong>{field.label}:</strong>{" "}
                              {field.id === "recommendationRecipient"
                                ? (record.recommendationRecipient === null
                                    ? "—"
                                    : laboratoryRawMaterialQualityRecommendationRecipientLabels[
                                        record.recommendationRecipient
                                      ])
                                : (record[field.id] ?? "—")}
                            </p>
                          ))}
                        </div>
                      </div>
                    </TableCell>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </ManagedTable>
    </div>
  );
}

/** Общая таблица замеров: используется журналами сырья и сырцовой продукции. */
function LaboratoryMeasurementTableSection<
  Field extends { id: TableColumnId<"laboratory.measurements">; label: string; kind: string },
>({
  title,
  rows,
  fields,
  hasCounter,
}: {
  title: string;
  rows: ReadonlyArray<Record<string, unknown>>;
  fields: readonly Field[];
  hasCounter: boolean;
}) {
  return (
    <div className="raw-material-quality-expanded-section">
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="laboratory-empty-note">Замеров нет.</p>
      ) : (
        <ManagedTable tableId="laboratory.measurements" columns={[...(hasCounter ? ["counter" as const] : []), ...fields.map((field) => field.id)]} className="data-table raw-material-quality-expanded-table">
          <thead>
            <tr>
              {hasCounter ? <TableHeader>№ Замера</TableHeader> : null}
              {fields.map((field) => <TableHeader key={field.id}>{field.label}</TableHeader>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {hasCounter ? <TableCell>{index + 1}</TableCell> : null}
                {fields.map((field) => (
                  <TableCell key={field.id}>
                    {formatLaboratoryMeasurementValue(field.kind, row[field.id])}
                  </TableCell>
                ))}
              </tr>
            ))}
          </tbody>
        </ManagedTable>
      )}
    </div>
  );
}

function formatLaboratoryMeasurementValue(kind: string, value: unknown) {
  if (kind === "checkbox") return value === true ? "да" : "нет";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function LaboratoryGreenProductQualityTable({
  records,
  onEditRecord,
  pendingTransmissions = [],
  onFillPendingTransmission,
}: {
  records: LaboratoryGreenProductQualityRecord[];
  onEditRecord?: (record: LaboratoryGreenProductQualityRecord) => void;
} & PendingTransmissionRowsProps) {
  const [expandedRecordId, setExpandedRecordId] = useState<string>();

  if (records.length === 0 && pendingTransmissions.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <ManagedTable tableId="laboratory.greenQuality" className="data-table laboratory-results-table green-product-quality-table">
        <thead>
          <tr>
            {laboratoryGreenProductQualityGeneralFields.map((field) => (
              <TableHeader key={field.id}>{field.label}</TableHeader>
            ))}
            <TableHeader>Код пробы</TableHeader>
            <SampleChemicalAnalysisHeaders />
            <TableHeader>Замеры</TableHeader>
          </tr>
        </thead>
        <tbody>
          {pendingTransmissions.map((option) => {
            const values: Partial<Record<
              (typeof laboratoryGreenProductQualityGeneralFields)[number]["id"],
              string
            >> = {
              recordDate: option.samplingDate,
              productBrand: option.sampleName,
            };
            return (
              <tr
                className="laboratory-pending-transmission-row"
                key={`pending:${option.id}`}
              >
                {laboratoryGreenProductQualityGeneralFields.map((field) => (
                  <TableCell key={field.id}>
                    {formatPendingTransmissionValue(
                      values[field.id],
                      field.kind,
                    )}
                  </TableCell>
                ))}
                <TableCell>
                  <PendingTransmissionCode
                    option={option}
                    onFill={onFillPendingTransmission}
                  />
                </TableCell>
                <SampleChemicalAnalysisCells values={option.chemicalAnalysis} />
                <TableCell>—</TableCell>
              </tr>
            );
          })}
          {records.map((record) => {
            const isExpanded = expandedRecordId === record.id;
            return (
              <Fragment key={record.id}>
                <tr>
                  {laboratoryGreenProductQualityGeneralFields.map((field) => {
                    const rawValue = field.id === "wagonIds"
                      ? record.wagons.map((wagon) => wagon.number).join("; ")
                      : record[field.id];
                    const value = rawValue === null
                      ? "—"
                      : field.kind === "optional_date"
                        ? formatLaboratoryDate(String(rawValue))
                        : rawValue;
                    return (
                      <TableCell key={field.id}>
                        {field.id === "recordDate" && onEditRecord !== undefined
                          ? (
                              <button
                                className="board-assignment-link green-product-quality-edit-link"
                                type="button"
                                onClick={() => onEditRecord(record)}
                              >
                                {formatLaboratoryDate(record.recordDate)}
                              </button>
                            )
                          : field.id === "recordDate"
                            ? formatLaboratoryDate(record.recordDate)
                            : value}
                      </TableCell>
                    );
                  })}
                  <TableCell>{record.sampleCode ?? "—"}</TableCell>
                  <SampleChemicalAnalysisCells values={record.chemicalAnalysis} />
                  <TableCell>
                    <button
                      aria-expanded={isExpanded}
                      className="raw-material-quality-expand-toggle"
                      type="button"
                      onClick={() => setExpandedRecordId(isExpanded ? undefined : record.id)}
                    >
                      {isExpanded ? "Свернуть" : "Показать"}
                    </button>
                  </TableCell>
                </tr>
                {isExpanded ? (
                  <tr className="raw-material-quality-expanded-row">
                    <TableCell
                      colSpan={
                        laboratoryGreenProductQualityGeneralFields.length +
                        laboratoryChemicalAnalysisFields.length +
                        2
                      }
                    >
                      <div className="raw-material-quality-expanded">
                        <LaboratoryMeasurementTableSection
                          title="Линейные размеры и показатели качества"
                          rows={record.measurements}
                          fields={laboratoryGreenProductQualityMeasurementFields}
                          hasCounter
                        />
                        <div className="raw-material-quality-summary-readout">
                          {laboratoryGreenProductQualitySummaryFields.map((field) => (
                            <p key={field.id}>
                              <strong>{field.label}:</strong>{" "}
                              {record[field.id] === "" ? "—" : record[field.id]}
                            </p>
                          ))}
                        </div>
                      </div>
                    </TableCell>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </ManagedTable>
    </div>
  );
}

export function RotaryKiln2FiringTable({
  records,
  onEditRecord,
}: {
  records: RotaryKiln2FiringJournalRecord[];
  onEditRecord?: (record: RotaryKiln2FiringJournalRecord) => void;
}) {
  if (records.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <ManagedTable tableId="laboratory.rotaryKiln" className="data-table laboratory-results-table rotary-kiln-journal-table">
        <thead>
          <tr>
            <TableHeader>Дата</TableHeader>
            <TableHeader>Время</TableHeader>
            <TableHeader>{rotaryKiln2ProducedMaterialLabel}</TableHeader>
            {rotaryKiln2EarlyNumericFields.map(([field, label]) => (
              <TableHeader key={field}>{label}</TableHeader>
            ))}
            <TableHeader>Мастер смены</TableHeader>
            <TableHeader>Обжигальщик</TableHeader>
            <TableHeader>Лаборант</TableHeader>
            {rotaryKiln2LateNumericFields.map(([field, label]) => (
              <TableHeader key={field}>{label}</TableHeader>
            ))}
            <TableHeader>Примечание</TableHeader>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <TableCell>{formatLaboratoryDate(record.recordDate)}</TableCell>
              <TableCell>{record.recordTime}</TableCell>
              <TableCell>
                {onEditRecord === undefined
                  ? record.producedMaterial ?? "—"
                  : (
                      <button
                        className="board-assignment-link rotary-kiln-edit-link"
                        type="button"
                        onClick={() => onEditRecord(record)}
                      >
                        {record.producedMaterial ?? "—"}
                      </button>
                    )}
              </TableCell>
              {rotaryKiln2EarlyNumericFields.map(([field]) => (
                <TableCell key={field}>{formatLaboratoryNumber(record[field])}</TableCell>
              ))}
              <TableCell>{record.shiftSupervisor}</TableCell>
              <TableCell>{record.burnerOperator}</TableCell>
              <TableCell>{record.laboratoryAssistant}</TableCell>
              {rotaryKiln2LateNumericFields.map(([field]) => (
                <TableCell key={field}>{formatLaboratoryNumber(record[field])}</TableCell>
              ))}
              <TableCell>{record.note ?? "—"}</TableCell>
            </tr>
          ))}
        </tbody>
      </ManagedTable>
    </div>
  );
}

export function formatLaboratoryNumber(value: number | undefined) {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 4,
  }).format(value);
}
