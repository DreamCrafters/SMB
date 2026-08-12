import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import {
  isRefractoryWagonAwaitingInspection,
  type RefractoryWagonInspectionRecord,
  type RefractoryWagonInspectionSubmission,
} from "../contracts/refractoryWagons.js";
import type { DatabasePool } from "../db/pool.js";

export class RefractoryWagonInspectionNotAllowedError extends Error {
  constructor() {
    super("The refractory wagon is not awaiting an inspection.");
    this.name = "RefractoryWagonInspectionNotAllowedError";
  }
}

export type RefractoryWagonInspectionsRepository = {
  list: () => Promise<RefractoryWagonInspectionRecord[]>;
  create: (input: {
    inspection: RefractoryWagonInspectionSubmission;
    inspectedByUserId: string;
    inspectedByAccountId: string;
    inspectedByDisplayName: string;
  }) => Promise<RefractoryWagonInspectionRecord | undefined>;
};

type InspectionRow = RowDataPacket & {
  id: string;
  wagon_id: string;
  wagon_number: string;
  condition_value: string;
  approval_date: Date | string;
  sorting_date: Date | string | null;
  inspected_by_display_name: string;
  created_at: Date | string;
};

type WagonStateRow = RowDataPacket & {
  id: string;
  wagon_number: string;
  post_firing_condition: string | null;
  service_approval_date: Date | string | null;
};

type SortingDateRow = RowDataPacket & { sorting_date: Date | string | null };

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const maxListedInspections = 200;

export function createRefractoryWagonInspectionsRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): RefractoryWagonInspectionsRepository {
  return {
    async list() {
      const [rows] = await pool.query<InspectionRow[]>(
        `select
          inspections.id,
          inspections.wagon_id,
          wagons.wagon_number,
          inspections.condition_value,
          inspections.approval_date,
          inspections.sorting_date,
          inspections.inspected_by_display_name,
          inspections.created_at
        from refractory_wagon_inspections inspections
        inner join refractory_wagons wagons on wagons.id = inspections.wagon_id
        order by inspections.sequence_id desc
        limit ${maxListedInspections}`,
      );
      return rows.map(mapInspectionRow);
    },

    async create(input) {
      const [wagonRows] = await pool.query<WagonStateRow[]>(
        `select id, wagon_number, post_firing_condition, service_approval_date
        from refractory_wagons
        where id = ?
        limit 1
        for update`,
        [input.inspection.wagonId],
      );
      const wagon = wagonRows[0];
      if (wagon === undefined) return undefined;

      const [sortingRows] = await pool.query<SortingDateRow[]>(
        `select max(event_date) as sorting_date
        from refractory_wagon_lifecycle_events
        where wagon_id = ? and event_type = 'sorting'`,
        [input.inspection.wagonId],
      );
      const sortingDate = formatOptionalCalendarDate(
        sortingRows[0]?.sorting_date ?? null,
      );
      const isAwaitingInspection = isRefractoryWagonAwaitingInspection({
        postFiringCondition: wagon.post_firing_condition,
        serviceApprovalDate: formatOptionalCalendarDate(
          wagon.service_approval_date,
        ),
        sortingDate,
      });
      if (!isAwaitingInspection) {
        throw new RefractoryWagonInspectionNotAllowedError();
      }

      const id = createId();
      const createdAt = now().toISOString();
      await pool.query(
        `insert into refractory_wagon_inspections (
          id,
          wagon_id,
          condition_value,
          approval_date,
          sorting_date,
          inspected_by_user_id,
          inspected_by_account_id,
          inspected_by_display_name,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.inspection.wagonId,
          input.inspection.condition,
          input.inspection.approvalDate,
          sortingDate,
          input.inspectedByUserId,
          input.inspectedByAccountId,
          input.inspectedByDisplayName,
          createdAt,
        ],
      );
      await pool.query(
        `update refractory_wagons
        set post_firing_condition = ?, service_approval_date = ?
        where id = ?`,
        [
          input.inspection.condition,
          input.inspection.approvalDate,
          input.inspection.wagonId,
        ],
      );

      return {
        id,
        wagonId: input.inspection.wagonId,
        wagonNumber: wagon.wagon_number,
        sortingDate,
        condition: input.inspection.condition,
        approvalDate: input.inspection.approvalDate,
        inspectedByDisplayName: input.inspectedByDisplayName,
        createdAt,
      };
    },
  };
}

function mapInspectionRow(row: InspectionRow): RefractoryWagonInspectionRecord {
  return {
    id: row.id,
    wagonId: row.wagon_id,
    wagonNumber: row.wagon_number,
    sortingDate: formatOptionalCalendarDate(row.sorting_date),
    condition: row.condition_value === "В ремонт"
      ? "В ремонт"
      : "Можно эксплуатировать",
    approvalDate: formatOptionalCalendarDate(row.approval_date)!,
    inspectedByDisplayName: row.inspected_by_display_name,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}

function formatOptionalCalendarDate(value: Date | string | null) {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}
