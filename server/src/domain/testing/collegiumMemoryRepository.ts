import type {
  CollegiumAttachment,
  CollegiumInitiative,
  CollegiumInitiativeComment,
  CollegiumInitiativeRevision,
  CollegiumMeeting,
  CollegiumPerson,
  CollegiumReference,
} from "../../contracts/collegiumInitiatives.js";
import type { CollegiumInitiativesRepository } from "../../repositories/collegiumInitiativesRepository.js";
import { CollegiumInitiativeError } from "../collegiumInitiative.js";

/** In-memory repository for collegium service tests; mirrors the SQL contract. */
export function createCollegiumMemoryRepository({
  reference,
  people,
}: {
  reference: CollegiumReference;
  people: CollegiumPerson[];
}) {
  const initiatives = new Map<string, CollegiumInitiative>();
  const meetings = new Map<string, CollegiumMeeting>();
  const revisions: Array<{ initiativeId: string; revision: Omit<CollegiumInitiativeRevision, "createdAt"> }> = [];
  const comments: Array<{ initiativeId: string; comment: CollegiumInitiativeComment }> = [];
  const attachments = new Map<string, {
    ownerId: string;
    attachment: CollegiumAttachment;
    deleted: boolean;
    content?: Buffer;
  }>();
  const counters = new Map<string, number>();
  const repository = {
    async listReference() { return reference; },
    async listPeople() { return people; },
    async readPerson(accountId: string) {
      return people.find(({ id }) => id === accountId);
    },
    async nextNumber(kind: string, year: number) {
      const key = `${kind}:${year}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async list() { return [...initiatives.values()].map((initiative) => structuredClone(initiative)); },
    async read(id: string) {
      const initiative = initiatives.get(id);
      return initiative === undefined ? undefined : structuredClone(initiative);
    },
    async insert(initiative: CollegiumInitiative) {
      initiatives.set(initiative.id, structuredClone(initiative));
    },
    async update(initiative: CollegiumInitiative, expectedRevision: number) {
      if (initiatives.get(initiative.id)?.revision !== expectedRevision) {
        throw new CollegiumInitiativeError("conflict", 409);
      }
      initiatives.set(initiative.id, structuredClone(initiative));
    },
    async insertRevision(
      initiativeId: string,
      revision: { createdAt: Date } & Omit<CollegiumInitiativeRevision, "createdAt">,
    ) {
      const { createdAt: _createdAt, ...rest } = revision;
      revisions.push({ initiativeId, revision: structuredClone(rest) });
    },
    async listRevisions(initiativeId: string) {
      return revisions
        .filter((entry) => entry.initiativeId === initiativeId)
        .map(({ revision }) => ({ ...revision, createdAt: "2026-10-05T09:00:00.000Z" }))
        .reverse();
    },
    async listComments(initiativeId: string) {
      return comments.filter((entry) => entry.initiativeId === initiativeId).map(({ comment }) => comment);
    },
    async readComment(initiativeId: string, commentId: string) {
      return comments.find((entry) => entry.initiativeId === initiativeId && entry.comment.id === commentId)?.comment;
    },
    async insertComment(initiativeId: string, comment: CollegiumInitiativeComment) {
      comments.push({ initiativeId, comment: { ...comment } });
    },
    async resolveComment(initiativeId: string, commentId: string, resolvedAt: Date, resolvedByDisplayName: string) {
      const entry = comments.find((item) => item.initiativeId === initiativeId && item.comment.id === commentId);
      if (entry === undefined || entry.comment.resolvedAt !== undefined) return false;
      entry.comment.resolvedAt = resolvedAt.toISOString();
      entry.comment.resolvedByDisplayName = resolvedByDisplayName;
      return true;
    },
    async listAttachments(owner: { id: string }) {
      return [...attachments.values()]
        .filter((entry) => entry.ownerId === owner.id && !entry.deleted)
        .map(({ attachment }) => attachment);
    },
    async readAttachment(owner: { id: string }, attachmentId: string) {
      const entry = attachments.get(attachmentId);
      return entry?.ownerId === owner.id && !entry.deleted ? entry.attachment : undefined;
    },
    async readAttachmentContent(attachmentId: string) {
      return attachments.get(attachmentId)?.content;
    },
    async readAttachmentUsage(owner: { id: string }) {
      const owned = [...attachments.values()].filter((entry) => entry.ownerId === owner.id);
      return {
        items: owned.filter((entry) => !entry.deleted).length,
        bytes: owned.reduce((total, { attachment }) => total + (attachment.sizeBytes ?? 0), 0),
      };
    },
    async insertAttachment(owner: { id: string }, attachment: CollegiumAttachment, content?: Buffer) {
      attachments.set(attachment.id, { ownerId: owner.id, attachment, deleted: false, content });
    },
    async deleteAttachment(owner: { id: string }, attachmentId: string) {
      const entry = attachments.get(attachmentId);
      if (entry === undefined || entry.ownerId !== owner.id || entry.deleted) return false;
      entry.deleted = true;
      return true;
    },
    async listMeetings() { return [...meetings.values()].map((meeting) => structuredClone(meeting)); },
    async readMeeting(id: string) {
      const meeting = meetings.get(id);
      return meeting === undefined ? undefined : structuredClone(meeting);
    },
    async insertMeeting(meeting: CollegiumMeeting) {
      meetings.set(meeting.id, structuredClone(meeting));
    },
    async updateMeeting(meeting: CollegiumMeeting, expectedRevision: number) {
      if (meetings.get(meeting.id)?.revision !== expectedRevision) {
        throw new CollegiumInitiativeError("conflict", 409);
      }
      meetings.set(meeting.id, structuredClone(meeting));
    },
  };
  return {
    repository: repository as unknown as CollegiumInitiativesRepository,
    initiatives,
    meetings,
    revisions,
    comments,
    attachments,
  };
}
