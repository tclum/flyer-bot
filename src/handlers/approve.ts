import type { AirtableClient } from "../clients/airtable.js";
import { logger } from "../util/logger.js";

export type ApproveAirtablePort = Pick<
  AirtableClient,
  "copyDraftToFinal" | "updateStatus"
>;

export interface ApproveDeps {
  airtable: ApproveAirtablePort;
}

const STATUS_APPROVED = "Approved";

/**
 * Marks a flyer record approved: copies the Draft Flyer attachment URL into
 * Final Flyer and flips Status to Approved. Callers (Slack approve button)
 * handle UI updates.
 *
 * NOTE: the approved record stores a reference to the Bannerbear-hosted URL
 * (re-hosted by Airtable). If Bannerbear URLs ever expire, approved records
 * could lose their final image — revisit with a persistent store (S3, etc.)
 * if that becomes an issue.
 */
export async function approveDraft(
  recordId: string,
  deps: ApproveDeps,
): Promise<void> {
  const { airtable } = deps;
  await airtable.copyDraftToFinal(recordId);
  await airtable.updateStatus(recordId, STATUS_APPROVED);
  logger.info({ recordId }, "flyer approved");
}
