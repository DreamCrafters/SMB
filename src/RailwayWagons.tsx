import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  buildRailwayWagonTotals,
  calculateRailwayCargoLineWeight,
  findRailwayWagonStage,
  isRailwayWagonDecisionStage,
  railwayWagonMovementDirections,
  railwayWagonStageFields,
  railwayWagonStatusLabels,
  railwayWagonTypes,
  resolveRailwayWagonStatus,
  selectAvailableRailwayWagonStages,
  type RailwayEtsngOption,
  type RailwaySecuringMethodOption,
  type RailwayStationOption,
  type RailwayWagonCargoLine,
  type RailwayWagonDecision,
  type RailwayWagonMovementDirection,
  type RailwayWagonOrder,
  type RailwayWagonRole,
  type RailwayWagonStage,
  type RailwayWagonType,
} from "./contracts/railwayWagons";
import { LoadingIndicator } from "./LoadingIndicator";
import { ReferenceSearchPicker } from "./ReferenceSearchPicker";
import {
  correctRailwayWagonOrder,
  requestRailwayEtsngCodes,
  requestRailwaySecuringMethods,
  requestRailwayStations,
  requestRailwayWagons,
  submitRailwayWagonOrder,
  submitRailwayWagonStage,
} from "./services/railwayWagons";
import { readShortUserMessage } from "./services/userFacingMessages";
import type { ShowToast } from "./services/toastStack";
import { useProductionBrands } from "./useProductionBrands";
import { useRawMaterialNomenclature } from "./useRawMaterialNomenclature";

type CargoDraftRow = {
  id: number;
  cargoName: string;
  etsngCode: string;
  palletCount: string;
  palletWeight: string;
  palletWidth: string;
  palletHeight: string;
  palletLength: string;
  securingMethod: string;
  securingWeight: string;
};

type StageDraft = {
  rentCost: string;
  tariffCost: string;
  demurragePenalty: string;
  carrier: string;
  wagonNumber: string;
  expectedArrivalDate: string;
  currentLocation: string;
  declineComment: string;
};

const maxCargoRows = 50;

const emptyStageDraft: StageDraft = {
  rentCost: "",
  tariffCost: "",
  demurragePenalty: "",
  carrier: "",
  wagonNumber: "",
  expectedArrivalDate: "",
  currentLocation: "",
  declineComment: "",
};

/**
 * Панель этапа открывается с уже сохранёнными значениями: после отклонения
 * сотрудник по работе с РЖД переписывает те же условия перевозки, и пустая
 * форма заставляла бы вводить их заново.
 */
function buildStageDraft(order: RailwayWagonOrder): StageDraft {
  return {
    rentCost: readDraftNumber(order.rentCost),
    tariffCost: readDraftNumber(order.tariffCost),
    demurragePenalty: order.demurragePenalty ?? "",
    carrier: order.carrier ?? "",
    wagonNumber: order.wagonNumber ?? "",
    expectedArrivalDate: order.expectedArrivalDate ?? "",
    currentLocation: order.currentLocation ?? "",
    declineComment: "",
  };
}

let nextCargoRowId = 1;

function buildCargoRow(): CargoDraftRow {
  nextCargoRowId += 1;
  return {
    id: nextCargoRowId,
    cargoName: "",
    etsngCode: "",
    palletCount: "",
    palletWeight: "",
    palletWidth: "",
    palletHeight: "",
    palletLength: "",
    securingMethod: "",
    securingWeight: "",
  };
}

