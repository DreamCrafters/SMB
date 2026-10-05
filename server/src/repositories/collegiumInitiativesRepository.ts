import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import {
  collegiumInitiativesNavigationItem,
  type CollegiumAttachment,
  type CollegiumAttachmentFileType,
  collegiumReferenceKinds,
  type CollegiumInitiative,
  type CollegiumInitiativeComment,
  type CollegiumInitiativeRevision,
  type CollegiumMeeting,
  type CollegiumPerson,
  type CollegiumReference,
  type CollegiumReferenceKind,
} from "../contracts/collegiumInitiatives.js";
import { CollegiumInitiativeError } from "../domain/collegiumInitiative.js";
import {
  collegiumReminderLeaseSeconds,
  collegiumReminderMaxAttempts,
} from "../domain/collegiumReminders.js";

type InitiativeRow = RowDataPacket & {
  id: string;
  number: string;
  status: CollegiumInitiative["status"];
  revision: number;
  created_by_user_id: string;
  payload: string | object;
  workflow: string | object | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type CommentRow = RowDataPacket & {
  id: string;
  kind: CollegiumInitiativeComment["kind"];
  text: string;
  author_user_id: string;
  author_display_name: string;
  created_at: Date | string;
  resolved_at: Date | string | null;
  resolved_by_display_name: string | null;
};

type AttachmentRow = RowDataPacket & {
  id: string;
  kind: CollegiumAttachment["kind"];
  label: string;
  file_name: string | null;
  file_type: CollegiumAttachmentFileType | null;
  size_bytes: number | null;
  url: string | null;
  created_by_display_name: string;
  created_at: Date | string;
};

type MeetingRow = RowDataPacket & {
  id: string;
  number: string;
  status: CollegiumMeeting["status"];
  revision: number;
  payload: string | object;
  created_at: Date | string;
  updated_at: Date | string;
};

type MeetingPayload = Omit<
  CollegiumMeeting,
  "id" | "number" | "status" | "revision" | "createdAt" | "updatedAt"
>;

export type CollegiumReminderDelivery = {
  kind: string;
  subjectId: string;
  cycle: string;
  targetDate: string;
  offset: number;
  userId: string;
  channel: "email" | "max";
};

function reminderKey(delivery: CollegiumReminderDelivery) {
  return [
    delivery.kind,
    delivery.subjectId,
    delivery.cycle.slice(0, 100),
    delivery.targetDate,
    delivery.offset,
    delivery.userId,
    delivery.channel,
  ];
}

export type CollegiumAttachmentOwner = { type: "initiative" | "meeting"; id: string };

type RevisionRow = RowDataPacket & {
  revision: number;
  payload: string | object;
  created_at: Date | string;
};

type ReferenceRow = RowDataPacket & {
  kind: CollegiumReferenceKind;
  code: string;
  label: string;
  is_active: number;
  is_significant: number;
  unit: string;
};

/** Все значения справочника, архивные — с флагом. */
export async function readCollegiumReference(pool: DatabasePool, lock = false): Promise<CollegiumReference> {
  const [rows] = await pool.query<ReferenceRow[]>(
    `select kind, code, label, is_active, is_significant, unit from collegium_initiative_reference
     order by kind, sort_order, code${lock ? " for update" : ""}`,
  );
  const reference = Object.fromEntries(
    collegiumReferenceKinds.map((kind) => [kind, []]),
  ) as unknown as CollegiumReference;
  for (const row of rows) {
    reference[row.kind]?.push({
      code: row.code,
      label: row.label,
      ...(Number(row.is_active) === 1 ? {} : { archived: true }),
      ...(row.kind === "risk_level" ? { significant: Number(row.is_significant) === 1 } : {}),
      ...(row.kind === "kpi" ? { unit: row.unit } : {}),
    });
  }
  return reference;
}

type PersonRow = RowDataPacket & {
  user_id: string;
  display_name: string;
  position_name: string;
  navigation_items: unknown;
};

type SequenceRow = RowDataPacket & { last_value: number };

export type CollegiumNumberKind = "initiative" | "meeting";

export type CollegiumInitiativeRevisionInput = Omit<
  CollegiumInitiativeRevision,
  "createdAt"
> & { id: string; createdAt: Date };

/** Mutations must run inside the application's audited transaction. */
export function createCollegiumInitiativesRepository(pool: DatabasePool) {
  async function people(userId?: string, lock = false): Promise<CollegiumPerson[]> {
    // Lock only the account row: locking the join would also lock every
    // position row and serialize the module with position edits.
    if (lock && userId !== undefined) {
      await pool.query(
        "select id from app_users where id = ? and status = 'active' for update",
        [userId],
      );
    }
    const [rows] = await pool.query<PersonRow[]>(`
      select users.id as user_id, users.display_name, positions.display_name as position_name,
        positions.navigation_items
      from app_users users
      join account_accesses accesses on accesses.user_id = users.id
      join account_positions positions on json_contains(
        coalesce(accesses.position_codes, json_array(accesses.position_code)),
        json_quote(positions.id)
      )
      where users.status = 'active' and accesses.is_active = 1
        and accesses.scope_kind = 'organization'
        ${userId === undefined ? "" : "and users.id = ?"}
      order by users.display_name, users.id, positions.sort_order, positions.id`,
      userId === undefined ? [] : [userId]);
    const byUser = new Map<string, CollegiumPerson>();
    for (const row of rows) {
      const hasTab = readJsonList(row.navigation_items)
        .includes(collegiumInitiativesNavigationItem);
      const current = byUser.get(row.user_id);
      if (current === undefined) {
        byUser.set(row.user_id, {
          id: `account:${row.user_id}`,
          displayName: row.display_name,
          position: row.position_name,
          hasInitiativesTab: hasTab,
        });
        continue;
      }
      if (!current.position.split(" / ").includes(row.position_name)) {
        current.position += ` / ${row.position_name}`;
      }
      current.hasInitiativesTab ||= hasTab;
    }
    return [...byUser.values()];
  }

  return {
    listReference(): Promise<CollegiumReference> {
      return readCollegiumReference(pool);
    },

    listPeople() {
      return people();
    },

    /** Active account with its current positions; `lock` keeps it during the write. */
    async readPerson(accountId: string, lock = false) {
      if (!accountId.startsWith("account:")) return undefined;
      return (await people(accountId.slice("account:".length), lock))[0];
    },

    /** Active accounts whose current positions (any of them) grant the capability. */
    async listUserIdsWithCapability(capability: string) {
      const [rows] = await pool.query<(RowDataPacket & { user_id: string })[]>(`
        select distinct users.id as user_id
        from app_users users
        join account_accesses accesses on accesses.user_id = users.id
        join account_positions positions on json_contains(
          coalesce(accesses.position_codes, json_array(accesses.position_code)),
          json_quote(positions.id)
        )
        where users.status = 'active' and accesses.is_active = 1
          and json_contains(positions.capabilities, json_quote(?))`,
        [capability]);
      return rows.map((row) => row.user_id);
    },

    /**
     * Claims one reminder delivery: inserts the row once, then takes a lease if
     * it is not delivered, not leased and has attempts left.
     */
    async claimReminder(delivery: CollegiumReminderDelivery, token: string) {
      const key = reminderKey(delivery);
      await pool.query(
        `insert ignore into collegium_reminder_deliveries
          (kind, subject_id, cycle_key, target_date, offset_days, user_id, channel)
         values (?, ?, ?, ?, ?, ?, ?)`,
        key,
      );
      const [result] = await pool.query<ResultSetHeader>(
        `update collegium_reminder_deliveries
         set claim_token = ?, attempts = attempts + 1,
           lease_until = timestampadd(second, ?, utc_timestamp(3))
         where kind = ? and subject_id = ? and cycle_key = ? and target_date = ?
           and offset_days = ? and user_id = ? and channel = ?
           and delivered_at is null and attempts < ?
           and (lease_until is null or lease_until <= utc_timestamp(3))`,
        [token, collegiumReminderLeaseSeconds, ...key, collegiumReminderMaxAttempts],
      );
      return result.affectedRows === 1;
    },

    async completeReminder(delivery: CollegiumReminderDelivery, token: string) {
      await pool.query(
        `update collegium_reminder_deliveries
         set delivered_at = utc_timestamp(3), lease_until = null
         where kind = ? and subject_id = ? and cycle_key = ? and target_date = ?
           and offset_days = ? and user_id = ? and channel = ? and claim_token = ?`,
        [...reminderKey(delivery), token],
      );
    },

    /** Year counter of a number series; runs in the caller's transaction. */
    /**
     * One upsert takes the exclusive row lock at once: `insert ignore` followed
     * by `select … for update` upgrades a shared lock and deadlocks under load.
     */
    async nextNumber(kind: CollegiumNumberKind, year: number) {
      await pool.query(
        `insert into collegium_number_sequences (kind, year, last_value)
         values (?, ?, 1)
         on duplicate key update last_value = last_value + 1`,
        [kind, year],
      );
      const [rows] = await pool.query<SequenceRow[]>(
        `select last_value from collegium_number_sequences
         where kind = ? and year = ?`,
        [kind, year],
      );
      return Number(rows[0]?.last_value ?? 1);
    },

    async list(): Promise<CollegiumInitiative[]> {
      const [rows] = await pool.query<InitiativeRow[]>(
        `select id, number, status, revision, created_by_user_id, payload,
          workflow, created_at, updated_at
         from collegium_initiatives
         order by created_at desc, sequence_id desc`,
      );
      return rows.map(mapInitiative);
    },

    async read(id: string, lock = false) {
      const [rows] = await pool.query<InitiativeRow[]>(
        `select id, number, status, revision, created_by_user_id, payload,
          workflow, created_at, updated_at
         from collegium_initiatives where id = ? ${lock ? "for update" : ""}`,
        [id],
      );
      return rows[0] === undefined ? undefined : mapInitiative(rows[0]);
    },

    async insert(initiative: CollegiumInitiative) {
      await pool.query(
        `insert into collegium_initiatives
          (id, number, status, revision, created_by_user_id, payload, workflow,
            created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          initiative.id,
          initiative.number,
          initiative.status,
          initiative.revision,
          initiative.createdByUserId,
          JSON.stringify(initiative.card),
          JSON.stringify(initiative.workflow),
          new Date(initiative.createdAt),
          new Date(initiative.updatedAt),
        ],
      );
    },

    /** Optimistic lock: the stored revision must be the one the client edited. */
    async update(initiative: CollegiumInitiative, expectedRevision: number) {
      const [result] = await pool.query<ResultSetHeader>(
        `update collegium_initiatives
         set status = ?, revision = ?, payload = ?, workflow = ?, updated_at = ?
         where id = ? and revision = ?`,
        [
          initiative.status,
          initiative.revision,
          JSON.stringify(initiative.card),
          JSON.stringify(initiative.workflow),
          new Date(initiative.updatedAt),
          initiative.id,
          expectedRevision,
        ],
      );
      if (result.affectedRows !== 1) {
        throw new CollegiumInitiativeError(
          "Инициатива уже изменена. Обновите карточку.",
          409,
        );
      }
    },

    async insertRevision(initiativeId: string, revision: CollegiumInitiativeRevisionInput) {
      const { id, createdAt, ...payload } = revision;
      await pool.query(
        `insert into collegium_initiative_revisions
          (id, initiative_id, revision, payload, created_at)
         values (?, ?, ?, ?, ?)`,
        [id, initiativeId, revision.revision, JSON.stringify(payload), createdAt],
      );
    },

    /** Registry search through discussion text (ТЗ 17). */
    async findInitiativeIdsByCommentText(text: string): Promise<string[]> {
      const [rows] = await pool.query<(RowDataPacket & { initiative_id: string })[]>(
        `select distinct initiative_id from collegium_initiative_comments
         where locate(?, text) > 0`,
        [text],
      );
      return rows.map((row) => row.initiative_id);
    },

    async listComments(initiativeId: string): Promise<CollegiumInitiativeComment[]> {
      const [rows] = await pool.query<CommentRow[]>(
        `select id, kind, text, author_user_id, author_display_name, created_at,
          resolved_at, resolved_by_display_name
         from collegium_initiative_comments
         where initiative_id = ? order by sequence_id`,
        [initiativeId],
      );
      return rows.map(mapComment);
    },

    async readComment(initiativeId: string, commentId: string, lock = false) {
      const [rows] = await pool.query<CommentRow[]>(
        `select id, kind, text, author_user_id, author_display_name, created_at,
          resolved_at, resolved_by_display_name
         from collegium_initiative_comments
         where initiative_id = ? and id = ? ${lock ? "for update" : ""}`,
        [initiativeId, commentId],
      );
      return rows[0] === undefined ? undefined : mapComment(rows[0]);
    },

    async insertComment(initiativeId: string, comment: CollegiumInitiativeComment) {
      await pool.query(
        `insert into collegium_initiative_comments
          (id, initiative_id, kind, text, author_user_id, author_display_name, created_at)
         values (?, ?, ?, ?, ?, ?, ?)`,
        [
          comment.id,
          initiativeId,
          comment.kind,
          comment.text,
          comment.authorUserId,
          comment.authorDisplayName,
          new Date(comment.createdAt),
        ],
      );
    },

    /** Only the resolution mark changes; an already resolved comment stays as is. */
    async resolveComment(
      initiativeId: string,
      commentId: string,
      resolvedAt: Date,
      resolvedByDisplayName: string,
    ) {
      const [result] = await pool.query<ResultSetHeader>(
        `update collegium_initiative_comments
         set resolved_at = ?, resolved_by_display_name = ?
         where initiative_id = ? and id = ? and resolved_at is null`,
        [resolvedAt, resolvedByDisplayName, initiativeId, commentId],
      );
      return result.affectedRows === 1;
    },

    async listAttachments(owner: CollegiumAttachmentOwner): Promise<CollegiumAttachment[]> {
      const [rows] = await pool.query<AttachmentRow[]>(
        `select id, kind, label, file_name, file_type, size_bytes, url,
          created_by_display_name, created_at
         from collegium_attachments
         where owner_type = ? and owner_id = ? and deleted_at is null
         order by sequence_id`,
        [owner.type, owner.id],
      );
      return rows.map(mapAttachment);
    },

    async readAttachment(owner: CollegiumAttachmentOwner, attachmentId: string, lock = false) {
      const [rows] = await pool.query<AttachmentRow[]>(
        `select id, kind, label, file_name, file_type, size_bytes, url,
          created_by_display_name, created_at
         from collegium_attachments
         where owner_type = ? and owner_id = ? and id = ? and deleted_at is null
         ${lock ? "for update" : ""}`,
        [owner.type, owner.id, attachmentId],
      );
      return rows[0] === undefined ? undefined : mapAttachment(rows[0]);
    },

    async readAttachmentContent(attachmentId: string) {
      const [rows] = await pool.query<(RowDataPacket & { content: Buffer })[]>(
        "select content from collegium_attachment_contents where attachment_id = ?",
        [attachmentId],
      );
      return rows[0]?.content;
    },

    /**
     * Live items, but stored bytes including soft-deleted files: their content
     * stays in the database, so an upload-and-delete loop cannot grow it.
     * Callers hold the owner row lock.
     */
    async readAttachmentUsage(owner: CollegiumAttachmentOwner) {
      const [rows] = await pool.query<(RowDataPacket & { items: number; bytes: number | null })[]>(
        `select coalesce(sum(deleted_at is null), 0) as items,
          coalesce(sum(size_bytes), 0) as bytes
         from collegium_attachments
         where owner_type = ? and owner_id = ?`,
        [owner.type, owner.id],
      );
      return { items: Number(rows[0]?.items ?? 0), bytes: Number(rows[0]?.bytes ?? 0) };
    },

    async insertAttachment(
      owner: CollegiumAttachmentOwner,
      attachment: CollegiumAttachment & { createdByUserId: string },
      content?: Buffer,
    ) {
      await pool.query(
        `insert into collegium_attachments
          (id, owner_type, owner_id, kind, label, file_name, file_type, size_bytes, url,
            created_by_user_id, created_by_display_name, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          attachment.id,
          owner.type,
          owner.id,
          attachment.kind,
          attachment.label,
          attachment.fileName ?? null,
          attachment.fileType ?? null,
          attachment.sizeBytes ?? null,
          attachment.url ?? null,
          attachment.createdByUserId,
          attachment.createdByDisplayName,
          new Date(attachment.createdAt),
        ],
      );
      if (content !== undefined) {
        await pool.query(
          "insert into collegium_attachment_contents (attachment_id, content) values (?, ?)",
          [attachment.id, content],
        );
      }
    },

    /** Soft delete: the row and the file stay for history and decided agenda items. */
    async deleteAttachment(
      owner: CollegiumAttachmentOwner,
      attachmentId: string,
      deletedAt: Date,
      deletedByDisplayName: string,
    ) {
      const [result] = await pool.query<ResultSetHeader>(
        `update collegium_attachments
         set deleted_at = ?, deleted_by_display_name = ?
         where owner_type = ? and owner_id = ? and id = ? and deleted_at is null`,
        [deletedAt, deletedByDisplayName, owner.type, owner.id, attachmentId],
      );
      return result.affectedRows === 1;
    },

    async listMeetings(): Promise<CollegiumMeeting[]> {
      const [rows] = await pool.query<MeetingRow[]>(
        `select id, number, status, revision, payload, created_at, updated_at
         from collegium_meetings order by meeting_date desc, sequence_id desc`,
      );
      return rows.map(mapMeeting);
    },

    async readMeeting(id: string, lock = false) {
      const [rows] = await pool.query<MeetingRow[]>(
        `select id, number, status, revision, payload, created_at, updated_at
         from collegium_meetings where id = ? ${lock ? "for update" : ""}`,
        [id],
      );
      return rows[0] === undefined ? undefined : mapMeeting(rows[0]);
    },

    async insertMeeting(meeting: CollegiumMeeting) {
      await pool.query(
        `insert into collegium_meetings
          (id, number, status, revision, meeting_date, payload, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          meeting.id,
          meeting.number,
          meeting.status,
          meeting.revision,
          meeting.meetingDate,
          JSON.stringify(meetingPayload(meeting)),
          new Date(meeting.createdAt),
          new Date(meeting.updatedAt),
        ],
      );
    },

    /** Optimistic lock: the stored revision must be the one the client edited. */
    async updateMeeting(meeting: CollegiumMeeting, expectedRevision: number) {
      const [result] = await pool.query<ResultSetHeader>(
        `update collegium_meetings
         set status = ?, revision = ?, meeting_date = ?, payload = ?, updated_at = ?
         where id = ? and revision = ?`,
        [
          meeting.status,
          meeting.revision,
          meeting.meetingDate,
          JSON.stringify(meetingPayload(meeting)),
          new Date(meeting.updatedAt),
          meeting.id,
          expectedRevision,
        ],
      );
      if (result.affectedRows !== 1) {
        throw new CollegiumInitiativeError("Заседание уже изменено. Обновите страницу.", 409);
      }
    },

    async listRevisions(initiativeId: string): Promise<CollegiumInitiativeRevision[]> {
      const [rows] = await pool.query<RevisionRow[]>(
        `select revision, payload, created_at from collegium_initiative_revisions
         where initiative_id = ? order by revision desc`,
        [initiativeId],
      );
      return rows.map((row) => ({
        ...readJson<Omit<CollegiumInitiativeRevision, "createdAt">>(row.payload),
        revision: Number(row.revision),
        createdAt: toIsoString(row.created_at),
      }));
    },
  };
}

export type CollegiumInitiativesRepository = ReturnType<
  typeof createCollegiumInitiativesRepository
>;

function mapInitiative(row: InitiativeRow): CollegiumInitiative {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    revision: Number(row.revision),
    card: readJson(row.payload),
    workflow: row.workflow === null || row.workflow === undefined
      ? {}
      : readJson(row.workflow),
    createdByUserId: row.created_by_user_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function meetingPayload(meeting: CollegiumMeeting): MeetingPayload {
  const {
    id: _id,
    number: _number,
    status: _status,
    revision: _revision,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...payload
  } = meeting;
  return payload;
}

function mapMeeting(row: MeetingRow): CollegiumMeeting {
  return {
    ...readJson<MeetingPayload>(row.payload),
    id: row.id,
    number: row.number,
    status: row.status,
    revision: Number(row.revision),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAttachment(row: AttachmentRow): CollegiumAttachment {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    ...(row.file_name === null ? {} : { fileName: row.file_name }),
    ...(row.file_type === null ? {} : { fileType: row.file_type }),
    ...(row.size_bytes === null ? {} : { sizeBytes: Number(row.size_bytes) }),
    ...(row.url === null ? {} : { url: row.url }),
    createdByDisplayName: row.created_by_display_name,
    createdAt: toIsoString(row.created_at),
  };
}

function mapComment(row: CommentRow): CollegiumInitiativeComment {
  return {
    id: row.id,
    kind: row.kind,
    text: row.text,
    authorUserId: row.author_user_id,
    authorDisplayName: row.author_display_name,
    createdAt: toIsoString(row.created_at),
    ...(row.resolved_at === null
      ? {}
      : {
          resolvedAt: toIsoString(row.resolved_at),
          resolvedByDisplayName: row.resolved_by_display_name ?? "",
        }),
  };
}

function readJson<T>(value: string | object): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function readJsonList(value: unknown): string[] {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function toIsoString(value: Date | string) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
