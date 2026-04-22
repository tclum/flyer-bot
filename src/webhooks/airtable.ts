import type { Request, Response, Router } from "express";
import express from "express";
import { logger } from "../util/logger.js";

/**
 * POST /webhooks/airtable
 *
 * Airtable will POST a payload containing the recordId of a newly-submitted
 * flyer request. We respond 202 immediately and do the generation work async.
 */
export function airtableWebhookRouter(): Router {
  const router = express.Router();

  router.post("/webhooks/airtable", (req: Request, res: Response) => {
    logger.info({ body: req.body }, "airtable webhook received");
    // TODO: validate payload with Zod, extract recordId, load submission
    //       via AirtableClient.getSubmission, call handlers/generate, then
    //       post to Slack via SlackClient + buildDraftMessage.
    res.status(202).json({ accepted: true });
  });

  return router;
}
