import { useState } from "react";
import type {
  LaboratoryIndicatorId,
  LaboratoryIndicatorReference,
  LaboratoryResult,
  LaboratorySection,
} from "./contracts";
import { requestLaboratoryProtocolPdf } from "./services/laboratoryResults";
import { readShortUserMessage } from "./services/userFacingMessages";

type ShowToast = (title: string, message: string) => void;

export type LaboratoryTableSection = LaboratorySection | "all";

export const laboratorySectionLabels: Record<LaboratorySection, string> = {
  incoming: "Входящий контроль",
  finished_product: "Контроль готовой продукции",
};

export function LaboratoryResultsTable({
  section,
  sectionLabels = laboratorySectionLabels,
  results,
  indicators,
  isAdminPreviewMode,
  onShowToast,
}: {
  section: LaboratoryTableSection;
  sectionLabels?: Record<LaboratorySection, string>;
  results: LaboratoryResult[];
  indicators: LaboratoryIndicatorReference[];
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  if (results.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам результатов нет.</p>;
  }
  const historyRows: Array<{
    key: string;
    result: LaboratoryResult;
    identifier: string;
    values: Partial<Record<LaboratoryIndicatorId, string>>;
    protocolRowSpan: number;
  }> = [];
  for (const result of results) {
    if (result.section === "incoming") {
      result.samples.forEach((sample, index) => historyRows.push({
        key: `${result.id}:${index}`,
        result,
        identifier: sample.sampleIdentifier,
        values: sample.values,
        protocolRowSpan: index === 0 ? result.samples.length : 0,
      }));
    } else {
      historyRows.push({
        key: result.id,
        result,
        identifier: result.productBrand,
        values: result.values,
        protocolRowSpan: 1,
      });
    }
  }

  return (
    <div className="table-scroll laboratory-table-scroll">
      <table className="data-table laboratory-results-table">
        <thead>
          <tr>
            <th>Дата анализа</th>
            {section === "all" ? <th>Раздел</th> : null}
            <th>{readObjectColumnLabel(section)}</th>
            <th>{readIdentifierColumnLabel(section)}</th>
            {indicators.map((indicator) => <th key={indicator.id}>{indicator.label}</th>)}
            <th>Лаборант</th>
            <th>Протокол</th>
          </tr>
        </thead>
        <tbody>
          {historyRows.map((row) => (
            <tr key={row.key}>
              <td>{formatLaboratoryDate(row.result.analysisDate)}</td>
              {section === "all" ? (
                <td>{sectionLabels[row.result.section]}</td>
              ) : null}
              <td>{row.result.materialLabel}</td>
              <td>{row.identifier}</td>
              {indicators.map((indicator) => (
                <td key={indicator.id}>{row.values[indicator.id] ?? "—"}</td>
              ))}
              <td>{row.result.laboratoryAssistantDisplayName}</td>
              {row.protocolRowSpan > 0 ? (
                <td className="laboratory-protocol-cell" rowSpan={row.protocolRowSpan}>
                  <LaboratoryProtocolActions
                    disabled={isAdminPreviewMode}
                    result={row.result}
                    onShowToast={onShowToast}
                  />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LaboratoryProtocolActions({
  disabled,
  result,
  onShowToast,
}: {
  disabled: boolean;
  result: LaboratoryResult;
  onShowToast: ShowToast;
}) {
  const [isOpeningProtocol, setIsOpeningProtocol] = useState(false);

  async function openProtocol() {
    if (disabled || isOpeningProtocol) return;
    const previewWindow = window.open("", "_blank");
    if (previewWindow !== null) {
      previewWindow.opener = null;
      previewWindow.document.title = "Формируем протокол…";
    }
    setIsOpeningProtocol(true);
    const response = await requestLaboratoryProtocolPdf(result.id);
    setIsOpeningProtocol(false);

    if (response.status === "error") {
      previewWindow?.close();
      onShowToast(
        "Протокол не сформирован",
        readShortUserMessage(
          response.message,
          "Не удалось сформировать протокол испытаний.",
        ),
      );
      return;
    }

    const objectUrl = URL.createObjectURL(response.blob);
    if (previewWindow !== null) {
      previewWindow.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return;
    }

    const link = document.createElement("a");
    link.href = objectUrl;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  return (
    <div className="laboratory-protocol-actions">
      <button
        className="secondary-button"
        disabled={disabled || isOpeningProtocol}
        type="button"
        onClick={() => void openProtocol()}
      >
        {isOpeningProtocol ? "Открываем…" : "Открыть PDF"}
      </button>
    </div>
  );
}

export function mergeIndicatorReferences(
  indicators: LaboratoryIndicatorReference[],
  results: LaboratoryResult[],
) {
  const byId = new Map(
    indicators.map((indicator) => [indicator.id, indicator]),
  );
  for (const result of results) {
    const valueSets = result.section === "incoming"
      ? result.samples.map((sample) => sample.values)
      : [result.values];
    for (const values of valueSets) {
      for (const id of Object.keys(values) as LaboratoryIndicatorId[]) {
        if (!byId.has(id)) {
          byId.set(id, { id, label: laboratoryIndicatorLabels[id] });
        }
      }
    }
  }
  return Array.from(byId.values());
}

export function formatLaboratoryDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

const laboratoryIndicatorLabels: Record<LaboratoryIndicatorId, string> = {
  al2o3: "Al2O3",
  fe2o3: "Fe2O3",
  sio2: "SiO2",
  cao2: "CaO2",
  p2o5: "P2O5",
  loss_on_ignition: "ппп",
  moisture: "Влажность",
  bulk_density: "Насыпной вес",
  water_absorption: "Водопоглощение",
  strength: "Прочность",
  grain_composition: "Зерновой состав",
};

function readObjectColumnLabel(section: LaboratoryTableSection) {
  if (section === "incoming") return "Объект испытаний";
  if (section === "finished_product") return "Вид продукции";
  return "Объект испытаний / вид продукции";
}

function readIdentifierColumnLabel(section: LaboratoryTableSection) {
  if (section === "incoming") return "Номер пробы / транспорт";
  if (section === "finished_product") return "Марка";
  return "Номер пробы / марка";
}
