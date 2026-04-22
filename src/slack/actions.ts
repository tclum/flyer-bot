import type {
  App,
  Middleware,
  SlackActionMiddlewareArgs,
  SlackViewMiddlewareArgs,
} from "@slack/bolt";
import type { AirtableClient } from "../clients/airtable.js";
import type { OrgConfig } from "../schemas/orgConfig.js";
import { approveDraft } from "../handlers/approve.js";
import {
  RevisionLimitExceeded,
  requestRevision,
} from "../handlers/revise.js";
import { logger } from "../util/logger.js";
import { buildStatusFooterBlock, type Block } from "./draftMessage.js";

export interface SlackActionsDeps {
  airtable: AirtableClient;
  orgConfig: OrgConfig;
}

export const APPROVE_ACTION_ID = "flyer_approve";
export const REVISE_ACTION_ID = "flyer_revise";
export const REVISE_MODAL_CALLBACK_ID = "flyer_revise_modal";
export const REVISE_NOTES_BLOCK_ID = "revision_notes_block";
export const REVISE_NOTES_ACTION_ID = "revision_notes_input";

interface PrivateMetadata {
  recordId: string;
  channel: string;
  ts: string;
  imageUrl: string;
  eventTitle: string;
}

type MaybeRecord = Record<string, unknown> | undefined | null;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function stripActionsBlock(blocks: Block[]): Block[] {
  return blocks.filter((b) => b["type"] !== "actions");
}

/**
 * Registers the Slack interactive handlers: approve click, revise click,
 * and revise-modal submission. ack() is the first line of every handler
 * — Slack requires a response within 3 seconds, so all I/O happens after.
 */
export function registerSlackActions(app: App, deps: SlackActionsDeps): void {
  // Factories return loosely-typed handlers so tests can exercise them with
  // fake payloads. Bolt's action/view signatures are highly narrow — we cast
  // once here at the framework boundary.
  app.action(
    APPROVE_ACTION_ID,
    makeApproveHandler(deps) as unknown as Middleware<SlackActionMiddlewareArgs>,
  );
  app.action(
    REVISE_ACTION_ID,
    makeReviseClickHandler() as unknown as Middleware<SlackActionMiddlewareArgs>,
  );
  app.view(
    REVISE_MODAL_CALLBACK_ID,
    makeReviseSubmitHandler(deps) as unknown as Middleware<SlackViewMiddlewareArgs>,
  );
}

export function makeApproveHandler(deps: SlackActionsDeps) {
  return async (args: {
    ack: () => Promise<void>;
    body: unknown;
    client: {
      chat: {
        update: (p: Record<string, unknown>) => Promise<unknown>;
        postMessage: (p: Record<string, unknown>) => Promise<unknown>;
        postEphemeral: (p: Record<string, unknown>) => Promise<unknown>;
      };
    };
  }): Promise<void> => {
    await args.ack();
    const parsed = parseClickBody(args.body);
    if (!parsed) {
      logger.warn({ body: args.body }, "approve click: could not parse body");
      return;
    }
    const { recordId, channel, messageTs, existingBlocks, userId } = parsed;

    try {
      await approveDraft(recordId, { airtable: deps.airtable });
    } catch (err) {
      logger.error({ err, recordId }, "approveDraft failed");
      await safeEphemeral(
        args.client,
        channel,
        userId,
        "Couldn't mark this flyer as approved. Please try again or check the Airtable record.",
      );
      return;
    }

    const footer = buildStatusFooterBlock({
      kind: "approved",
      userId,
      at: new Date(),
    });
    const updatedBlocks = [...stripActionsBlock(existingBlocks), footer];

    try {
      await args.client.chat.update({
        channel,
        ts: messageTs,
        text: `Approved: ${recordId}`,
        blocks: updatedBlocks,
      });
      await args.client.chat.postMessage({
        channel,
        thread_ts: messageTs,
        text: `Approved by <@${userId}>. Final flyer written to Airtable.`,
      });
    } catch (err) {
      logger.warn(
        { err, recordId, messageTs },
        "approve: failed to update Slack message; Airtable is authoritative",
      );
    }
  };
}

export function makeReviseClickHandler() {
  return async (args: {
    ack: () => Promise<void>;
    body: unknown;
    client: {
      views: { open: (p: Record<string, unknown>) => Promise<unknown> };
    };
  }): Promise<void> => {
    await args.ack();
    const parsed = parseClickBody(args.body);
    if (!parsed) {
      logger.warn({ body: args.body }, "revise click: could not parse body");
      return;
    }
    const { recordId, channel, messageTs, existingBlocks, triggerId } = parsed;

    const imageUrl = findImageUrl(existingBlocks) ?? "";
    const eventTitle = findHeaderText(existingBlocks) ?? "";

    const privateMetadata: PrivateMetadata = {
      recordId,
      channel,
      ts: messageTs,
      imageUrl,
      eventTitle,
    };

    await args.client.views.open({
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: REVISE_MODAL_CALLBACK_ID,
        private_metadata: JSON.stringify(privateMetadata),
        title: { type: "plain_text", text: "Request revision" },
        submit: { type: "plain_text", text: "Submit" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: REVISE_NOTES_BLOCK_ID,
            label: { type: "plain_text", text: "What needs to change?" },
            element: {
              type: "plain_text_input",
              action_id: REVISE_NOTES_ACTION_ID,
              multiline: true,
              max_length: 2000,
            },
          },
        ],
      },
    });
  };
}

