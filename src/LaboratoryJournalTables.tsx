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
}: {
  records: LaboratoryUnshapedProductSampleRecord[];
  onEditRecord?: (record: LaboratoryUnshapedProductSampleRecord) => void;
}) {
  if (records.length === 0) {
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
}: {
  records: LaboratoryFormedProductSampleRecord[];
  onEditRecord?: (record: LaboratoryFormedProductSampleRecord) => void;
}) {
  if (records.length === 0) {
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
}: {
  records: LaboratoryVerificationRecord[];
  onEditRecord?: (record: LaboratoryVerificationRecord) => void;
}) {
  if (records.length === 0) {
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
}: {
  records: LaboratoryRawMaterialQualityRecord[];
  onEditRecord?: (record: LaboratoryRawMaterialQualityRecord) => void;
}) {
  const [expandedRecordId, setExpandedRecordId] = useState<string>();

  if (records.length === 0) {
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
            <TableHeader>Замеры</TableHeader>
          </tr>
        </thead>
        <tbody>
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
                    <TableCell colSpan={5}>
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
}: {
  records: LaboratoryGreenProductQualityRecord[];
  onEditRecord?: (record: LaboratoryGreenProductQualityRecord) => void;
}) {
  const [expandedRecordId, setExpandedRecordId] = useState<string>();

  if (records.length === 0) {
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
            <TableHeader>Замеры</TableHeader>
          </tr>
        </thead>
        <tbody>
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
                    <TableCell colSpan={laboratoryGreenProductQualityGeneralFields.length + 1}>
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
