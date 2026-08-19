export const bankNumbers = [1, 2, 3] as const;
export type BankNumber = (typeof bankNumbers)[number];

export type BankVolumeReferencePoint = {
  heightMeters: number;
  volumeCubicMeters: number;
};

export type BankVolumeReference = {
  points: readonly BankVolumeReferencePoint[];
};

/**
 * Насыпной вес банки берётся из среднего по последним записям журнала печи 2;
 * `laboratory_result` остаётся только у назначений, сохранённых до этого.
 */
export const bankBulkDensitySources = [
  "rotary_kiln_2_journal",
  "laboratory_result",
] as const;
export type BankBulkDensitySource = (typeof bankBulkDensitySources)[number];

export type BankAssignmentSnapshot = {
  assignmentId: string;
  bankNumber: BankNumber;
  materialLabel: string;
  bulkDensityTonsPerCubicMeter: number;
  bulkDensitySource: BankBulkDensitySource;
  /** Сколько записей журнала печи 2 усреднено для текущего насыпного веса. */
  bulkDensitySampleCount?: number;
  /** Последняя дата лабораторной записи, вошедшей в актуальный расчёт. */
  bulkDensityLatestRecordDate?: string;
  laboratoryResultId?: string;
  sampleIndex?: number;
  sampleIdentifier?: string;
  assignedAt: string;
};

export type BankMeasurementCalculation = {
  bankNumber: BankNumber;
  bankLabel: string;
  material: string;
  assignmentId: string;
  bulkDensitySource: BankBulkDensitySource;
  bulkDensitySampleCount?: number;
  laboratoryResultId?: string;
  sampleIndex?: number;
  sampleIdentifier?: string;
  assignmentAssignedAt: string;
  measurements: number[];
  averageHeightMeters: number;
  volumeCubicMeters: number;
  bulkDensityTonsPerCubicMeter: number;
  materialMassTons: number;
  loadedTons: number;
  shippedTons: number;
  /** Отсчётная точка цепочки: вес по отгрузкам на начало этой записи. */
  shipmentBaseTons: number;
  shipmentMassTons: number;
};

export type BankMeasurementCalculationResult =
  | { ok: true; value: BankMeasurementCalculation }
  | {
      ok: false;
      error: string;
      field?: "measurements" | "loadedTons" | "shippedTons";
    };

export type CoshBankMeasurementInput = {
  bankNumber: BankNumber;
  values: readonly number[];
  loadedTons?: number;
  shippedTons?: number;
};

/**
 * Вес по отгрузкам ведёт собственную цепочку: базой служит предыдущий вес по
 * отгрузкам этой же банки, а не её вес по замерам за текущую смену. Материал
 * прошлой записи нужен, чтобы отследить смену содержимого банки: накопленный
 * баланс относится к прежнему материалу и вместе с ним заканчивается.
 */
export type PreviousBankShipment = {
  materialLabel: string;
  shipmentMassTons: number;
};

export type PreviousBankShipments = Partial<
  Record<BankNumber, PreviousBankShipment>
>;

export type CoshBankMeasurementCalculationResult =
  | { ok: true; value: BankMeasurementCalculation[] }
  | { ok: false; error: string; fieldPath?: string };

const bankLabels: Record<BankNumber, string> = {
  1: "I",
  2: "II",
  3: "III",
};