export function makeReviseSubmitHandler(deps: SlackActionsDeps) {
  return async (args: {
    ack: () => Promise<void>;
    body: unknown;
    view: unknown;
    client: {
      chat: {
        update: (p: Record<string, unknown>) => Promise<unknown>;
        postEphemeral: (p: Record<string, unknown>) => Promise<unknown>;
      };
    };
  }): Promise<void> => {
    await args.ack();

    const view = asRecord(args.view);
    const body = asRecord(args.body);
    const user = asRecord(body?.["user"] as MaybeRecord);
    const userId = typeof user?.["id"] === "string" ? (user["id"] as string) : "";
    const userName =
      (typeof user?.["name"] === "string" && (user["name"] as string)) ||
      (typeof user?.["username"] === "string" && (user["username"] as string)) ||
      userId;

    const metaRaw = typeof view?.["private_metadata"] === "string"
      ? (view["private_metadata"] as string)
      : "";
    let meta: PrivateMetadata;
    try {
      meta = JSON.parse(metaRaw) as PrivateMetadata;
    } catch (err) {
      logger.error({ err, metaRaw }, "revise submit: bad private_metadata");
      return;
    }

    const notes = extractNotes(view);
    if (!notes) {
      logger.warn({ meta }, "revise submit: no notes extracted");
    }

    try {
      await requestRevision(
        { recordId: meta.recordId, notes, userId, userName },
        { airtable: deps.airtable, orgConfig: deps.orgConfig },
      );
    } catch (err) {
      if (err instanceof RevisionLimitExceeded) {
        await safeEphemeral(
          args.client,
          meta.channel,
          userId,
          `This flyer has reached the ${deps.orgConfig.maxRevisions}-revision limit. Please approve or restart the request.`,
        );
        return;
      }
      logger.error({ err, recordId: meta.recordId }, "requestRevision failed");
      await safeEphemeral(
        args.client,
        meta.channel,
        userId,
        "Couldn't record your revision request. Please try again.",
      );
      return;
    }

    const blocks: Block[] = [
      {
        type: "header",
        text: { type: "plain_text", text: meta.eventTitle || "Flyer" },
      },
    ];
    if (meta.imageUrl) {
      blocks.push({
        type: "image",
        image_url: meta.imageUrl,
        alt_text: `Flyer for ${meta.eventTitle}`,
      });
    }
    blocks.push(
      buildStatusFooterBlock({
        kind: "revision_requested",
        userId,
        at: new Date(),
      }),
    );

    try {
      await args.client.chat.update({
        channel: meta.channel,
        ts: meta.ts,
        text: `Revision requested for ${meta.eventTitle}`,
        blocks,
      });
    } catch (err) {
      logger.warn(
        { err, recordId: meta.recordId, ts: meta.ts },
        "revise submit: failed to update clicked message; Airtable is authoritative",
      );
    }
  };
}

interface ParsedClick {
  recordId: string;
  channel: string;
  messageTs: string;
  existingBlocks: Block[];
  userId: string;
  triggerId: string;
}

function parseClickBody(raw: unknown): ParsedClick | null {
  const body = asRecord(raw);
  if (!body) return null;

  const actions = Array.isArray(body["actions"]) ? body["actions"] : [];
  const first = asRecord(actions[0]);
  const recordId = typeof first?.["value"] === "string" ? (first["value"] as string) : "";

  const channel = asRecord(body["channel"]);
  const channelId = typeof channel?.["id"] === "string" ? (channel["id"] as string) : "";

  const message = asRecord(body["message"]);
  const messageTs = typeof message?.["ts"] === "string" ? (message["ts"] as string) : "";
  const existingBlocks = Array.isArray(message?.["blocks"])
    ? (message["blocks"] as Block[])
    : [];

  const user = asRecord(body["user"]);
  const userId = typeof user?.["id"] === "string" ? (user["id"] as string) : "";

  const triggerId =
    typeof body["trigger_id"] === "string" ? (body["trigger_id"] as string) : "";

  if (!recordId || !channelId || !messageTs || !userId) return null;
  return { recordId, channel: channelId, messageTs, existingBlocks, userId, triggerId };
}

function findImageUrl(blocks: Block[]): string | undefined {
  const img = blocks.find((b) => b["type"] === "image");
  const url = img?.["image_url"];
  return typeof url === "string" ? url : undefined;
}

function findHeaderText(blocks: Block[]): string | undefined {
  const header = blocks.find((b) => b["type"] === "header");
  const text = asRecord(header?.["text"]);
  const t = text?.["text"];
  return typeof t === "string" ? t : undefined;
}

function extractNotes(view: Record<string, unknown> | null): string {
  if (!view) return "";
  const state = asRecord(view["state"]);
  const values = asRecord(state?.["values"]);
  const block = asRecord(values?.[REVISE_NOTES_BLOCK_ID]);
  const input = asRecord(block?.[REVISE_NOTES_ACTION_ID]);
  const value = input?.["value"];
  return typeof value === "string" ? value : "";
}

async function safeEphemeral(
  client: {
    chat: { postEphemeral: (p: Record<string, unknown>) => Promise<unknown> };
  },
  channel: string,
  user: string,
  text: string,
): Promise<void> {
  try {
    await client.chat.postEphemeral({ channel, user, text });
  } catch (err) {
    logger.warn({ err, channel, user }, "postEphemeral failed");
  }
}
