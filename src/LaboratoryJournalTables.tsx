import {
  laboratoryChemicalAnalysisFields,
  laboratorySampleRegistrationFields,
  type LaboratoryChemicalAnalysisJournalRecord,
  type LaboratorySampleRegistrationJournalRecord,
  type RotaryKiln2FiringJournalRecord,
} from "./contracts";
import { formatLaboratoryDate } from "./LaboratoryResultsTable";

/**
 * Read-only tables of the laboratory journals. The laboratory assistant tab and
 * the management review tab share them, so a journal keeps one column layout.
 */

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
}: {
  records: LaboratorySampleRegistrationJournalRecord[];
}) {
  if (records.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll">
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
                  {field.kind === "date"
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
}: {
  records: LaboratoryChemicalAnalysisJournalRecord[];
}) {
  if (records.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll">
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
              <td>{record.laboratorySampleCode}</td>
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

export function RotaryKiln2FiringTable({
  records,
}: {
  records: RotaryKiln2FiringJournalRecord[];
}) {
  if (records.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll">
      <table className="data-table laboratory-results-table rotary-kiln-journal-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Время</th>
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
