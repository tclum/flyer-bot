import { App, ExpressReceiver } from "@slack/bolt";
import express from "express";
import { appConfig } from "./config.js";
import { registerSlackActions } from "./slack/actions.js";
import { airtableWebhookRouter } from "./webhooks/airtable.js";
import { logger } from "./util/logger.js";

async function main(): Promise<void> {
  const { env } = appConfig;

  const receiver = new ExpressReceiver({
    signingSecret: env.SLACK_SIGNING_SECRET,
    endpoints: "/slack/events",
  });

  const app = new App({
    token: env.SLACK_BOT_TOKEN,
    receiver,
  });

  registerSlackActions(app);

  const server = receiver.app;
  server.use(express.json());
  server.use(airtableWebhookRouter());

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
