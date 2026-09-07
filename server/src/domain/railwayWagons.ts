import {
  railwayWagonMovementDirections,
  railwayWagonTypes,
  type RailwayWagonCargoLine,
  type RailwayWagonMovementDirection,
  type RailwayWagonType,
} from "../contracts/railwayWagons.js";

/**
 * Задача 106: разбор данных раздела «ЖД Вагоны». Заявку и каждый этап
 * проверяет собственный валидатор, потому что поля этапов принадлежат разным
 * должностям и приходят в разных запросах.
 */
export type RailwayWagonOrderSubmission = {
  contractReference: string;
  movementDirection: RailwayWagonMovementDirection;
  destinationStation: string;
  destinationStationRoad: string | null;
  wagonType: RailwayWagonType;
  cargoLines: RailwayWagonCargoLine[];
};

export type RailwayWagonCarriageTermsSubmission = {
  rentCost: number;
  tariffCost: number;
  demurragePenalty: string;
  carrier: string;
};

export type RailwayWagonNumberSubmission = {
  wagonNumber: string;
};

export type RailwayWagonDispatchSubmission = {
  expectedArrivalDate: string;
  currentLocation: string | null;
};

export type RailwayWagonLocationSubmission = {
  currentLocation: string;
};

export type RailwayWagonValidation<Value> =
  | { ok: true; value: Value }
  | { ok: false; errors: string[] };

export const maxRailwayWagonCargoLines = 50;

const maxContractReferenceLength = 255;
const maxStationLength = 160;
const maxStationRoadLength = 40;
const maxCargoNameLength = 255;
const maxEtsngCodeLength = 10;
const maxEtsngNameLength = 400;
const maxSecuringMethodLength = 255;
const maxCarrierLength = 255;
const maxPenaltyLength = 1000;
const maxLocationLength = 255;
const maxWagonNumberLength = 40;
const maxPalletCount = 1_000_000;
const maxWeight = 1_000_000;
const maxDimension = 100_000;
const maxCost = 1_000_000_000;

const cargoLineKeys = new Set([
  "cargoName",
  "etsngCode",
  "etsngName",
  "palletCount",
  "palletWeight",
  "palletWidth",
  "palletHeight",
  "palletLength",
  "securingMethod",
  "securingWeight",
]);

/** Этап 1: заявка менеджера по продажам вместе с вложенной таблицей грузов. */
export function validateRailwayWagonOrderSubmission(
  input: unknown,
): RailwayWagonValidation<RailwayWagonOrderSubmission> {
  if (!isRecord(input)) {
    return { ok: false, errors: ["Передайте данные заявки."] };
  }

  const errors: string[] = [];

  const contractReference = readText(
    input.contractReference,
    maxContractReferenceLength,
  );
  if (contractReference === undefined) {
    errors.push("Проверьте поле «Номер и дата договора с грузополучателем».");
  }

  const movementDirection = readOption(
    input.movementDirection,
    railwayWagonMovementDirections,
  );
  if (movementDirection === undefined) {
    errors.push("Проверьте поле «Направление движения».");
  }

  const destinationStation = readText(input.destinationStation, maxStationLength);
  if (destinationStation === undefined) {
    errors.push("Проверьте поле «Станция назначения».");
  }

  const destinationStationRoad = readNullableText(
    input.destinationStationRoad,
    maxStationRoadLength,
  );
  if (destinationStationRoad === undefined) {
    errors.push("Проверьте дорогу станции назначения.");
  }

  const wagonType = readOption(input.wagonType, railwayWagonTypes);
  if (wagonType === undefined) {
    errors.push("Проверьте поле «Вид вагона».");
  }

  const cargoLines = readCargoLines(input.cargoLines, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      contractReference: contractReference!,
      movementDirection: movementDirection!,
      destinationStation: destinationStation!,
      destinationStationRoad: destinationStationRoad!,
      wagonType: wagonType!,
      cargoLines,
    },
  };
}

/** Этап 2: условия перевозки от сотрудника по работе с РЖД. */
export function validateRailwayWagonCarriageTermsSubmission(
  input: unknown,
): RailwayWagonValidation<RailwayWagonCarriageTermsSubmission> {
  if (!isRecord(input)) {
    return { ok: false, errors: ["Передайте условия перевозки."] };
  }

  const errors: string[] = [];

  const rentCost = readAmount(input.rentCost, maxCost);
  if (rentCost === undefined || rentCost === null) {
    errors.push("Проверьте поле «Стоимость аренды, руб.».");
  }

  const tariffCost = readAmount(input.tariffCost, maxCost);
  if (tariffCost === undefined || tariffCost === null) {
    errors.push("Проверьте поле «Стоимость тарифа РЖД до места назначения, руб.».");
  }

  const demurragePenalty = readText(input.demurragePenalty, maxPenaltyLength);
  if (demurragePenalty === undefined) {
    errors.push("Проверьте поле «Штраф за простой».");
  }

  const carrier = readText(input.carrier, maxCarrierLength);
  if (carrier === undefined) {
    errors.push("Проверьте поле «Грузоперевозчик».");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      rentCost: rentCost!,
      tariffCost: tariffCost!,
      demurragePenalty: demurragePenalty!,
      carrier: carrier!,
    },
  };
}

