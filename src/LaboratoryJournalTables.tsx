import {
  laboratoryChemicalAnalysisFields,
  laboratorySampleRegistrationFields,
  laboratoryUnshapedProductSampleFields,
  laboratoryUnshapedProductSampleSuitabilityLabels,
  type LaboratoryChemicalAnalysisJournalRecord,
  type LaboratorySampleRegistrationJournalRecord,
  type LaboratoryUnshapedProductSampleRecord,
  type RotaryKiln2FiringJournalRecord,
} from "./contracts";
import { formatLaboratoryDate } from "./LaboratoryResultsTable";

/**
 * Read-only tables of the laboratory journals. The laboratory assistant tab and
 * the management review tab share them, so a journal keeps one column layout.
 */

/**
 * These four journals belong to the central plant laboratory, so both tabs hide
 * them behind one group button instead of listing them next to the control
 * sections.
 */
export const centralLabTabLabel = "ЦЗЛ (Центральная заводская лаборатория)";

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
      <table className="data-table laboratory-results-table sample-registration-journal-table">
        <thead>
          <tr>
            {laboratorySampleRegistrationFields.map((field) => (
              <th key={field.id}>{field.label}</th>
            ))}
            {laboratoryChemicalAnalysisFields.map((field) => (
              <th key={field.id}>{field.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              {laboratorySampleRegistrationFields.map((field) => (
                <td key={field.id}>
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
                    : field.kind === "date"
                      ? formatLaboratoryDate(record[field.id])
                      : record[field.id]}
                </td>
              ))}
              {laboratoryChemicalAnalysisFields.map((field) => {
                const value = record[field.id];
                return (
                  <td key={field.id}>
                    {value === undefined
                      ? "—"
                      : field.kind === "date"
                        ? formatLaboratoryDate(value)
                        : value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
      <table className="data-table laboratory-results-table chemical-analysis-journal-table">
        <thead>
          <tr>
            <th>Код лабораторной пробы</th>
            <th>№ пробы</th>
            <th>Наименование пробы</th>
            {laboratoryChemicalAnalysisFields.map((field) => (
              <th key={field.id}>{field.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>
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
              </td>
              <td>{record.sampleNumber}</td>
              <td>{record.sampleName}</td>
              {laboratoryChemicalAnalysisFields.map((field) => {
                const value = record[field.id];
                return (
                  <td key={field.id}>
                    {value === undefined
                      ? "—"
                      : field.kind === "date"
                        ? formatLaboratoryDate(value)
                        : value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
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

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <table className="data-table laboratory-results-table unshaped-product-sample-table">
        <thead>
          <tr>
            {laboratoryUnshapedProductSampleFields.map((field) => (
              <th key={field.id}>{field.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              className={`unshaped-product-sample-suitability-${record.suitability}`}
              key={record.id}
            >
              {laboratoryUnshapedProductSampleFields.map((field) => {
                const value = record[field.id];
                return (
                  <td key={field.id}>
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
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
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
      <table className="data-table laboratory-results-table rotary-kiln-journal-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Время</th>
            <th>{rotaryKiln2ProducedMaterialLabel}</th>
            {rotaryKiln2EarlyNumericFields.map(([field, label]) => (
              <th key={field}>{label}</th>
            ))}
            <th>Мастер смены</th>
            <th>Обжигальщик</th>
            <th>Лаборант</th>
            {rotaryKiln2LateNumericFields.map(([field, label]) => (
              <th key={field}>{label}</th>
            ))}
            <th>Примечание</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{formatLaboratoryDate(record.recordDate)}</td>
              <td>{record.recordTime}</td>
              <td>
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
              </td>
              {rotaryKiln2EarlyNumericFields.map(([field]) => (
                <td key={field}>{formatLaboratoryNumber(record[field])}</td>
              ))}
              <td>{record.shiftSupervisor}</td>
              <td>{record.burnerOperator}</td>
              <td>{record.laboratoryAssistant}</td>
              {rotaryKiln2LateNumericFields.map(([field]) => (
                <td key={field}>{formatLaboratoryNumber(record[field])}</td>
              ))}
              <td>{record.note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatLaboratoryNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 4,
  }).format(value);
}
