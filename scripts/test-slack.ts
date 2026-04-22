/**
 * Posts a sample draft message to the configured Slack channel so you can
 * eyeball the Block Kit layout and button styling. No Anthropic / Bannerbear
 * calls — uses a placeholder image URL.
 */
import { appConfig } from "../src/config.js";
import { SlackClient } from "../src/clients/slack.js";
import { buildDraftMessage } from "../src/slack/draftMessage.js";
import { logger } from "../src/util/logger.js";

async function main(): Promise<void> {
  const { env, org } = appConfig;
  const slack = new SlackClient(env.SLACK_BOT_TOKEN);

  const msg = buildDraftMessage({
    recordId: "recSAMPLE00000000",
    eventTitle: "Sample Event — Draft Preview",
    imageUrl: "https://images.bannerbear.com/direct/placeholder.png",
    rationale: "Picked the portrait poster template for a single-event promo.",
  });

  const res = await slack.postMessage({
    channel: org.slack.draftChannelId,
    text: msg.text,
    blocks: msg.blocks,
  });
  logger.info({ ts: res.ts, channel: res.channel }, "posted sample draft");
}

main().catch((err) => {
  logger.fatal({ err }, "test-slack failed");
  process.exit(1);
});
