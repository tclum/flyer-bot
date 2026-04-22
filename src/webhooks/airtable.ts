import type { Request, Response, Router } from "express";
import express from "express";
import { z } from "zod";
import { logger } from "../util/logger.js";

const bodySchema = z
  .object({
    recordId: z.string().min(1),
  })
  .strict();

export interface AirtableWebhookDeps {
  secret: string;
  onSubmission: (recordId: string) => Promise<void>;
}

export function airtableWebhookRouter(deps: AirtableWebhookDeps): Router {
  const router = express.Router();

  router.post("/webhooks/airtable", (req: Request, res: Response) => {
    const provided = req.header("x-flyer-bot-secret");
    if (!provided || provided !== deps.secret) {
      logger.warn(
        { hasHeader: Boolean(provided) },
        "airtable webhook rejected: bad or missing secret",
      );
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "airtable webhook rejected: invalid body");
      res
        .status(400)
        .json({ error: "invalid body", details: parsed.error.flatten() });
      return;
    }

    const { recordId } = parsed.data;
    logger.info({ recordId }, "airtable webhook accepted");
    res.status(202).json({ accepted: true, recordId });

    // Fire-and-forget: the pipeline takes 10–30s and Airtable retries on slow
    // responses, so we ack fast and process in the background. Any crash is
    // caught here so it never surfaces as an unhandled rejection.
    void deps.onSubmission(recordId).catch((err) => {
      logger.error({ err, recordId }, "processSubmission crashed");
    });
  });

  return router;
}
