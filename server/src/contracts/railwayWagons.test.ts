import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRailwayWagonTotals,
  calculateRailwayCargoLineWeight,
  findRailwayWagonStage,
  isRailwayWagonDecisionStage,
  isRailwayWagonStageAvailable,
  railwayWagonStageFields,
  railwayWagonStages,
  railwayWagonStatusLabels,
  railwayWagonStatuses,
  resolveRailwayWagonRoles,
  resolveRailwayWagonStatus,
  selectAvailableRailwayWagonStages,
  type RailwayWagonCargoLine,
  type RailwayWagonStageField,
} from "./railwayWagons.js";

test("status ladder repeats the fifteen values of the specification", () => {
  assert.equal(railwayWagonStatuses.length, 15);
  assert.equal(railwayWagonStatuses[0], "Заказан");
  assert.equal(railwayWagonStatuses.at(-1), "Вагон выведен");
});

test("status is the last stamped step of the ladder", () => {
  assert.equal(
    resolveRailwayWagonStatus(buildStages(["orderedAt"])),
    "Заказан",
  );
  assert.equal(
    resolveRailwayWagonStatus(
      buildStages(["orderedAt", "pricingStartedAt", "logisticsApprovedAt"]),
    ),
    "Согласовано логистом",
  );
  assert.equal(
    resolveRailwayWagonStatus(
      buildStages([...railwayWagonStageFields].filter(
        (field) => field !== "rejectedAt",
      )),
    ),
    "Вагон выведен",
  );
});

test("a rejected wagon keeps the rejection status over earlier steps", () => {
  assert.equal(
    resolveRailwayWagonStatus(
      buildStages([
        "orderedAt",
        "pricingStartedAt",
        "logisticsApprovedAt",
        "managerApprovedAt",
        "specificationSignedAt",
        "enRouteAt",
        "atLoadingStationAt",
        "rejectedAt",
      ]),
    ),
    "Забракован",
  );
});

test("a stage opens only after the previous one is stamped", () => {
  const terms = findRailwayWagonStage("carriage_terms")!;
  const logistics = findRailwayWagonStage("logistics_approval")!;

  assert.equal(isRailwayWagonStageAvailable(buildStages([]), terms), false);
  assert.equal(
    isRailwayWagonStageAvailable(buildStages(["orderedAt"]), terms),
    true,
  );
  assert.equal(
    isRailwayWagonStageAvailable(buildStages(["orderedAt"]), logistics),
    false,
  );
  assert.equal(
    isRailwayWagonStageAvailable(
      buildStages(["orderedAt", "pricingStartedAt"]),
      logistics,
    ),
    true,
  );
});

test("a stamped stage does not open a second time", () => {
  const terms = findRailwayWagonStage("carriage_terms")!;

  assert.equal(
    isRailwayWagonStageAvailable(
      buildStages(["orderedAt", "pricingStartedAt"]),
      terms,
    ),
    false,
  );
});

test("the manager approves only after the logistics director", () => {
  const managerApproval = findRailwayWagonStage("manager_approval")!;

  assert.equal(
    isRailwayWagonStageAvailable(
      buildStages(["orderedAt", "pricingStartedAt"]),
      managerApproval,
    ),
    false,
  );
  assert.equal(
    isRailwayWagonStageAvailable(
      buildStages(["orderedAt", "pricingStartedAt", "logisticsApprovedAt"]),
      managerApproval,
    ),
    true,
  );
});

test("rejection stays open until the wagon reaches the shipper track", () => {
  const rejected = findRailwayWagonStage("rejected")!;
  const beforeShipperTrack = buildStages([
    "orderedAt",
    "pricingStartedAt",
    "logisticsApprovedAt",
    "managerApprovedAt",
    "specificationSignedAt",
    "enRouteAt",
    "atLoadingStationAt",
  ]);

  assert.equal(
    isRailwayWagonStageAvailable(beforeShipperTrack, rejected),
    true,
  );
  assert.equal(
    isRailwayWagonStageAvailable(
      { ...beforeShipperTrack, atShipperTrackAt: stamp },
      rejected,
    ),
    false,
  );
});

