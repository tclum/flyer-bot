import { z } from "zod";

const brandVoiceSchema = z.object({
  tone: z.string().min(1),
  do: z.array(z.string().min(1)),
  dont: z.array(z.string().min(1)),
  taglines: z.array(z.string().min(1)),
});

const airtableFieldMappingSchema = z.object({
  tableName: z.string().min(1),
  fields: z.object({
    eventTitle: z.string().min(1),
    eventDate: z.string().min(1),
    eventTime: z.string().min(1),
    location: z.string().min(1),
    description: z.string().min(1),
    templateHint: z.string().min(1),
    status: z.string().min(1),
    draftImageUrl: z.string().min(1),
    finalImageUrl: z.string().min(1),
    revisionNotes: z.string().min(1),
    audience: z.string().min(1),
    requesterEmail: z.string().min(1),
    generatedJson: z.string().min(1),
    revisionCount: z.string().min(1),
    // optional writable field
    deadline: z.string().min(1).optional(),
    supportingAttachments: z.string().min(1).optional(),
    slackMessageTs: z.string().min(1).optional(),
    // optional read-only Airtable fields (auto / formula / AI)
    createdAt: z.string().min(1).optional(),
    daysUntilDeadline: z.string().min(1).optional(),
    isOverdue: z.string().min(1).optional(),
    shortDescriptionSummary: z.string().min(1).optional(),
    suggestedFlyerImprovements: z.string().min(1).optional(),
  }),
});

const templateFieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["text", "image", "color"]),
  description: z.string().min(1),
  maxChars: z.number().int().positive().optional(),
});

const templateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  fields: z.array(templateFieldSchema).min(1),
});

export const orgConfigSchema = z.object({
  orgName: z.string().min(1),
  orgDescription: z.string().min(1),
  brandVoice: brandVoiceSchema,
  airtable: airtableFieldMappingSchema,
  templates: z.array(templateSchema).min(1),
  slack: z.object({
    draftChannelId: z.string().min(1),
  }),
  // IANA timezone used to derive weekday/month/day from eventDate so the
  // model never does calendar math. Defaults to Pacific/Honolulu for PACE.
  timezone: z.string().min(1).default("Pacific/Honolulu"),
});

export type OrgConfig = z.infer<typeof orgConfigSchema>;
export type BrandVoice = z.infer<typeof brandVoiceSchema>;
export type AirtableFieldMapping = z.infer<typeof airtableFieldMappingSchema>;
export type Template = z.infer<typeof templateSchema>;
export type TemplateField = z.infer<typeof templateFieldSchema>;
