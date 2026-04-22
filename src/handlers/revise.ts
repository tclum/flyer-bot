import type { AirtableClient } from "../clients/airtable.js";
import type { OrgConfig } from "../schemas/orgConfig.js";
import { logger } from "../util/logger.js";

export type ReviseAirtablePort = Pick<
  AirtableClient,
  | "getRevisionCount"
  | "appendRevisionNotes"
  | "incrementRevisionCount"
  | "updateStatus"
>;

export interface RequestRevisionInput {
  recordId: string;
  notes: string;
  userId: string;
  userName: string;
}

export interface RequestRevisionDeps {
  airtable: ReviseAirtablePort;
  orgConfig: OrgConfig;
}

const STATUS_IN_REVISION = "In Revision";

export class RevisionLimitExceeded extends Error {
  constructor(
    public readonly recordId: string,
    public readonly limit: number,
    public readonly count: number,
  ) {
    super(
      `record ${recordId} already at revision ${count} (limit ${limit})`,
    );
    this.name = "RevisionLimitExceeded";
  }
}

/**
 * Records a reviewer's revision request against a flyer record. Caps
 * revisions at orgConfig.maxRevisions — once hit, throws
 * RevisionLimitExceeded so the Slack handler can respond with an ephemeral
 * notice without mutating record state.
 *
 * NOTE: Setting status to "In Revision" is what re-triggers regeneration.
 * This requires the Airtable automation to be configured to fire the
 * webhook on Status in {Submitted, In Revision} (see README setup).
 */
export async function requestRevision(
  input: RequestRevisionInput,
  deps: RequestRevisionDeps,
): Promise<void> {
  const { recordId, notes, userId, userName } = input;
  const { airtable, orgConfig } = deps;

  const count = await airtable.getRevisionCount(recordId);
  if (count >= orgConfig.maxRevisions) {
    logger.warn(
      { recordId, count, limit: orgConfig.maxRevisions },
      "revision request rejected: limit reached",
    );
    throw new RevisionLimitExceeded(recordId, orgConfig.maxRevisions, count);
  }

  const timestamp = new Date().toISOString();
  const prefixed = `[${timestamp}] ${userName} (${userId}): ${notes}`;

  await airtable.appendRevisionNotes(recordId, prefixed);
  await airtable.incrementRevisionCount(recordId);
  await airtable.updateStatus(recordId, STATUS_IN_REVISION);
  logger.info(
    { recordId, count: count + 1, userId },
    "revision requested; awaiting automation re-trigger",
  );
}
