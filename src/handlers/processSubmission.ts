import { ZodError } from "zod";
import type { AnthropicClient } from "../clients/anthropic.js";
import type { AirtableClient, RawRecord, Submission } from "../clients/airtable.js";
import type { BannerbearClient } from "../clients/bannerbear.js";
import { buildFlyerOutputSchema } from "../schemas/flyer.js";
import type { OrgConfig } from "../schemas/orgConfig.js";
import { logger } from "../util/logger.js";
import {
  generateFlyerContentWithRetry,
  generateFlyerContentWithRevision,
  renderFlyer,
  type FlyerContent,
} from "./generate.js";

export type AirtablePort = Pick<
  AirtableClient,
  | "getRecord"
  | "recordToSubmission"
  | "updateStatus"
  | "attachImage"
  | "saveGeneratedJson"
  | "appendRevisionNotes"
  | "getGeneratedJson"
  | "getRevisionNotes"
>;

export type AnthropicPort = Pick<AnthropicClient, "generateJson">;
export type BannerbearPort = Pick<BannerbearClient, "render">;

export interface PostDraftParams {
  recordId: string;
  submission: Submission;
  output: FlyerContent;
  imageUrl: string;
}

export type PostDraftFn = (params: PostDraftParams) => Promise<void>;

export interface ProcessDeps {
  airtable: AirtablePort;
  anthropic: AnthropicPort;
  bannerbear: BannerbearPort;
  orgConfig: OrgConfig;
  postDraft: PostDraftFn;
}

const ELIGIBLE_STATUSES = new Set(["Submitted", "In Revision", "Error"]);

const STATUS_GENERATING = "Generating";
const STATUS_DRAFT_READY = "Draft Ready";
const STATUS_ERROR = "Error";
const STATUS_IN_REVISION = "In Revision";

export async function processSubmission(
  recordId: string,
  deps: ProcessDeps,
): Promise<void> {
  const start = Date.now();
  const log = logger.child({ recordId });
  log.info("processSubmission start");

  const { airtable, orgConfig } = deps;
  const statusField = orgConfig.airtable.fields.status;

  let record: RawRecord;
  try {
    record = await airtable.getRecord(recordId);
  } catch (err) {
    log.error({ err, durationMs: Date.now() - start }, "failed to fetch record");
    throw err;
  }

  const currentStatus =
    typeof record.fields[statusField] === "string"
      ? (record.fields[statusField] as string)
      : "";
  if (!ELIGIBLE_STATUSES.has(currentStatus)) {
    log.info(
      { currentStatus, durationMs: Date.now() - start },
      "skipping; record status is not eligible for generation",
    );
    return;
  }

  let submission: Submission;
  try {
    submission = airtable.recordToSubmission(record);
  } catch (err) {
    log.error({ err }, "failed to map record to submission");
    await markError(deps, recordId, err);
    return;
  }

  try {
    await airtable.updateStatus(recordId, STATUS_GENERATING);
    log.info({ status: STATUS_GENERATING, durationMs: Date.now() - start }, "status updated");
  } catch (err) {
    log.error({ err }, "failed to set Generating status");
    throw err;
  }

  try {
    const content =
      currentStatus === STATUS_IN_REVISION
        ? await generateRevisionContent(recordId, submission, deps)
        : await generateFlyerContentWithRetry(submission, {
            anthropic: deps.anthropic,
            orgConfig,
          });
    log.info({ templateId: content.templateId }, "LLM content validated");

    const imageUrl = await renderFlyer(content, {
      bannerbear: deps.bannerbear,
      orgConfig,
    });
    log.info({ imageUrl }, "bannerbear render complete");

    await airtable.saveGeneratedJson(recordId, content);
    await airtable.attachImage(recordId, "draftImageUrl", imageUrl);
    await airtable.updateStatus(recordId, STATUS_DRAFT_READY);

    try {
      await deps.postDraft({ recordId, submission, output: content, imageUrl });
    } catch (err) {
      // Draft is saved in Airtable — failing to post to Slack shouldn't
      // flip the record back to Error. Log loudly and continue.
      log.error({ err }, "postDraft to Slack failed; Airtable draft is saved");
    }

    log.info(
      { status: STATUS_DRAFT_READY, durationMs: Date.now() - start },
      "processSubmission complete",
    );
  } catch (err) {
    log.error({ err, durationMs: Date.now() - start }, "pipeline failed");
    await markError(deps, recordId, err);
  }
}

/**
 * For records already in revision, pull the previous JSON and reviewer notes
 * off the record and feed them into the revise prompt. If either is missing
 * (e.g. manual status flip with no prior draft), fall back to a fresh
 * generate so we always produce something.
 */
async function generateRevisionContent(
  recordId: string,
  submission: Submission,
  deps: ProcessDeps,
): Promise<FlyerContent> {
  const { airtable, anthropic, orgConfig } = deps;

  const [priorJsonRaw, notes] = await Promise.all([
    airtable.getGeneratedJson(recordId),
    airtable.getRevisionNotes(recordId),
  ]);

  if (!priorJsonRaw || !notes) {
    logger.warn(
      { recordId, hasPrior: Boolean(priorJsonRaw), hasNotes: Boolean(notes) },
      "revision run without prior state; falling back to fresh generate",
    );
    return generateFlyerContentWithRetry(submission, { anthropic, orgConfig });
  }

  let priorOutput: FlyerContent;
  try {
    const parsed = JSON.parse(priorJsonRaw) as unknown;
    const schema = buildFlyerOutputSchema(orgConfig);
    const validated = schema.parse(parsed);
    priorOutput = {
      templateId: validated.templateId,
      fields: validated.fields,
      rationale: validated.rationale,
    };
  } catch (err) {
    if (err instanceof ZodError || err instanceof SyntaxError) {
      logger.warn(
        { recordId, err },
        "stored Generated JSON didn't round-trip; falling back to fresh generate",
      );
      return generateFlyerContentWithRetry(submission, { anthropic, orgConfig });
    }
    throw err;
  }

  return generateFlyerContentWithRevision(submission, priorOutput, notes, {
    anthropic,
    orgConfig,
  });
}

async function markError(
  deps: ProcessDeps,
  recordId: string,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await deps.airtable.updateStatus(recordId, STATUS_ERROR);
  } catch (e) {
    logger.error({ err: e, recordId }, "failed to set Error status");
  }
  try {
    await deps.airtable.appendRevisionNotes(
      recordId,
      `[auto ${new Date().toISOString()}] pipeline failed: ${message}`,
    );
  } catch (e) {
    logger.error({ err: e, recordId }, "failed to append error to revision notes");
  }
}