test("only the approval stages carry a decision", () => {
  assert.deepEqual(
    railwayWagonStages
      .filter(isRailwayWagonDecisionStage)
      .map(({ id, declines }) => [id, declines]),
    [
      ["logistics_approval", ["pricingStartedAt"]],
      ["manager_approval", ["pricingStartedAt", "logisticsApprovedAt"]],
    ],
  );
  assert.equal(
    isRailwayWagonDecisionStage(findRailwayWagonStage("carriage_terms")!),
    false,
  );
});

test("a rejected wagon closes every remaining stage", () => {
  const order = buildStages([
    "orderedAt",
    "pricingStartedAt",
    "logisticsApprovedAt",
    "managerApprovedAt",
    "specificationSignedAt",
    "enRouteAt",
    "rejectedAt",
  ]);

  assert.deepEqual(
    selectAvailableRailwayWagonStages(order, ["carrier", "sales", "dispatcher"]),
    [],
  );
});

test("stages are offered only to the roles that fill them", () => {
  const order = buildStages(["orderedAt"]);

  assert.deepEqual(
    selectAvailableRailwayWagonStages(order, ["carrier"]).map(({ id }) => id),
    ["carriage_terms"],
  );
  assert.deepEqual(selectAvailableRailwayWagonStages(order, ["sales"]), []);
});

test("the dispatcher shares the movement checkpoints of the specification", () => {
  const order = buildStages([
    "orderedAt",
    "pricingStartedAt",
    "logisticsApprovedAt",
    "managerApprovedAt",
    "specificationSignedAt",
    "enRouteAt",
    "atLoadingStationAt",
    "atShipperTrackAt",
    "atLoadingAt",
  ]);

  assert.deepEqual(
    selectAvailableRailwayWagonStages(order, ["dispatcher"]).map(({ id }) => id),
    ["loaded"],
  );
});

test("roles come from the position capabilities", () => {
  assert.deepEqual(
    resolveRailwayWagonRoles([
      "business.view_railway_wagons",
      "business.manage_railway_wagon_carriage",
    ]),
    ["carrier"],
  );
  assert.deepEqual(resolveRailwayWagonRoles(["business.view_railway_wagons"]), []);
});

test("cargo totals sum the lines and add the securing weight", () => {
  const lines: RailwayWagonCargoLine[] = [
    buildCargoLine({ palletCount: 10, palletWeight: 1.25, securingWeight: 0.4 }),
    buildCargoLine({ palletCount: 4, palletWeight: 0.5, securingWeight: 0.1 }),
  ];

  assert.equal(calculateRailwayCargoLineWeight(lines[0]), 12.5);
  assert.deepEqual(buildRailwayWagonTotals(lines), {
    palletCount: 14,
    palletWeight: 1.75,
    cargoWeight: 14.5,
    securingWeight: 0.5,
    totalWeight: 15,
  });
});

test("an unfilled line adds nothing to the totals", () => {
  assert.deepEqual(buildRailwayWagonTotals([buildCargoLine({})]), {
    palletCount: 0,
    palletWeight: 0,
    cargoWeight: 0,
    securingWeight: 0,
    totalWeight: 0,
  });
});

const stamp = "2026-09-07T08:00:00.000Z";

function buildStages(filled: readonly RailwayWagonStageField[]) {
  return Object.fromEntries(
    railwayWagonStageFields.map((field) => [
      field,
      filled.includes(field) ? stamp : null,
    ]),
  ) as Record<RailwayWagonStageField, string | null>;
}

function buildCargoLine(
  overrides: Partial<RailwayWagonCargoLine>,
): RailwayWagonCargoLine {
  return {
    cargoName: "ШБ-5",
    etsngCode: null,
    etsngName: null,
    palletCount: null,
    palletWeight: null,
    palletWidth: null,
    palletHeight: null,
    palletLength: null,
    securingMethod: null,
    securingWeight: null,
    ...overrides,
  };
}

test("every ladder step has a Russian status label", () => {
  for (const field of railwayWagonStageFields) {
    assert.equal(typeof railwayWagonStatusLabels[field], "string");
  }
});
