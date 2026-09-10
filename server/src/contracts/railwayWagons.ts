/**
 * Задача 106, раздел «ЖД Вагоны». Одна запись — одна заявка на вагон, которую
 * последовательно заполняют разные должности: менеджер по продажам создаёт
 * заявку, сотрудник по работе с РЖД добавляет условия перевозки, директор по
 * логистике и менеджер согласовывают, дальше сотрудник по РЖД и диспетчер
 * отмечают движение. Следующий этап открывается, только когда заполнен
 * предыдущий, поэтому состояние выводится из заполненности полей — отдельной
 * таблицы этапов нет, как и у вагонеток огнеупорного цеха.
 */

export const railwayWagonMovementDirections = [
  "На выгрузку",
  "На погрузку",
] as const;

export type RailwayWagonMovementDirection =
  (typeof railwayWagonMovementDirections)[number];

export const railwayWagonTypes = ["КР (крытый)", "ПВ (полувагон)"] as const;

export type RailwayWagonType = (typeof railwayWagonTypes)[number];

/** Роли раздела. Должность получает ровно одну через уровень доступа вкладки. */
export const railwayWagonRoles = [
  "sales",
  "carrier",
  "logistics",
  "dispatcher",
] as const;

export type RailwayWagonRole = (typeof railwayWagonRoles)[number];

/**
 * Уровень доступа должности к вкладке. Приём тот же, что у поручений Совета
 * директоров: уровень отдельной колонкой не хранится, а выводится из набора
 * capability должности, поэтому админ назначает роль, не трогая код.
 */
export const railwayWagonAccessLevels = [
  "none",
  "view",
  "sales",
  "carrier",
  "logistics",
  "dispatcher",
] as const;

export type RailwayWagonAccess = (typeof railwayWagonAccessLevels)[number];

export const railwayWagonRoleCapabilities: Record<RailwayWagonRole, string> = {
  sales: "business.manage_railway_wagon_orders",
  carrier: "business.manage_railway_wagon_carriage",
  logistics: "business.approve_railway_wagon_logistics",
  dispatcher: "business.confirm_railway_wagon_movement",
};

export function isRailwayWagonAccess(value: unknown): value is RailwayWagonAccess {
  return (railwayWagonAccessLevels as readonly unknown[]).includes(value);
}

export function isRailwayWagonRole(value: unknown): value is RailwayWagonRole {
  return (railwayWagonRoles as readonly unknown[]).includes(value);
}

/** Решение этапа согласования: одобрить или отклонить с комментарием. */
export const railwayWagonDecisions = ["approve", "decline"] as const;

export type RailwayWagonDecision = (typeof railwayWagonDecisions)[number];

export function isRailwayWagonDecision(
  value: unknown,
): value is RailwayWagonDecision {
  return (railwayWagonDecisions as readonly unknown[]).includes(value);
}

/** Роли выводятся из capability, поэтому и сервер, и браузер читают их одинаково. */
export function resolveRailwayWagonRoles(
  capabilities: readonly string[],
): RailwayWagonRole[] {
  return railwayWagonRoles.filter((role) =>
    capabilities.includes(railwayWagonRoleCapabilities[role]),
  );
}

/**
 * Строка вложенной таблицы грузов (колонки F–M техзадания): в одном вагоне
 * может быть несколько наименований груза со своими характеристиками.
 */
export type RailwayWagonCargoLine = {
  cargoName: string;
  etsngCode: string | null;
  etsngName: string | null;
  palletCount: number | null;
  palletWeight: number | null;
  palletWidth: number | null;
  palletHeight: number | null;
  palletLength: number | null;
  securingMethod: string | null;
  securingWeight: number | null;
};

/** Метки этапов в порядке лестницы статусов из колонки O техзадания. */
export const railwayWagonStageFields = [
  "orderedAt",
  "pricingStartedAt",
  "logisticsApprovedAt",
  "managerApprovedAt",
  "specificationSignedAt",
  "enRouteAt",
  "atLoadingStationAt",
  "rejectedAt",
  "atShipperTrackAt",
  "atLoadingAt",
  "loadedAt",
  "acceptedForCarriageAt",
  "deliveredAt",
  "unloadedAt",
  "releasedAt",
] as const;

export type RailwayWagonStageField = (typeof railwayWagonStageFields)[number];

export const railwayWagonStatusLabels: Record<RailwayWagonStageField, string> = {
  orderedAt: "Заказан",
  pricingStartedAt: "Согласовывается",
  logisticsApprovedAt: "Согласовано логистом",
  managerApprovedAt: "Согласовано менеджером",
  specificationSignedAt: "Спецификация с перевозчиком подписана",
  enRouteAt: "В пути на станцию погрузки",
  atLoadingStationAt: "На станции погрузки",
  rejectedAt: "Забракован",
  atShipperTrackAt: "На ПНП грузоотправителя",
  atLoadingAt: "На погрузке",
  loadedAt: "Загружен, на вывод с территории погрузки",
  acceptedForCarriageAt: "Принято к перевозке в сторону грузополучателя",
  deliveredAt: "Доставлен на станцию назначения грузополучателя",
  unloadedAt: "Вагон разгружен",
  releasedAt: "Вагон выведен",
};