export function calculateBankMeasurement({
  assignment,
  measurements,
  loadedTons = 0,
  shippedTons = 0,
  previousShipment,
  volumeReference,
}: {
  assignment: BankAssignmentSnapshot;
  measurements: readonly number[];
  loadedTons?: number;
  shippedTons?: number;
  /** Предыдущая запись цепочки; без неё и при смене материала цепочка стартует с веса по замерам. */
  previousShipment?: PreviousBankShipment;
  volumeReference: BankVolumeReference;
}): BankMeasurementCalculationResult {
  if (measurements.length === 0) {
    return { ok: false, error: "Добавьте хотя бы один замер." };
  }

  const referenceError = validateVolumeReference(volumeReference);
  if (referenceError !== null) {
    return { ok: false, error: referenceError };
  }

  const minimumMeters = volumeReference.points[0]!.heightMeters;
  const maximumMeters = volumeReference.points.at(-1)!.heightMeters;
  if (
    measurements.some(
      (measurement) =>
        !Number.isFinite(measurement) ||
        measurement < minimumMeters ||
        measurement > maximumMeters,
    )
  ) {
    return {
      ok: false,
      error: `Замеры должны быть от ${minimumMeters} до ${maximumMeters} м.`,
    };
  }

  if (
    !Number.isFinite(assignment.bulkDensityTonsPerCubicMeter) ||
    assignment.bulkDensityTonsPerCubicMeter <= 0
  ) {
    return {
      ok: false,
      error: `Для банки ${bankLabels[assignment.bankNumber]} указан некорректный насыпной вес.`,
    };
  }

  if (
    !Number.isFinite(loadedTons) ||
    loadedTons < 0 ||
    !Number.isFinite(shippedTons) ||
    shippedTons < 0
  ) {
    return {
      ok: false,
      error: "Значения «Засыпали» и «Отгрузили» должны быть неотрицательными.",
    };
  }

  const averageHeightMeters =
    measurements.reduce((total, measurement) => total + measurement, 0) /
    measurements.length;
  const volumeCubicMeters = readVolumeCubicMeters(
    averageHeightMeters,
    volumeReference.points,
  );
  const materialMassTons =
    volumeCubicMeters * assignment.bulkDensityTonsPerCubicMeter;
  const shipmentBaseTons = readShipmentBaseTons(
    previousShipment,
    assignment.materialLabel,
    materialMassTons,
  );
  const shipmentMassTons = shipmentBaseTons + loadedTons - shippedTons;

  if (shipmentMassTons < 0) {
    return {
      ok: false,
      error: "Отгрузили больше расчётного остатка с учётом засыпки.",
      field: "shippedTons",
    };
  }

  return {
    ok: true,
    value: {
      bankNumber: assignment.bankNumber,
      bankLabel: bankLabels[assignment.bankNumber],
      material: assignment.materialLabel,
      assignmentId: assignment.assignmentId,
      bulkDensitySource: assignment.bulkDensitySource,
      ...(assignment.bulkDensitySampleCount === undefined
        ? {}
        : { bulkDensitySampleCount: assignment.bulkDensitySampleCount }),
      ...(assignment.bulkDensityLatestRecordDate === undefined
        ? {}
        : {
            bulkDensityLatestRecordDate:
              assignment.bulkDensityLatestRecordDate,
          }),
      ...(assignment.laboratoryResultId === undefined
        ? {}
        : { laboratoryResultId: assignment.laboratoryResultId }),
      ...(assignment.sampleIndex === undefined
        ? {}
        : { sampleIndex: assignment.sampleIndex }),
      ...(assignment.sampleIdentifier === undefined
        ? {}
        : { sampleIdentifier: assignment.sampleIdentifier }),
      assignmentAssignedAt: assignment.assignedAt,
      measurements: [...measurements],
      averageHeightMeters: roundToThreeDecimals(averageHeightMeters),
      volumeCubicMeters: roundToThreeDecimals(volumeCubicMeters),
      bulkDensityTonsPerCubicMeter:
        assignment.bulkDensityTonsPerCubicMeter,
      materialMassTons: roundToThreeDecimals(materialMassTons),
      loadedTons: roundToThreeDecimals(loadedTons),
      shippedTons: roundToThreeDecimals(shippedTons),
      shipmentBaseTons: roundToThreeDecimals(shipmentBaseTons),
      shipmentMassTons: roundToThreeDecimals(shipmentMassTons),
    },
  };
}