/** Этап 5: номер вагона от сотрудника по работе с РЖД. */
export function validateRailwayWagonNumberSubmission(
  input: unknown,
): RailwayWagonValidation<RailwayWagonNumberSubmission> {
  if (!isRecord(input)) {
    return { ok: false, errors: ["Передайте номер вагона."] };
  }

  const wagonNumber = readText(input.wagonNumber, maxWagonNumberLength);
  if (wagonNumber === undefined || !/^\d+$/u.test(wagonNumber.replace(/\s/gu, ""))) {
    return { ok: false, errors: ["Проверьте поле «Номер вагона»."] };
  }

  return { ok: true, value: { wagonNumber } };
}

/** Этап 6: ожидаемая дата прибытия и, при желании, станция стоянки. */
export function validateRailwayWagonDispatchSubmission(
  input: unknown,
): RailwayWagonValidation<RailwayWagonDispatchSubmission> {
  if (!isRecord(input)) {
    return { ok: false, errors: ["Передайте данные подачи вагона."] };
  }

  const errors: string[] = [];

  const expectedArrivalDate = readCalendarDate(input.expectedArrivalDate);
  if (expectedArrivalDate === undefined) {
    errors.push("Проверьте поле «Ожидаемая дата прибытия».");
  }

  const currentLocation = readNullableText(input.currentLocation, maxLocationLength);
  if (currentLocation === undefined) {
    errors.push("Проверьте поле «Местонахождение».");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      expectedArrivalDate: expectedArrivalDate!,
      currentLocation: currentLocation!,
    },
  };
}

/** Станцию стоянки переписывают столько раз, сколько вагон переезжает. */
export function validateRailwayWagonLocationSubmission(
  input: unknown,
): RailwayWagonValidation<RailwayWagonLocationSubmission> {
  if (!isRecord(input)) {
    return { ok: false, errors: ["Передайте местонахождение вагона."] };
  }

  const currentLocation = readText(input.currentLocation, maxLocationLength);
  if (currentLocation === undefined) {
    return { ok: false, errors: ["Проверьте поле «Местонахождение»."] };
  }

  return { ok: true, value: { currentLocation } };
}

/**
 * Вложенная таблица грузов: наименование обязательно, остальные колонки могут
 * быть пустыми, пока менеджер уточняет характеристики. Неизвестные ключи
 * отклоняются, чтобы в payload не приезжали поля чужих этапов.
 */
function readCargoLines(value: unknown, errors: string[]): RailwayWagonCargoLine[] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push("Добавьте хотя бы одну строку груза.");
    return [];
  }

  if (value.length > maxRailwayWagonCargoLines) {
    errors.push(
      `Строк груза не может быть больше ${maxRailwayWagonCargoLines}.`,
    );
    return [];
  }

  const lines: RailwayWagonCargoLine[] = [];

  value.forEach((rawLine, index) => {
    const position = index + 1;

    if (!isRecord(rawLine)) {
      errors.push(`Проверьте строку груза ${position}.`);
      return;
    }

    for (const key of Object.keys(rawLine)) {
      if (!cargoLineKeys.has(key)) {
        errors.push(`Строка груза ${position} содержит неизвестное поле.`);
        return;
      }
    }

    const cargoName = readText(rawLine.cargoName, maxCargoNameLength);
    if (cargoName === undefined) {
      errors.push(`Проверьте «Название груза» в строке ${position}.`);
      return;
    }

    const etsngCode = readNullableText(rawLine.etsngCode, maxEtsngCodeLength);
    const etsngName = readNullableText(rawLine.etsngName, maxEtsngNameLength);
    const palletCount = readNullableCount(rawLine.palletCount, maxPalletCount);
    const palletWeight = readAmount(rawLine.palletWeight, maxWeight);
    const palletWidth = readAmount(rawLine.palletWidth, maxDimension);
    const palletHeight = readAmount(rawLine.palletHeight, maxDimension);
    const palletLength = readAmount(rawLine.palletLength, maxDimension);
    const securingMethod = readNullableText(
      rawLine.securingMethod,
      maxSecuringMethodLength,
    );
    const securingWeight = readAmount(rawLine.securingWeight, maxWeight);

    if (
      etsngCode === undefined ||
      etsngName === undefined ||
      palletCount === undefined ||
      palletWeight === undefined ||
      palletWidth === undefined ||
      palletHeight === undefined ||
      palletLength === undefined ||
      securingMethod === undefined ||
      securingWeight === undefined
    ) {
      errors.push(`Проверьте числовые значения в строке груза ${position}.`);
      return;
    }

    lines.push({
      cargoName,
      etsngCode,
      etsngName,
      palletCount,
      palletWeight,
      palletWidth,
      palletHeight,
      palletLength,
      securingMethod,
      securingWeight,
    });
  });

  return lines;
}

function readOption<Option extends string>(
  value: unknown,
  options: readonly Option[],
) {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? (value as Option)
    : undefined;
}

function readText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : undefined;
}

function readNullableText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length === 0) return null;
  return normalized.length <= maxLength ? normalized : undefined;
}

function readNullableCount(value: unknown, maxValue: number) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length === 0) return null;
    if (!/^\d+$/u.test(normalized)) return undefined;
    const parsed = Number(normalized);
    return parsed <= maxValue ? parsed : undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value >= 0 && value <= maxValue ? value : undefined;
}

/** Десятичная запятая приходит из русской раскладки и считается допустимой. */
function readAmount(value: unknown, maxValue: number) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (normalized.length === 0) return null;
    if (!/^\d+(?:\.\d+)?$/u.test(normalized)) return undefined;
    const parsed = Number(normalized);
    return parsed <= maxValue ? parsed : undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value >= 0 && value <= maxValue ? value : undefined;
}

function readCalendarDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return undefined;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
