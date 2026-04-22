import Airtable from "airtable";
import type { AirtableFieldMapping } from "../schemas/orgConfig.js";

export interface Submission {
  recordId: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  location: string;
  description: string;
  audience: string;
  requesterEmail: string;
  templateHint?: string | undefined;
  deadline?: string | undefined;
}

export interface RawRecord {
  id: string;
  fields: Record<string, unknown>;
}

type WritableAttachmentKey =
  | "draftImageUrl"
  | "finalImageUrl"
  | "supportingAttachments";

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export class AirtableClient {
  private readonly base: ReturnType<Airtable["base"]>;
  private readonly mapping: AirtableFieldMapping;

  constructor(pat: string, baseId: string, mapping: AirtableFieldMapping) {
    this.base = new Airtable({ apiKey: pat }).base(baseId);
    this.mapping = mapping;
  }

  async getRecord(recordId: string): Promise<RawRecord> {
    const rec = await this.base(this.mapping.tableName).find(recordId);
    return { id: rec.id, fields: { ...(rec.fields as Record<string, unknown>) } };
  }

  recordToSubmission(record: RawRecord): Submission {
    const f = this.mapping.fields;
    const get = (key: string): string => asString(record.fields[key]);
    const submission: Submission = {
      recordId: record.id,
      eventTitle: get(f.eventTitle),
      eventDate: get(f.eventDate),
      eventTime: get(f.eventTime),
      location: get(f.location),
      description: get(f.description),
      audience: get(f.audience),
      requesterEmail: get(f.requesterEmail),
    };
    const hint = get(f.templateHint);
    if (hint) submission.templateHint = hint;
    if (f.deadline) {
      const deadline = get(f.deadline);
      if (deadline) submission.deadline = deadline;
    }
    return submission;
  }

  async getSubmission(recordId: string): Promise<Submission> {
    const record = await this.getRecord(recordId);
    return this.recordToSubmission(record);
  }

  async updateStatus(recordId: string, status: string): Promise<void> {
    await this.base(this.mapping.tableName).update(recordId, {
      [this.mapping.fields.status]: status,
    });
  }

  async attachImage(
    recordId: string,
    fieldKey: WritableAttachmentKey,
    imageUrl: string,
  ): Promise<void> {
    const columnName = this.mapping.fields[fieldKey];
    if (!columnName) {
      throw new Error(`attachment field ${fieldKey} is not mapped in org config`);
    }
    // Airtable's attachment API pulls the URL server-side and stores a copy,
    // so no local buffering is needed. airtable.js's Attachment type lists
    // server-filled fields (id/filename/size/type) as required on write; cast
    // through unknown since the API accepts a bare { url } for new uploads.
    const payload = { [columnName]: [{ url: imageUrl }] } as unknown as Partial<Airtable.FieldSet>;
    await this.base(this.mapping.tableName).update(recordId, payload);
  }

  async saveGeneratedJson(recordId: string, json: unknown): Promise<void> {
    await this.base(this.mapping.tableName).update(recordId, {
      [this.mapping.fields.generatedJson]: JSON.stringify(json, null, 2),
    });
  }

  /**
   * Reads the current Revision Count and writes count + 1.
   *
   * TOCTOU: two webhooks firing for the same record within the read/write
   * window will both read the same value and both write count+1 — undercounting
   * by one. Acceptable for v1 (CLAUDE.md lists concurrent revisions as out of
   * scope). A stronger guarantee would need an Airtable formula, an atomic
   * increment, or an external counter.
   */
  async incrementRevisionCount(recordId: string): Promise<void> {
    const rec = await this.base(this.mapping.tableName).find(recordId);
    const current = asNumber(rec.get(this.mapping.fields.revisionCount));
    await this.base(this.mapping.tableName).update(recordId, {
      [this.mapping.fields.revisionCount]: current + 1,
    });
  }

  async appendRevisionNotes(recordId: string, note: string): Promise<void> {
    const rec = await this.base(this.mapping.tableName).find(recordId);
    const existing = asString(rec.get(this.mapping.fields.revisionNotes));
    const next = existing ? `${existing}\n\n${note}` : note;
    await this.base(this.mapping.tableName).update(recordId, {
      [this.mapping.fields.revisionNotes]: next,
    });
  }

  async getRevisionNotes(recordId: string): Promise<string> {
    const rec = await this.base(this.mapping.tableName).find(recordId);
    return asString(rec.get(this.mapping.fields.revisionNotes));
  }
}