export function RailwayWagonsWorkspace({
  onShowToast,
}: {
  onShowToast: ShowToast;
}) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const [orders, setOrders] = useState<RailwayWagonOrder[]>([]);
  const [carrierOptions, setCarrierOptions] = useState<string[]>([]);
  const [roles, setRoles] = useState<RailwayWagonRole[]>([]);
  const [securingMethods, setSecuringMethods] = useState<
    RailwaySecuringMethodOption[]
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [contractReference, setContractReference] = useState("");
  const [movementDirection, setMovementDirection] = useState<
    RailwayWagonMovementDirection
  >(railwayWagonMovementDirections[0]);
  const [destinationStation, setDestinationStation] = useState("");
  const [wagonType, setWagonType] = useState<RailwayWagonType>(
    railwayWagonTypes[0],
  );
  const [cargoRows, setCargoRows] = useState<CargoDraftRow[]>([buildCargoRow()]);
  const [editingOrderId, setEditingOrderId] = useState<string | undefined>();

  const [selectedOrderId, setSelectedOrderId] = useState<string | undefined>();
  const [stageDraft, setStageDraft] = useState<StageDraft>(emptyStageDraft);

  const productionBrands = useProductionBrands();
  const rawMaterials = useRawMaterialNomenclature();

  const cargoNameOptions = movementDirection === "На выгрузку"
    ? rawMaterials.labels
    : productionBrands.labels;

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      requestRailwayWagons({ signal: controller.signal }),
      requestRailwaySecuringMethods({ signal: controller.signal }),
    ]).then(([list, methods]) => {
      if (controller.signal.aborted) return;

      if (list.status === "error") {
        setLoadState("error");
        setHasError(true);
        setMessage(
          readShortUserMessage(list.message, "Не удалось загрузить заявки на вагоны."),
        );
        return;
      }

      setOrders(list.orders);
      setCarrierOptions(list.carrierOptions);
      setRoles(list.roles);
      if (methods.status === "ready") setSecuringMethods(methods.securingMethods);
      setLoadState("ready");
    });

    return () => controller.abort();
  }, []);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId),
    [orders, selectedOrderId],
  );

  const availableStages = useMemo(
    () => selectedOrder === undefined
      ? []
      : selectAvailableRailwayWagonStages(selectedOrder, roles),
    [selectedOrder, roles],
  );

  const draftCargoLines = useMemo(
    () => cargoRows.map(readCargoDraftLine),
    [cargoRows],
  );
  const draftTotals = useMemo(
    () => buildRailwayWagonTotals(draftCargoLines),
    [draftCargoLines],
  );

  const canManageOrders = roles.includes("sales");
  const isCorrection = editingOrderId !== undefined;

  function resetOrderForm() {
    setContractReference("");
    setMovementDirection(railwayWagonMovementDirections[0]);
    setDestinationStation("");
    setWagonType(railwayWagonTypes[0]);
    setCargoRows([buildCargoRow()]);
    setEditingOrderId(undefined);
  }

  /** Изменённая заявка остаётся на своём месте, перевыставленная встаёт первой. */
  function applySavedOrder(saved: RailwayWagonOrder, replacement?: RailwayWagonOrder) {
    setOrders((current) => {
      const updated = current.some((order) => order.id === saved.id)
        ? current.map((order) => (order.id === saved.id ? saved : order))
        : [saved, ...current];

      return replacement === undefined ? updated : [replacement, ...updated];
    });
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setHasError(false);

    const submission = {
      contractReference,
      movementDirection,
      destinationStation,
      wagonType,
      cargoLines: draftCargoLines.map(({ etsngName: _etsngName, ...line }) => line),
    };
    const result = editingOrderId === undefined
      ? await submitRailwayWagonOrder(submission)
      : await correctRailwayWagonOrder(editingOrderId, submission);

    setIsSubmitting(false);

    if (result.status === "error") {
      setHasError(true);
      setMessage(
        readShortUserMessage(result.message, "Не удалось сохранить заявку на вагон."),
      );
      return;
    }

    applySavedOrder(result.order);
    setMessage("");
    resetOrderForm();
    onShowToast(
      isCorrection ? "Заявка исправлена" : "Заявка отправлена",
      `Станция назначения: ${result.order.destinationStation}`,
      "success",
    );
  }

  async function applyStage(
    stage: RailwayWagonStage,
    decision?: RailwayWagonDecision,
  ) {
    if (selectedOrder === undefined) return;

    setIsSubmitting(true);
    setHasError(false);

    const result = await submitRailwayWagonStage(selectedOrder.id, {
      stageId: stage.id,
      ...readStagePayload(stage.id, stageDraft),
      ...(decision === undefined
        ? {}
        : { decision, declineComment: stageDraft.declineComment }),
    });

    setIsSubmitting(false);

    if (result.status === "error") {
      setHasError(true);
      setMessage(
        readShortUserMessage(result.message, "Не удалось отметить этап вагона."),
      );
      return;
    }

    applySavedOrder(result.order, result.replacement);
    setStageDraft(buildStageDraft(result.order));
    setMessage("");
    onShowToast(
      decision === "decline" ? "Согласование отклонено" : "Этап отмечен",
      describeStageOutcome(stage, result.replacement !== undefined, decision),
      "success",
    );
  }

  function startCorrection(order: RailwayWagonOrder) {
    setEditingOrderId(order.id);
    setContractReference(order.contractReference);
    setMovementDirection(order.movementDirection);
    setDestinationStation(order.destinationStation);
    setWagonType(order.wagonType);
    setCargoRows(
      order.cargoLines.length === 0
        ? [buildCargoRow()]
        : order.cargoLines.map((line) => ({
            ...buildCargoRow(),
            cargoName: line.cargoName,
            etsngCode: line.etsngCode ?? "",
            palletCount: readDraftNumber(line.palletCount),
            palletWeight: readDraftNumber(line.palletWeight),
            palletWidth: readDraftNumber(line.palletWidth),
            palletHeight: readDraftNumber(line.palletHeight),
            palletLength: readDraftNumber(line.palletLength),
            securingMethod: line.securingMethod ?? "",
            securingWeight: readDraftNumber(line.securingWeight),
          })),
    );
  }

  /** «Автозаполнение с предыдущего» техзадания: берётся последняя заявка. */
  function prefillFromPrevious() {
    const previous = orders[0];
    if (previous === undefined) return;

    setContractReference(previous.contractReference);
    setMovementDirection(previous.movementDirection);
    setDestinationStation(previous.destinationStation);
    setWagonType(previous.wagonType);
    setCargoRows(
      previous.cargoLines.map((line) => ({
        ...buildCargoRow(),
        cargoName: line.cargoName,
        etsngCode: line.etsngCode ?? "",
        palletCount: readDraftNumber(line.palletCount),
        palletWeight: readDraftNumber(line.palletWeight),
        palletWidth: readDraftNumber(line.palletWidth),
        palletHeight: readDraftNumber(line.palletHeight),
        palletLength: readDraftNumber(line.palletLength),
        securingMethod: line.securingMethod ?? "",
        securingWeight: readDraftNumber(line.securingWeight),
      })),
    );
  }

  function updateCargoRow(id: number, patch: Partial<CargoDraftRow>) {
    setCargoRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  if (loadState === "loading") {
    return <LoadingIndicator label="Загружаем заявки на вагоны…" variant="panel" />;
  }

  return (
    <section className="railway-wagons-workspace">
      <header className="railway-wagons-header">
        <span className="eyebrow">ЖД Вагоны</span>
        <h2>Заявки на вагоны</h2>
        <p className="railway-wagons-roles">
          {roles.length === 0
            ? "Доступен только просмотр: роль в разделе не назначена."
            : `Ваши этапы: ${describeRoles(roles)}`}
        </p>
      </header>

      {message === ""
        ? null
        : (
            <p
              className={hasError ? "form-status form-status-error" : "form-status"}
            >
              {message}
            </p>
          )}

      {!canManageOrders
        ? null
        : (
            <form className="railway-wagon-form" onSubmit={submitOrder}>
              <fieldset disabled={isSubmitting}>
                <legend>{isCorrection ? "Исправление заявки" : "Новая заявка"}</legend>

                <div className="railway-field-grid">
                  <label className="railway-field">
                    <span>Номер и дата договора с грузополучателем</span>
                    <input
                      maxLength={255}
                      onChange={(event) =>
                        setContractReference(event.currentTarget.value)}
                      required
                      value={contractReference}
                    />
                  </label>

                  <label className="railway-field">
                    <span>Направление движения</span>
                    <select
                      onChange={(event) =>
                        setMovementDirection(
                          event.currentTarget.value as RailwayWagonMovementDirection,
                        )}
                      value={movementDirection}
                    >
                      {railwayWagonMovementDirections.map((direction) => (
                        <option key={direction} value={direction}>{direction}</option>
                      ))}
                    </select>
                  </label>

                  <div className="railway-field">
                    <ReferenceSearchPicker<RailwayStationOption>
                      emptyLabel="Станции с таким названием нет в справочнике РЖД."
                      formatOption={(station) =>
                        station.road === null
                          ? station.name
                          : `${station.name} (${station.road})`}
                      label="Станция назначения"
                      onSearch={async (query, signal) => {
                        const result = await requestRailwayStations(query, { signal });
                        return result.status === "ready" ? result.stations : [];
                      }}
                      onSelect={(station) =>
                        setDestinationStation(station?.name ?? "")}
                      placeholder="Начните вводить название станции"
                      value={destinationStation}
                    />
                  </div>

                  <label className="railway-field">
                    <span>Вид вагона</span>
                    <select
                      onChange={(event) =>
                        setWagonType(event.currentTarget.value as RailwayWagonType)}
                      value={wagonType}
                    >
                      {railwayWagonTypes.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="railway-table-wrap">
                  <table className="railway-cargo-table">
                    <caption>Грузы в вагоне</caption>
                    <thead>
                      <tr>
                        <th scope="col">Название груза</th>
                        <th scope="col">Код груза по ЕТСНГ</th>
                        <th scope="col">Кол-во паллет</th>
                        <th scope="col">Вес каждой паллеты, т</th>
                        <th scope="col">Итоговый вес груза, т</th>
                        <th scope="col">Габариты паллеты, Ш×В×Д</th>
                        <th scope="col">Способ крепления груза</th>
                        <th scope="col">Вес крепежа, т</th>
                        <th aria-label="Действия" />
                      </tr>
                    </thead>
                    <tbody>
                      {cargoRows.map((row, index) => (
                        <tr key={row.id}>
                          <td>
                            <input
                              list="railway-cargo-name-options"
                              maxLength={255}
                              onChange={(event) =>
                                updateCargoRow(row.id, {
                                  cargoName: event.currentTarget.value,
                                })}
                              required
                              value={row.cargoName}
                            />
                          </td>
                          <td>
                            <ReferenceSearchPicker<RailwayEtsngOption>
                              emptyLabel="Код или наименование не найдены в ЕТСНГ."
                              formatOption={(option) =>
                                `${option.code} — ${option.name}`}
                              label={`Код груза по ЕТСНГ, строка ${index + 1}`}
                              labelHidden
                              onSearch={async (query, signal) => {
                                const result = await requestRailwayEtsngCodes(query, {
                                  signal,
                                });
                                return result.status === "ready" ? result.codes : [];
                              }}
                              onSelect={(option) =>
                                updateCargoRow(row.id, {
                                  etsngCode: option?.code ?? "",
                                })}
                              placeholder="Код или наименование"
                              value={row.etsngCode}
                            />
                          </td>
                          <td>
                            <input
                              inputMode="numeric"
                              min="0"
                              onChange={(event) =>
                                updateCargoRow(row.id, {
                                  palletCount: event.currentTarget.value,
                                })}
                              step="1"
                              type="number"
                              value={row.palletCount}
                            />
                          </td>
                          <td>
                            <input
                              min="0"
                              onChange={(event) =>
                                updateCargoRow(row.id, {
                                  palletWeight: event.currentTarget.value,
                                })}
                              step="0.001"
                              type="number"
                              value={row.palletWeight}
                            />
                          </td>
                          <td>
                            <output className="railway-calculated">
                              {formatWeight(
                                calculateRailwayCargoLineWeight(
                                  draftCargoLines[index],
                                ),
                              )}
                            </output>
                          </td>
                          <td className="railway-dimensions-cell">
                            {(["palletWidth", "palletHeight", "palletLength"] as const)
                              .map((field) => (
                                <input
                                  aria-label={dimensionLabels[field]}
                                  key={field}
                                  min="0"
                                  onChange={(event) =>
                                    updateCargoRow(row.id, {
                                      [field]: event.currentTarget.value,
                                    })}
                                  placeholder={dimensionPlaceholders[field]}
                                  step="0.01"
                                  type="number"
                                  value={row[field]}
                                />
                              ))}
                          </td>
                          <td>
                            <select
                              onChange={(event) =>
                                updateCargoRow(row.id, {
                                  securingMethod: event.currentTarget.value,
                                })}
                              value={row.securingMethod}
                            >
                              <option value="">—</option>
                              {securingMethods.map((method) => (
                                <option
                                  key={method.name}
                                  title={method.description ?? undefined}
                                  value={method.name}
                                >
                                  {method.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              min="0"
                              onChange={(event) =>
                                updateCargoRow(row.id, {
                                  securingWeight: event.currentTarget.value,
                                })}
                              step="0.001"
                              type="number"
                              value={row.securingWeight}
                            />
                          </td>
                          <td className="railway-row-action">
                            <button
                              aria-label={`Удалить строку груза ${index + 1}`}
                              className="secondary-button"
                              disabled={cargoRows.length === 1}
                              onClick={() =>
                                setCargoRows((rows) =>
                                  rows.filter((current) => current.id !== row.id))}
                              type="button"
                            >
                              Удалить
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Итого</th>
                        <td />
                        <td>{draftTotals.palletCount}</td>
                        <td>{formatWeight(draftTotals.palletWeight)}</td>
                        <td>{formatWeight(draftTotals.cargoWeight)}</td>
                        <td />
                        <td />
                        <td>{formatWeight(draftTotals.securingWeight)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <datalist id="railway-cargo-name-options">
                  {cargoNameOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>

                <p className="railway-total-weight">
                  Общий вес в вагоне: {formatWeight(draftTotals.totalWeight)} т
                </p>

                <div className="railway-form-actions">
                  <button
                    className="secondary-button"
                    disabled={cargoRows.length >= maxCargoRows}
                    onClick={() =>
                      setCargoRows((rows) => [...rows, buildCargoRow()])}
                    type="button"
                  >
                    Добавить груз
                  </button>
                  <button
                    className="secondary-button"
                    disabled={orders.length === 0}
                    onClick={prefillFromPrevious}
                    type="button"
                  >
                    Заполнить по предыдущей
                  </button>
                  {isCorrection
                    ? (
                        <button
                          className="secondary-button"
                          onClick={resetOrderForm}
                          type="button"
                        >
                          Отменить исправление
                        </button>
                      )
                    : null}
                  <button className="primary-button" type="submit">
                    {isCorrection ? "Сохранить исправление" : "Отправить заявку"}
                  </button>
                </div>
              </fieldset>
            </form>
          )}

      {selectedOrder === undefined
        ? null
        : (
            <RailwayWagonStagePanel
              availableStages={availableStages}
              carrierOptions={carrierOptions}
              draft={stageDraft}
              isSubmitting={isSubmitting}
              onApply={applyStage}
              onChange={setStageDraft}
              onClose={() => setSelectedOrderId(undefined)}
              order={selectedOrder}
            />
          )}

      <div className="railway-table-wrap railway-table-wrap-orders">
        <table className="railway-orders-table">
          <caption>Заявки на вагоны</caption>
          <thead>
            <tr>
              {/* Столбец действий стоит первым и залипает слева: до кнопки
                  «Этапы» иначе пришлось бы прокручивать таблицу вправо. */}
              <th aria-label="Действия" />
              <th scope="col">Статус нахождения</th>
              <th scope="col">Комментарий согласования</th>
              <th scope="col">Договор</th>
              <th scope="col">Направление</th>
              <th scope="col">Станция назначения</th>
              <th scope="col">Вид вагона</th>
              <th scope="col">Грузы</th>
              <th scope="col">Общий вес, т</th>
              <th scope="col">Стоимость аренды, руб.</th>
              <th scope="col">Тариф РЖД, руб.</th>
              <th scope="col">Штраф за простой</th>
              <th scope="col">Грузоперевозчик</th>
              <th scope="col">Номер вагона</th>
              <th scope="col">Ожидаемая дата прибытия</th>
              <th scope="col">Местонахождение</th>
              {railwayWagonStageFields.map((field) => (
                <th key={field} scope="col">{railwayWagonStatusLabels[field]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0
              ? (
                  <tr>
                    <td colSpan={16 + railwayWagonStageFields.length}>
                      <p className="railway-empty-note">Заявок на вагоны пока нет.</p>
                    </td>
                  </tr>
                )
              : orders.map((order) => {
                  const totals = buildRailwayWagonTotals(order.cargoLines);

                  return (
                    <tr
                      className={order.id === selectedOrderId ? "is-active" : undefined}
                      key={order.id}
                    >
                      <td>
                        <button
                          className="board-assignment-link railway-order-link"
                          onClick={() => {
                            setSelectedOrderId(order.id);
                            setStageDraft(buildStageDraft(order));
                          }}
                          type="button"
                        >
                          Этапы
                        </button>
                        {!canManageOrders || order.pricingStartedAt !== null
                          ? null
                          : (
                              <button
                                className="board-assignment-link railway-order-link"
                                onClick={() => startCorrection(order)}
                                type="button"
                              >
                                Исправить
                              </button>
                            )}
                      </td>
                      <td>{resolveRailwayWagonStatus(order)}</td>
                      <td>{describeDeclineComment(order)}</td>
                      <td>{order.contractReference}</td>
                      <td>{order.movementDirection}</td>
                      <td>
                        {order.destinationStationRoad === null
                          ? order.destinationStation
                          : `${order.destinationStation} (${order.destinationStationRoad})`}
                      </td>
                      <td>{order.wagonType}</td>
                      <td>
                        {order.cargoLines
                          .map((line) => line.cargoName)
                          .join("; ") || "—"}
                      </td>
                      <td>{formatWeight(totals.totalWeight)}</td>
                      <td>{formatOptional(order.rentCost)}</td>
                      <td>{formatOptional(order.tariffCost)}</td>
                      <td>{formatOptional(order.demurragePenalty)}</td>
                      <td>{formatOptional(order.carrier)}</td>
                      <td>{formatOptional(order.wagonNumber)}</td>
                      <td>{formatOptional(order.expectedArrivalDate)}</td>
                      <td>{formatOptional(order.currentLocation)}</td>
                      {railwayWagonStageFields.map((field) => (
                        <td key={field}>{formatStamp(order[field])}</td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Панель этапа показывает только то, что доступно роли пользователя: остальные
 * этапы вагона заполняют другие должности, и их поля здесь не рендерятся.
 */
function RailwayWagonStagePanel({
  availableStages,
  carrierOptions,
  draft,
  isSubmitting,
  onApply,
  onChange,
  onClose,
  order,
}: {
  availableStages: readonly RailwayWagonStage[];
  carrierOptions: readonly string[];
  draft: StageDraft;
  isSubmitting: boolean;
  onApply: (stage: RailwayWagonStage, decision?: RailwayWagonDecision) => void;
  onChange: (draft: StageDraft) => void;
  onClose: () => void;
  order: RailwayWagonOrder;
}) {
  return (
    <section className="railway-stage-panel">
      <header className="railway-stage-header">
        <h3>
          Вагон: {order.destinationStation}
          {order.wagonNumber === null ? "" : `, № ${order.wagonNumber}`}
        </h3>
        <p>Статус: {resolveRailwayWagonStatus(order)}</p>
        <button className="secondary-button" onClick={onClose} type="button">
          Закрыть
        </button>
      </header>

      {order.declineComment === null
        ? null
        : (
            <p className="railway-decline-note">
              {describeDeclineComment(order)}
            </p>
          )}

      {availableStages.length === 0
        ? (
            <p className="railway-empty-note">
              Доступных этапов нет: следующий этап заполняет другая должность
              или вагон уже выведен.
            </p>
          )
        : (
            <ul className="railway-stage-list">
              {availableStages.map((stage) => (
                <li className="railway-stage-item" key={stage.id}>
                  <fieldset disabled={isSubmitting}>
                    <legend>{stage.label}</legend>

                    {stage.id === "carriage_terms"
                      ? (
                          <div className="railway-field-grid">
                            <label className="railway-field">
                              <span>Стоимость аренды, руб.</span>
                              <input
                                min="0"
                                onChange={(event) =>
                                  onChange({
                                    ...draft,
                                    rentCost: event.currentTarget.value,
                                  })}
                                step="0.01"
                                type="number"
                                value={draft.rentCost}
                              />
                            </label>
                            <label className="railway-field">
                              <span>Стоимость тарифа РЖД до места назначения, руб.</span>
                              <input
                                min="0"
                                onChange={(event) =>
                                  onChange({
                                    ...draft,
                                    tariffCost: event.currentTarget.value,
                                  })}
                                step="0.01"
                                type="number"
                                value={draft.tariffCost}
                              />
                            </label>
                            <label className="railway-field">
                              <span>Штраф за простой</span>
                              <input
                                maxLength={1000}
                                onChange={(event) =>
                                  onChange({
                                    ...draft,
                                    demurragePenalty: event.currentTarget.value,
                                  })}
                                value={draft.demurragePenalty}
                              />
                            </label>
                            <label className="railway-field">
                              <span>Грузоперевозчик</span>
                              <input
                                autoComplete="off"
                                list="railway-carrier-options"
                                maxLength={255}
                                onChange={(event) =>
                                  onChange({
                                    ...draft,
                                    carrier: event.currentTarget.value,
                                  })}
                                value={draft.carrier}
                              />
                            </label>
                          </div>
                        )
                      : null}

                    {stage.id === "wagon_number"
                      ? (
                          <label className="railway-field">
                            <span>Номер вагона</span>
                            <input
                              inputMode="numeric"
                              maxLength={40}
                              onChange={(event) =>
                                onChange({
                                  ...draft,
                                  wagonNumber: event.currentTarget.value,
                                })}
                              value={draft.wagonNumber}
                            />
                          </label>
                        )
                      : null}

                    {stage.id === "dispatch"
                      ? (
                          <div className="railway-field-grid">
                            <label className="railway-field">
                              <span>Ожидаемая дата прибытия</span>
                              <input
                                onChange={(event) =>
                                  onChange({
                                    ...draft,
                                    expectedArrivalDate: event.currentTarget.value,
                                  })}
                                type="date"
                                value={draft.expectedArrivalDate}
                              />
                            </label>
                            <div className="railway-field">
                              <RailwayStationField
                                onSelect={(station) =>
                                  onChange({ ...draft, currentLocation: station })}
                                value={draft.currentLocation}
                              />
                            </div>
                          </div>
                        )
                      : null}

                    {stage.id === "location"
                      ? (
                          <div className="railway-field">
                            <RailwayStationField
                              onSelect={(station) =>
                                onChange({ ...draft, currentLocation: station })}
                              value={draft.currentLocation}
                            />
                          </div>
                        )
                      : null}

                    {!isRailwayWagonDecisionStage(stage)
                      ? (
                          <button
                            className="primary-button"
                            onClick={() => onApply(stage)}
                            type="button"
                          >
                            {stage.stamps === null ? "Сохранить" : "Отметить"}
                          </button>
                        )
                      : (
                          <>
                            <label className="railway-field">
                              <span>Комментарий (нужен для отклонения)</span>
                              <textarea
                                maxLength={1000}
                                onChange={(event) =>
                                  onChange({
                                    ...draft,
                                    declineComment: event.currentTarget.value,
                                  })}
                                placeholder="Что не так с условиями перевозки"
                                rows={2}
                                value={draft.declineComment}
                              />
                            </label>
                            <div className="railway-form-actions">
                              <button
                                className="primary-button"
                                onClick={() => onApply(stage, "approve")}
                                type="button"
                              >
                                Одобрить
                              </button>
                              <button
                                className="secondary-button"
                                disabled={draft.declineComment.trim() === ""}
                                onClick={() => onApply(stage, "decline")}
                                type="button"
                              >
                                Отклонить
                              </button>
                            </div>
                          </>
                        )}
                  </fieldset>
                </li>
              ))}
            </ul>
          )}

      <datalist id="railway-carrier-options">
        {carrierOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </section>
  );
}

/**
 * Местонахождение вагона — станция того же справочника РЖД, что и станция
 * назначения: сервер приводит подпись к справочной и отклоняет значение вне
 * справочника, поэтому поле ищет станцию, а не принимает произвольный текст.
 */
function RailwayStationField({
  onSelect,
  value,
}: {
  onSelect: (station: string) => void;
  value: string;
}) {
  return (
    <ReferenceSearchPicker<RailwayStationOption>
      emptyLabel="Станции с таким названием нет в справочнике РЖД."
      formatOption={(station) =>
        station.road === null
          ? station.name
          : `${station.name} (${station.road})`}
      label="Местонахождение"
      onSearch={async (query, signal) => {
        const result = await requestRailwayStations(query, { signal });
        return result.status === "ready" ? result.stations : [];
      }}
      onSelect={(station) => onSelect(station?.name ?? "")}
      placeholder="Начните вводить название станции"
      value={value}
    />
  );
}

const dimensionLabels = {
  palletWidth: "Ширина паллеты",
  palletHeight: "Высота паллеты",
  palletLength: "Длина паллеты",
} as const;

const dimensionPlaceholders = {
  palletWidth: "Ш",
  palletHeight: "В",
  palletLength: "Д",
} as const;

const roleLabels: Record<RailwayWagonRole, string> = {
  sales: "менеджер по продажам",
  carrier: "сотрудник по работе с РЖД",
  logistics: "директор по логистике",
  dispatcher: "диспетчер",
};

function describeRoles(roles: readonly RailwayWagonRole[]) {
  return roles.map((role) => roleLabels[role]).join(", ");
}

/** Причина возврата читается вместе с этапом, на котором её написали. */
function describeDeclineComment(order: RailwayWagonOrder) {
  if (order.declineComment === null) return "—";

  const stage = order.declineStageId === null
    ? undefined
    : findRailwayWagonStage(order.declineStageId);

  return stage === undefined
    ? order.declineComment
    : `${stage.label}: ${order.declineComment}`;
}

function describeStageOutcome(
  stage: RailwayWagonStage,
  hasReplacement: boolean,
  decision?: RailwayWagonDecision,
) {
  if (decision === "decline") {
    return `${stage.label}. Заявка возвращена на условия перевозки.`;
  }

  return hasReplacement
    ? `${stage.label}. Создана новая заявка взамен забракованного вагона.`
    : stage.label;
}

function readCargoDraftLine(row: CargoDraftRow): RailwayWagonCargoLine {
  return {
    cargoName: row.cargoName,
    etsngCode: emptyToNull(row.etsngCode),
    etsngName: null,
    palletCount: readOptionalNumber(row.palletCount),
    palletWeight: readOptionalNumber(row.palletWeight),
    palletWidth: readOptionalNumber(row.palletWidth),
    palletHeight: readOptionalNumber(row.palletHeight),
    palletLength: readOptionalNumber(row.palletLength),
    securingMethod: emptyToNull(row.securingMethod),
    securingWeight: readOptionalNumber(row.securingWeight),
  };
}

function readStagePayload(stageId: string, draft: StageDraft) {
  if (stageId === "carriage_terms") {
    return {
      rentCost: draft.rentCost,
      tariffCost: draft.tariffCost,
      demurragePenalty: draft.demurragePenalty,
      carrier: draft.carrier,
    };
  }
  if (stageId === "wagon_number") {
    return { wagonNumber: draft.wagonNumber };
  }
  if (stageId === "dispatch") {
    return {
      expectedArrivalDate: draft.expectedArrivalDate,
      currentLocation: draft.currentLocation,
    };
  }
  if (stageId === "location") {
    return { currentLocation: draft.currentLocation };
  }
  return {};
}

function readOptionalNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function readDraftNumber(value: number | null) {
  return value === null ? "" : String(value);
}

function emptyToNull(value: string) {
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function formatWeight(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

function formatOptional(value: string | number | null) {
  if (value === null) return "—";
  return typeof value === "number"
    ? value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })
    : value;
}

function formatStamp(value: string | null) {
  if (value === null) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