export const railwayWagonStatuses = railwayWagonStageFields.map(
  (field) => railwayWagonStatusLabels[field],
);

export type RailwayWagonOrder = {
  id: string;
  contractReference: string;
  movementDirection: RailwayWagonMovementDirection;
  destinationStation: string;
  destinationStationRoad: string | null;
  wagonType: RailwayWagonType;
  rentCost: number | null;
  tariffCost: number | null;
  demurragePenalty: string | null;
  carrier: string | null;
  wagonNumber: string | null;
  expectedArrivalDate: string | null;
  currentLocation: string | null;
  /**
   * Причина последнего отклонения на согласовании и этап, на котором её
   * написали. Пара живёт до следующего решения того же этапа: одобрение её
   * снимает, потому что колонка отвечает на вопрос «почему заявка вернулась»,
   * а не хранит историю — история лежит в `railway_wagon_revisions`.
   */
  declineComment: string | null;
  declineStageId: string | null;
  /** Заявка, которой перевыставлен забракованный вагон. */
  replacedByOrderId: string | null;
  cargoLines: RailwayWagonCargoLine[];
  createdAt: string;
} & Record<RailwayWagonStageField, string | null>;

/**
 * Этапы формы. `requires` — метка предыдущего этапа, без которой этап не
 * открывается; `stamps` — метка, которую этап проставляет текущим временем.
 * Этап «Местонахождение» меток не ставит: станцию стоянки сотрудник по РЖД
 * переписывает столько раз, сколько вагон переезжает.
 */
export type RailwayWagonStage = {
  id: string;
  label: string;
  editors: readonly RailwayWagonRole[];
  requires: RailwayWagonStageField | null;
  stamps: RailwayWagonStageField | null;
  /**
   * Есть только у этапов согласования: они решаются двумя кнопками, и
   * отклонение вместо своей метки снимает перечисленные здесь — заявка
   * возвращается на тот шаг, где условия ещё можно переписать.
   */
  declines?: readonly RailwayWagonStageField[];
};

export function isRailwayWagonDecisionStage(stage: RailwayWagonStage) {
  return stage.declines !== undefined;
}

export const railwayWagonStages: readonly RailwayWagonStage[] = [
  {
    id: "carriage_terms",
    label: "Условия перевозки",
    editors: ["carrier"],
    requires: "orderedAt",
    stamps: "pricingStartedAt",
  },
  {
    id: "logistics_approval",
    label: "Согласование логистом",
    editors: ["logistics"],
    requires: "pricingStartedAt",
    stamps: "logisticsApprovedAt",
    declines: ["pricingStartedAt"],
  },
  {
    id: "manager_approval",
    label: "Согласование менеджером",
    editors: ["sales"],
    requires: "logisticsApprovedAt",
    stamps: "managerApprovedAt",
    // Менеджер спорит о той же стоимости, поэтому отклонение снимает и
    // согласование логиста: одобрять он будет уже другие условия.
    declines: ["pricingStartedAt", "logisticsApprovedAt"],
  },
  {
    id: "wagon_number",
    label: "Номер вагона",
    editors: ["carrier"],
    requires: "managerApprovedAt",
    stamps: "specificationSignedAt",
  },
  {
    id: "dispatch",
    label: "Подача на станцию погрузки",
    editors: ["carrier"],
    requires: "specificationSignedAt",
    stamps: "enRouteAt",
  },
  {
    id: "location",
    label: "Местонахождение",
    editors: ["carrier"],
    requires: "enRouteAt",
    stamps: null,
  },
  {
    id: "at_loading_station",
    label: "На станции погрузки",
    editors: ["carrier"],
    requires: "enRouteAt",
    stamps: "atLoadingStationAt",
  },
  {
    id: "rejected",
    label: "Забракован",
    editors: ["carrier"],
    requires: "specificationSignedAt",
    stamps: "rejectedAt",
  },
  {
    id: "at_shipper_track",
    label: "На ПНП грузоотправителя",
    editors: ["carrier"],
    requires: "atLoadingStationAt",
    stamps: "atShipperTrackAt",
  },
  {
    id: "at_loading",
    label: "На погрузке",
    editors: ["carrier"],
    requires: "atShipperTrackAt",
    stamps: "atLoadingAt",
  },
  {
    id: "loaded",
    label: "Загружен, на вывод с территории погрузки",
    editors: ["carrier", "dispatcher"],
    requires: "atLoadingAt",
    stamps: "loadedAt",
  },
  {
    id: "accepted_for_carriage",
    label: "Принято к перевозке в сторону грузополучателя",
    editors: ["carrier", "dispatcher"],
    requires: "loadedAt",
    stamps: "acceptedForCarriageAt",
  },
  {
    id: "delivered",
    label: "Доставлен на станцию назначения грузополучателя",
    editors: ["carrier"],
    requires: "acceptedForCarriageAt",
    stamps: "deliveredAt",
  },
  {
    id: "unloaded",
    label: "Вагон разгружен",
    editors: ["sales", "dispatcher"],
    requires: "deliveredAt",
    stamps: "unloadedAt",
  },
  {
    id: "released",
    label: "Вагон выведен",
    editors: ["carrier", "dispatcher"],
    requires: "unloadedAt",
    stamps: "releasedAt",
  },
];

