import type { AirtableClient } from "../clients/airtable.js";
import type { SlackClient } from "../clients/slack.js";

export interface ApproveDeps {
  airtable: AirtableClient;
  slack: SlackClient;
}

export interface ApproveInput {
  recordId: string;
  finalImageUrl: string;
  slackChannel: string;
  slackTs: string;
}

export async function approve(
  _input: ApproveInput,
  _deps: ApproveDeps,
): Promise<void> {
  // TODO: write finalImageUrl to Airtable (status=Approved) and update the
  //       Slack review message to show the approved flyer and hide buttons.
  throw new Error("approve handler not yet implemented");
}
