import Airtable from "airtable";
import type { AirtableFieldMapping } from "../schemas/orgConfig.js";

export interface Submission {
  recordId: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  location: string;
  description: string;
  templateHint?: string | undefined;
}

export class AirtableClient {
  private readonly base: ReturnType<Airtable["base"]>;
  private readonly mapping: AirtableFieldMapping;

  constructor(pat: string, baseId: string, mapping: AirtableFieldMapping) {
    this.base = new Airtable({ apiKey: pat }).base(baseId);
    this.mapping = mapping;
  }

  async getSubmission(recordId: string): Promise<Submission> {
    const rec = await this.base(this.mapping.tableName).find(recordId);
    const f = this.mapping.fields;
    const get = (key: string): string => {
      const v = rec.get(key);
      return typeof v === "string" ? v : v == null ? "" : String(v);
    };
    return {
      recordId,
      eventTitle: get(f.eventTitle),
      eventDate: get(f.eventDate),
      eventTime: get(f.eventTime),
      location: get(f.location),
      description: get(f.description),
      templateHint: get(f.templateHint) || undefined,
    };
  }

  async updateDraftImage(recordId: string, imageUrl: string): Promise<void> {
    await this.base(this.mapping.tableName).update(recordId, {
      [this.mapping.fields.draftImageUrl]: imageUrl,
      [this.mapping.fields.status]: "Draft",
    });
  }

  async updateFinalImage(recordId: string, imageUrl: string): Promise<void> {
    await this.base(this.mapping.tableName).update(recordId, {
      [this.mapping.fields.finalImageUrl]: imageUrl,
      [this.mapping.fields.status]: "Approved",
    });
  }

  async getRevisionNotes(recordId: string): Promise<string> {
    const rec = await this.base(this.mapping.tableName).find(recordId);
    const v = rec.get(this.mapping.fields.revisionNotes);
    return typeof v === "string" ? v : "";
  }
}
