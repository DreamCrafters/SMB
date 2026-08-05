import {
  laboratoryChemicalAnalysisFields,
  laboratorySampleRegistrationFields,
  laboratoryUnshapedProductSampleFields,
  laboratoryUnshapedProductSampleSuitabilityLabels,
  laboratoryRawMaterialQualityFields,
  laboratoryRawMaterialQualityRecommendationRecipientLabels,
  laboratoryRawMaterialQualityShiftLabels,
  laboratoryGreenProductQualityFields,
  type LaboratoryChemicalAnalysisJournalRecord,
  type LaboratoryRawMaterialQualityRecord,
  type LaboratoryGreenProductQualityRecord,
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
      <table className="data-table laboratory-results-table sample-registration-journal-table">
        <thead>
          <tr>
            {laboratorySampleRegistrationFields.map((field) => (
              <th key={field.id}>{field.label}</th>
            ))}
            {laboratoryChemicalAnalysisFields.map((field) => (
              <th key={field.id}>
                {field.id === "laboratoryAnalysisNumber"
                  ? "№ Хим анализа"
                  : field.label}
              </th>
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

export function LaboratoryRawMaterialQualityTable({
  records,
  onEditRecord,
}: {
  records: LaboratoryRawMaterialQualityRecord[];
  onEditRecord?: (record: LaboratoryRawMaterialQualityRecord) => void;
}) {
  if (records.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <table className="data-table laboratory-results-table raw-material-quality-table">
        <thead>
          <tr>
            <th rowSpan={3}>Дата</th>
            <th rowSpan={3}>Лаборант</th>
            <th rowSpan={3}>Мастер смены</th>
            <th rowSpan={3}>Смена</th>
            <th colSpan={4}>Контроль качества глины</th>
            <th colSpan={8}>Отощитель</th>
            <th colSpan={3}>Шликер</th>
            <th colSpan={8}>Бегуны</th>
          </tr>
          <tr>
            {laboratoryRawMaterialQualityFields
              .filter((field) => field.group === "clay")
              .map((field) => <th key={field.id} rowSpan={2}>{field.label}</th>)}
            {laboratoryRawMaterialQualityFields
              .filter((field) => field.group === "temper")
              .map((field) => <th key={field.id} rowSpan={2}>{field.label}</th>)}
            {laboratoryRawMaterialQualityFields
              .filter((field) => field.group === "slip")
              .map((field) => <th key={field.id} rowSpan={2}>{field.label}</th>)}
            <th rowSpan={2}>№ бегунов</th>
            <th colSpan={7}>Состав шихты</th>
          </tr>
          <tr>
            {laboratoryRawMaterialQualityFields
              .filter((field) => field.group === "charge")
              .map((field) => <th key={field.id}>{field.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              {laboratoryRawMaterialQualityFields.map((field) => {
                const value = record[field.id];
                return (
                  <td key={field.id}>
                    {field.id === "recordDate" && onEditRecord !== undefined
                      ? (
                          <button
                            className="board-assignment-link raw-material-quality-edit-link"
                            type="button"
                            onClick={() => onEditRecord(record)}
                          >
                            {formatLaboratoryDate(record.recordDate)}
                          </button>
                        )
                      : field.id === "recordDate"
                        ? formatLaboratoryDate(record.recordDate)
                        : field.id === "shift"
                          ? laboratoryRawMaterialQualityShiftLabels[record.shift]
                          : field.id === "recommendationRecipient"
                            ? laboratoryRawMaterialQualityRecommendationRecipientLabels[
                                record.recommendationRecipient
                              ]
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

export function LaboratoryGreenProductQualityTable({
  records,
  onEditRecord,
}: {
  records: LaboratoryGreenProductQualityRecord[];
  onEditRecord?: (record: LaboratoryGreenProductQualityRecord) => void;
}) {
  if (records.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  const generalFields = laboratoryGreenProductQualityFields.filter(
    (field) => field.group === "general",
  );
  const dimensionFields = laboratoryGreenProductQualityFields.filter(
    (field) => field.group === "dimensions",
  );
  const measurementFields = laboratoryGreenProductQualityFields.filter(
    (field) => field.group === "measurements",
  );

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <table className="data-table laboratory-results-table green-product-quality-table">
        <thead>
          <tr>
            {generalFields.map((field) => (
              <th key={field.id} rowSpan={2}>{field.label}</th>
            ))}
            <th colSpan={dimensionFields.length}>Линейные размеры</th>
            {measurementFields.map((field) => (
              <th key={field.id} rowSpan={2}>{field.label}</th>
            ))}
          </tr>
          <tr>
            {dimensionFields.map((field) => (
              <th key={field.id}>{field.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              {laboratoryGreenProductQualityFields.map((field) => {
                const value = field.id === "wagonIds"
                  ? record.wagons.map((wagon) => wagon.number).join("; ")
                  : record[field.id];
                return (
                  <td key={field.id}>
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
