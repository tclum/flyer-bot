import type { AirtableClient, Submission } from "../clients/airtable.js";
import type { SlackClient } from "../clients/slack.js";
import type { FlyerContent } from "../handlers/generate.js";
import type { OrgConfig } from "../schemas/orgConfig.js";
import { logger } from "../util/logger.js";
import { buildDraftMessage, buildSupersededMessage } from "./draftMessage.js";

export type PostDraftAirtablePort = Pick<
  AirtableClient,
  | "getRevisionCount"
  | "getSlackMessageTs"
  | "setSlackMessageTs"
  | "getLastActiveMessageTs"
  | "setLastActiveMessageTs"
>;

export type PostDraftSlackPort = Pick<SlackClient, "postMessage" | "updateMessage">;

export interface PostDraftDeps {
  airtable: PostDraftAirtablePort;
  slack: PostDraftSlackPort;
  orgConfig: OrgConfig;
}

export interface PostDraftInput {
  recordId: string;
  submission: Submission;
  output: FlyerContent;
  imageUrl: string;
}

/**
 * Posts a rendered draft to Slack. For the first draft (revisionCount === 0)
 * this is a fresh message in the draft channel whose ts is saved to the
 * record. For a revision (revisionCount > 0) it's a threaded reply under
 * the root message, and the previous active message's buttons are disabled
 * first to prevent "approve on an old draft" races.
 */
export async function postDraftToSlack(
  input: PostDraftInput,
  deps: PostDraftDeps,
): Promise<void> {
  const { recordId, submission, output, imageUrl } = input;
  const { airtable, slack, orgConfig } = deps;
  const channel = orgConfig.slack.draftChannelId;

  const revisionCount = await airtable.getRevisionCount(recordId);

  const dateLine = pickDateLine(output, submission);
  const locationLine = pickLocationLine(output, submission);

  const message = buildDraftMessage({
    recordId,
    eventTitle: submission.eventTitle,
    imageUrl,
    revisionNumber: revisionCount,
    ...(output.rationale ? { rationale: output.rationale } : {}),
    ...(dateLine ? { dateLine } : {}),
    ...(locationLine ? { locationLine } : {}),
  });

  if (revisionCount === 0) {
    const posted = await slack.postMessage({
      channel,
      text: message.text,
      blocks: message.blocks,
    });
    await airtable.setSlackMessageTs(recordId, posted.ts);
    await airtable.setLastActiveMessageTs(recordId, posted.ts);
    logger.info(
      { recordId, ts: posted.ts, channel: posted.channel },
      "posted first-draft message to Slack",
    );
    return;
  }

  const rootTs = await airtable.getSlackMessageTs(recordId);
  const lastActiveTs = await airtable.getLastActiveMessageTs(recordId);

  if (!rootTs) {
    logger.warn(
      { recordId, revisionCount },
      "revision without root message ts; falling back to new root post",
    );
    const posted = await slack.postMessage({
      channel,
      text: message.text,
      blocks: message.blocks,
    });
    await airtable.setSlackMessageTs(recordId, posted.ts);
    await airtable.setLastActiveMessageTs(recordId, posted.ts);
    return;
  }

  if (lastActiveTs) {
    const superseded = buildSupersededMessage({
      eventTitle: submission.eventTitle,
      supersededByRevision: revisionCount,
    });
    try {
      await slack.updateMessage({
        channel,
        ts: lastActiveTs,
        text: superseded.text,
        blocks: superseded.blocks,
      });
    } catch (err) {
      logger.warn(
        { err, recordId, ts: lastActiveTs },
        "failed to disable previous active message; continuing",
      );
    }
  }

  const posted = await slack.postMessage({
    channel,
    text: message.text,
    blocks: message.blocks,
    threadTs: rootTs,
  });
  await airtable.setLastActiveMessageTs(recordId, posted.ts);
  logger.info(
    { recordId, ts: posted.ts, rootTs, revisionCount },
    "posted revision reply to Slack",
  );
}

function pickDateLine(output: FlyerContent, submission: Submission): string | undefined {
  const fromTemplate = output.fields["date_line"];
  if (fromTemplate) return fromTemplate;
  if (submission.eventDate) {
    return submission.eventTime
      ? `${submission.eventDate} · ${submission.eventTime}`
      : submission.eventDate;
  }
  return undefined;
}

function pickLocationLine(
  output: FlyerContent,
  submission: Submission,
): string | undefined {
  return output.fields["location_line"] ?? submission.location ?? undefined;
}
