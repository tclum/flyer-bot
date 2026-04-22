import type { AnthropicClient } from "../clients/anthropic.js";
import type { AirtableClient, RawRecord, Submission } from "../clients/airtable.js";
import type { BannerbearClient } from "../clients/bannerbear.js";
import type { OrgConfig } from "../schemas/orgConfig.js";
import { logger } from "../util/logger.js";
import {
  generateFlyerContentWithRetry,
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
>;

export type AnthropicPort = Pick<AnthropicClient, "generateJson">;
export type BannerbearPort = Pick<BannerbearClient, "render">;

export interface ProcessDeps {
  airtable: AirtablePort;
  anthropic: AnthropicPort;
  bannerbear: BannerbearPort;
  orgConfig: OrgConfig;
}

const ELIGIBLE_STATUSES = new Set(["Submitted", "In Revision", "Error"]);

const STATUS_GENERATING = "Generating";
const STATUS_DRAFT_READY = "Draft Ready";
const STATUS_ERROR = "Error";

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

  const currentStatus = typeof record.fields[statusField] === "string"
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
    const content: FlyerContent = await generateFlyerContentWithRetry(submission, {
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

    log.info(
      { status: STATUS_DRAFT_READY, durationMs: Date.now() - start },
      "processSubmission complete",
    );
  } catch (err) {
    log.error({ err, durationMs: Date.now() - start }, "pipeline failed");
    await markError(deps, recordId, err);
  }
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
