import { App, ExpressReceiver } from "@slack/bolt";
import express from "express";
import { AirtableClient } from "./clients/airtable.js";
import { AnthropicClient } from "./clients/anthropic.js";
import { BannerbearClient } from "./clients/bannerbear.js";
import { SlackClient } from "./clients/slack.js";
import { appConfig } from "./config.js";
import { processSubmission } from "./handlers/processSubmission.js";
import { registerSlackActions } from "./slack/actions.js";
import { postDraftToSlack } from "./slack/postDraft.js";
import { airtableWebhookRouter } from "./webhooks/airtable.js";
import { logger } from "./util/logger.js";

async function main(): Promise<void> {
  const { env, org } = appConfig;

  const receiver = new ExpressReceiver({
    signingSecret: env.SLACK_SIGNING_SECRET,
    endpoints: "/slack/events",
  });

  const app = new App({
    token: env.SLACK_BOT_TOKEN,
    receiver,
  });

  const airtable = new AirtableClient(env.AIRTABLE_PAT, env.AIRTABLE_BASE_ID, org.airtable);
  const anthropic = new AnthropicClient(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  const bannerbear = new BannerbearClient(env.BANNERBEAR_API_KEY);
  const slack = new SlackClient(env.SLACK_BOT_TOKEN);

  registerSlackActions(app, { airtable, orgConfig: org });

  const postDraft = (params: Parameters<typeof postDraftToSlack>[0]) =>
    postDraftToSlack(params, { airtable, slack, orgConfig: org });

  const server = receiver.app;
  server.use(express.json());
  server.use(
    airtableWebhookRouter({
      secret: env.AIRTABLE_WEBHOOK_SECRET,
      onSubmission: (recordId) =>
        processSubmission(recordId, {
          airtable,
          anthropic,
          bannerbear,
          orgConfig: org,
          postDraft,
        }),
    }),
  );

  server.get("/healthz", (_req, res) => {
    res.json({ ok: true, org: appConfig.org.orgName });
  });

  await app.start(env.PORT);

  logger.info(
    {
      port: env.PORT,
      routes: [
        "GET  /healthz",
        "POST /slack/events",
        "POST /webhooks/airtable",
      ],
      org: appConfig.org.orgName,
    },
    "flyer-bot listening",
  );
}

main().catch((err) => {
  logger.fatal({ err }, "flyer-bot failed to start");
  process.exit(1);
});
