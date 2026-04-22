import type { AnthropicClient } from "../clients/anthropic.js";
import type { BannerbearClient, Modification } from "../clients/bannerbear.js";
import { loadPrompt } from "../prompts/loader.js";
import { buildFlyerOutputSchema } from "../schemas/flyer.js";
import type { OrgConfig, Template } from "../schemas/orgConfig.js";
import { requireTemplate } from "../templates/catalog.js";
import { deriveDateParts } from "../util/date.js";
import { logger } from "../util/logger.js";

export interface Submission {
  recordId: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  location: string;
  description: string;
  templateHint?: string | undefined;
}

export interface GenerateDeps {
  anthropic: AnthropicClient;
  bannerbear: BannerbearClient;
  orgConfig: OrgConfig;
}

export interface GenerateResult {
  templateId: string;
  fields: Record<string, string>;
  rationale: string | undefined;
  imageUrl: string;
}

function submissionToUserPrompt(s: Submission, timezone: string): string {
  const d = deriveDateParts(s.eventDate, timezone);
  return [
    "Event details:",
    `- Title: ${s.eventTitle}`,
    `- Date (ISO): ${s.eventDate}`,
    `  - weekday: ${d.weekday}`,
    `  - weekday_short: ${d.weekdayShort}`,
    `  - month: ${d.monthName}`,
    `  - month_short: ${d.monthShort}`,
    `  - day: ${d.day}`,
    `  - year: ${d.year}`,
    `  - formatted_date: ${d.formattedDate}`,
    `- Time: ${s.eventTime}`,
    `- Location: ${s.location}`,
    `- Description: ${s.description}`,
    s.templateHint ? `- Template hint from submitter: ${s.templateHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function stripCodeFences(s: string): string {
  const trimmed = s.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/;
  const match = fence.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
}

function toModifications(
  template: Template,
  fields: Record<string, string>,
): Modification[] {
  return template.fields.map((f) => {
    const value = fields[f.name];
    if (value === undefined) {
      throw new Error(`field ${f.name} missing from LLM output`);
    }
    if (f.type === "image") return { name: f.name, image_url: value };
    if (f.type === "color") return { name: f.name, color: value };
    return { name: f.name, text: value };
  });
}

export async function generate(
  submission: Submission,
  deps: GenerateDeps,
): Promise<GenerateResult> {
  const { anthropic, bannerbear, orgConfig } = deps;

  const systemPrompt = loadPrompt("generateFlyer", orgConfig);
  const userPrompt = submissionToUserPrompt(submission, orgConfig.timezone);

  logger.info({ recordId: submission.recordId }, "calling anthropic");
  const raw = await anthropic.generateJson({ systemPrompt, userPrompt });

  const unfenced = stripCodeFences(raw);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(unfenced);
  } catch (err) {
    logger.error({ raw, err }, "LLM output was not JSON");
    throw new Error("LLM output was not valid JSON");
  }

  const schema = buildFlyerOutputSchema(orgConfig);
  const validated = schema.parse(parsedJson);

  const template = requireTemplate(orgConfig, validated.templateId);
  const modifications = toModifications(template, validated.fields);

  logger.info(
    { templateId: validated.templateId, recordId: submission.recordId },
    "rendering bannerbear image",
  );
  const image = await bannerbear.render(template.id, modifications);

  // TODO(airtable): write draft image URL back to the submission record
  // TODO(slack): post the draft to the review channel via slack/draftMessage.ts

  return {
    templateId: validated.templateId,
    fields: validated.fields,
    rationale: validated.rationale,
    imageUrl: image.image_url,
  };
}
