import { ZodError } from "zod";
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
  audience: string;
  requesterEmail: string;
  templateHint?: string | undefined;
  deadline?: string | undefined;
}

export interface GenerateDeps {
  anthropic: Pick<AnthropicClient, "generateJson">;
  bannerbear: Pick<BannerbearClient, "render">;
  orgConfig: OrgConfig;
}

export interface FlyerContent {
  templateId: string;
  fields: Record<string, string>;
  rationale: string | undefined;
}

export interface GenerateResult extends FlyerContent {
  imageUrl: string;
}

function stripCodeFences(s: string): string {
  const trimmed = s.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/;
  const match = fence.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
}

function submissionToUserPrompt(
  s: Submission,
  timezone: string,
  validationFeedback?: string,
): string {
  const d = deriveDateParts(s.eventDate, timezone);
  const lines = [
    "Event details:",
    `- Title: ${s.eventTitle}`,
    `- Audience: ${s.audience}`,
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
    `- Requester: ${s.requesterEmail}`,
    s.deadline ? `- Deadline: ${s.deadline}` : "",
    s.templateHint ? `- Template hint from submitter: ${s.templateHint}` : "",
  ].filter(Boolean);
  if (validationFeedback) {
    lines.push(
      "",
      "IMPORTANT: your previous response failed validation. Fix the following issues and try again:",
      validationFeedback,
    );
  }
  return lines.join("\n");
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

function formatZodForPrompt(err: ZodError): string {
  return err.issues
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

/**
 * Calls Claude, parses JSON, and Zod-validates against the per-org schema.
 * Does NOT render Bannerbear — that's `renderFlyer`. Split so callers can
 * retry the LLM call with validation feedback without re-rendering on success.
 */
export async function generateFlyerContent(
  submission: Submission,
  deps: Pick<GenerateDeps, "anthropic" | "orgConfig">,
  opts: { validationFeedback?: string } = {},
): Promise<FlyerContent> {
  const { anthropic, orgConfig } = deps;
  const systemPrompt = loadPrompt("generateFlyer", orgConfig);
  const userPrompt = submissionToUserPrompt(
    submission,
    orgConfig.timezone,
    opts.validationFeedback,
  );

  logger.info({ recordId: submission.recordId, retry: Boolean(opts.validationFeedback) }, "calling anthropic");
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
  return {
    templateId: validated.templateId,
    fields: validated.fields,
    rationale: validated.rationale,
  };
}

/**
 * Calls Claude with one Zod-validation retry. On the second attempt the user
 * prompt includes the first attempt's validation errors.
 */
export async function generateFlyerContentWithRetry(
  submission: Submission,
  deps: Pick<GenerateDeps, "anthropic" | "orgConfig">,
): Promise<FlyerContent> {
  try {
    return await generateFlyerContent(submission, deps);
  } catch (err) {
    if (!(err instanceof ZodError)) throw err;
    logger.warn(
      { recordId: submission.recordId, issues: err.issues },
      "LLM output failed validation; retrying once",
    );
    return generateFlyerContent(submission, deps, {
      validationFeedback: formatZodForPrompt(err),
    });
  }
}

export async function renderFlyer(
  content: FlyerContent,
  deps: Pick<GenerateDeps, "bannerbear" | "orgConfig">,
): Promise<string> {
  const template = requireTemplate(deps.orgConfig, content.templateId);
  const modifications = toModifications(template, content.fields);
  logger.info({ templateId: content.templateId }, "rendering bannerbear image");
  const image = await deps.bannerbear.render(template.id, modifications);
  return image.image_url;
}

/**
 * Revision path: feed the prior draft + reviewer notes into reviseFlyer.md.
 * The prompt instructs Claude to treat it as a diff and only change what the
 * notes call out. No retry — if it fails validation, processSubmission marks
 * the record Error and the reviewer can request revision again.
 */
export async function generateFlyerContentWithRevision(
  submission: Submission,
  priorOutput: FlyerContent,
  revisionNotes: string,
  deps: Pick<GenerateDeps, "anthropic" | "orgConfig">,
): Promise<FlyerContent> {
  const { anthropic, orgConfig } = deps;
  const systemPrompt = loadPrompt("reviseFlyer", orgConfig, {
    priorOutput: JSON.stringify(priorOutput, null, 2),
    revisionNotes: revisionNotes || "(no notes provided)",
  });
  const userPrompt = submissionToUserPrompt(submission, orgConfig.timezone);

  logger.info({ recordId: submission.recordId }, "calling anthropic for revision");
  const raw = await anthropic.generateJson({ systemPrompt, userPrompt });
  const unfenced = stripCodeFences(raw);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(unfenced);
  } catch (err) {
    logger.error({ raw, err }, "revision LLM output was not JSON");
    throw new Error("revision LLM output was not valid JSON");
  }

  const schema = buildFlyerOutputSchema(orgConfig);
  const validated = schema.parse(parsedJson);
  return {
    templateId: validated.templateId,
    fields: validated.fields,
    rationale: validated.rationale,
  };
}

/**
 * Convenience wrapper used by scripts/test-pipeline.ts — single attempt, no
 * retry, no Airtable/Slack side effects.
 */
export async function generate(
  submission: Submission,
  deps: GenerateDeps,
): Promise<GenerateResult> {
  const content = await generateFlyerContent(submission, deps);
  const imageUrl = await renderFlyer(content, deps);
  return { ...content, imageUrl };
}