export function findRailwayWagonStage(stageId: string) {
  return railwayWagonStages.find((stage) => stage.id === stageId);
}

type RailwayWagonStageState = Record<RailwayWagonStageField, string | null>;

function isStamped(order: RailwayWagonStageState, field: RailwayWagonStageField) {
  const value = order[field];
  return value !== null && value.trim().length > 0;
}

/** Забракованный вагон перевыставляют новой заявкой, а эту больше не ведут. */
export function isRailwayWagonRejected(order: RailwayWagonStageState) {
  return isStamped(order, "rejectedAt");
}

export function isRailwayWagonClosed(order: RailwayWagonStageState) {
  return isRailwayWagonRejected(order) || isStamped(order, "releasedAt");
}

/**
 * Этап открыт, когда проставлена метка предыдущего этапа и ещё не проставлена
 * собственная. Брак — ветка лестницы: его отмечают, пока вагон не встал на ПНП
 * грузоотправителя, дальше вагон уже принят и бракуют его не здесь.
 */
export function isRailwayWagonStageAvailable(
  order: RailwayWagonStageState,
  stage: RailwayWagonStage,
) {
  if (isRailwayWagonRejected(order)) return false;
  if (stage.requires !== null && !isStamped(order, stage.requires)) return false;

  if (stage.stamps === "rejectedAt") {
    return !isStamped(order, "atShipperTrackAt");
  }

  if (stage.stamps === null) {
    return !isStamped(order, "releasedAt");
  }

  return !isStamped(order, stage.stamps);
}

export function canEditRailwayWagonStage(
  order: RailwayWagonStageState,
  stage: RailwayWagonStage,
  roles: readonly RailwayWagonRole[],
) {
  return (
    isRailwayWagonStageAvailable(order, stage) &&
    stage.editors.some((editor) => roles.includes(editor))
  );
}

export function selectAvailableRailwayWagonStages(
  order: RailwayWagonStageState,
  roles: readonly RailwayWagonRole[],
) {
  return railwayWagonStages.filter((stage) =>
    canEditRailwayWagonStage(order, stage, roles),
  );
}

/**
 * Статус нахождения (колонка O) не хранится: это последний по лестнице этап с
 * проставленной датой. Забракованный вагон закрыт, поэтому брак перекрывает
 * всё, что было отмечено раньше.
 */
export function resolveRailwayWagonStatus(order: RailwayWagonStageState) {
  if (isRailwayWagonRejected(order)) {
    return railwayWagonStatusLabels.rejectedAt;
  }

  let status = railwayWagonStatusLabels.orderedAt;

  for (const field of railwayWagonStageFields) {
    if (field !== "rejectedAt" && isStamped(order, field)) {
      status = railwayWagonStatusLabels[field];
    }
  }

  return status;
}

export type RailwayWagonTotals = {
  palletCount: number;
  palletWeight: number;
  cargoWeight: number;
  securingWeight: number;
  totalWeight: number;
};

/** Округление до трёх знаков — столько же держит `decimal(14,3)` в БД. */
function roundWeight(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Колонка J: «Кол-во паллет × Вес каждой паллеты». */
export function calculateRailwayCargoLineWeight(
  line: Pick<RailwayWagonCargoLine, "palletCount" | "palletWeight">,
) {
  if (line.palletCount === null || line.palletWeight === null) return 0;
  return roundWeight(line.palletCount * line.palletWeight);
}

/** Колонка N: «Итоговый вес груза в вагоне + Вес крепежа в вагоне». */
export function buildRailwayWagonTotals(
  cargoLines: readonly RailwayWagonCargoLine[],
): RailwayWagonTotals {
  let palletCount = 0;
  let palletWeight = 0;
  let cargoWeight = 0;
  let securingWeight = 0;

  for (const line of cargoLines) {
    palletCount += line.palletCount ?? 0;
    palletWeight += line.palletWeight ?? 0;
    cargoWeight += calculateRailwayCargoLineWeight(line);
    securingWeight += line.securingWeight ?? 0;
  }

  return {
    palletCount,
    palletWeight: roundWeight(palletWeight),
    cargoWeight: roundWeight(cargoWeight),
    securingWeight: roundWeight(securingWeight),
    totalWeight: roundWeight(cargoWeight + securingWeight),
  };
}

export type RailwayStationOption = {
  name: string;
  road: string | null;
};

export type RailwayEtsngOption = {
  code: string;
  name: string;
};

export type RailwaySecuringMethodOption = {
  name: string;
  description: string | null;
};