export function calculateCoshBankMeasurements({
  assignments,
  measurements,
  previousShipments,
  volumeReference,
}: {
  assignments: readonly BankAssignmentSnapshot[];
  measurements: readonly CoshBankMeasurementInput[];
  /** Server-owned предыдущие записи цепочки; клиент их не передаёт. */
  previousShipments?: PreviousBankShipments;
  volumeReference: BankVolumeReference;
}): CoshBankMeasurementCalculationResult {
  const calculated: BankMeasurementCalculation[] = [];

  for (const bankNumber of bankNumbers) {
    const assignment = assignments.find(
      (candidate) => candidate.bankNumber === bankNumber,
    );
    if (assignment === undefined) {
      return {
        ok: false,
        error: `Лаборатория должна назначить содержимое банки ${bankLabels[bankNumber]}.`,
      };
    }

    const measurement = measurements.find(
      (candidate) => candidate.bankNumber === bankNumber,
    );
    if (measurement === undefined || measurement.values.length === 0) {
      return {
        ok: false,
        error: `Добавьте хотя бы один замер для банки ${bankLabels[bankNumber]}.`,
      };
    }

    const result = calculateBankMeasurement({
      assignment,
      measurements: measurement.values,
      loadedTons: measurement.loadedTons,
      shippedTons: measurement.shippedTons,
      previousShipment: previousShipments?.[bankNumber],
      volumeReference,
    });
    if (!result.ok) {
      const measurementIndex = measurements.indexOf(measurement);
      return {
        ok: false,
        error: `Банка ${bankLabels[bankNumber]}: ${result.error}`,
        ...(result.field === undefined || measurementIndex < 0
          ? {}
          : {
              fieldPath: `jarMeasurements.${measurementIndex}.${result.field}`,
            }),
      };
    }

    calculated.push(result.value);
  }

  return { ok: true, value: calculated };
}

/**
 * Отсчётная точка цепочки — смена материала в банке: пока содержимое прежнее,
 * база берётся из предыдущего веса по отгрузкам, а на новом материале и на
 * legacy-записях без сохранённой базы цепочка начинается с веса по замерам.
 */
function readShipmentBaseTons(
  previousShipment: PreviousBankShipment | undefined,
  materialLabel: string,
  materialMassTons: number,
) {
  if (
    previousShipment === undefined ||
    !Number.isFinite(previousShipment.shipmentMassTons) ||
    previousShipment.shipmentMassTons < 0 ||
    !isSameBankMaterial(previousShipment.materialLabel, materialLabel)
  ) {
    return materialMassTons;
  }

  return previousShipment.shipmentMassTons;
}

function isSameBankMaterial(first: string, second: string) {
  return normalizeBankMaterial(first) === normalizeBankMaterial(second) &&
    normalizeBankMaterial(first).length > 0;
}

function normalizeBankMaterial(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}

function validateVolumeReference(reference: BankVolumeReference) {
  if (reference.points.length < 2) {
    return "В справочнике «Банки» недостаточно данных для расчёта объёма.";
  }

  for (let index = 0; index < reference.points.length; index += 1) {
    const point = reference.points[index]!;
    const previousPoint = reference.points[index - 1];
    if (
      !Number.isFinite(point.heightMeters) ||
      !Number.isFinite(point.volumeCubicMeters) ||
      point.heightMeters < 0 ||
      point.volumeCubicMeters < 0 ||
      (previousPoint !== undefined &&
        point.heightMeters <= previousPoint.heightMeters)
    ) {
      return "Справочник «Банки» содержит некорректные значения.";
    }
  }

  return null;
}

function readVolumeCubicMeters(
  heightMeters: number,
  points: readonly BankVolumeReferencePoint[],
) {
  const upperIndex = points.findIndex(
    (point) => point.heightMeters >= heightMeters,
  );
  const upperPoint = points[upperIndex]!;

  if (upperIndex === 0 || upperPoint.heightMeters === heightMeters) {
    return upperPoint.volumeCubicMeters;
  }

  const lowerPoint = points[upperIndex - 1]!;
  const position =
    (heightMeters - lowerPoint.heightMeters) /
    (upperPoint.heightMeters - lowerPoint.heightMeters);

  return (
    lowerPoint.volumeCubicMeters +
    (upperPoint.volumeCubicMeters - lowerPoint.volumeCubicMeters) * position
  );
}

function roundToThreeDecimals(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000;
}
